/**
 * classroomService.ts — Firebase service layer for the Classroom module.
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ClassDoc, ClassGroupDoc } from "@/utils/classroomTypes";
import type { UserProfile } from "@/lib/AuthContext";
import { generateSearchKeywords, normalizeTeacherSearchInput } from "@/utils/searchKeywords";

// ── createClass ───────────────────────────────────────────────────────────────

export interface CreateClassInput {
  name: string;
  description?: string;
  maxStudents?: number;
}

export type CreateClassError =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "UNAUTHENTICATED"
  | "CREATE_FAILED";

export type CreateClassResult =
  | { success: true; classId: string; classCode: string; name: string }
  | { success: false; error: CreateClassError };

/** Creates a class through the authenticated server API. */
export async function createClass(
  input: CreateClassInput,
  idToken: string
): Promise<CreateClassResult> {
  const response = await fetch("/api/classes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => null)) as
    | { classId?: string; classCode?: string; name?: string; error?: CreateClassError }
    | null;

  if (
    response.ok &&
    payload?.classId &&
    payload.classCode &&
    payload.name
  ) {
    return {
      success: true,
      classId: payload.classId,
      classCode: payload.classCode,
      name: payload.name,
    };
  }

  return { success: false, error: payload?.error ?? "CREATE_FAILED" };
}

// ── joinClass ─────────────────────────────────────────────────────────────────

export type JoinClassError =
  | "NOT_FOUND"
  | "INACTIVE"
  | "FULL"
  | "ALREADY_JOINED"
  | "ALREADY_PENDING"
  | "SUSPENDED"
  | "STUDENT_ONLY"
  | "UNAUTHENTICATED"
  | "JOIN_FAILED";

export interface JoinClassResult {
  success: boolean;
  classId?: string;
  className?: string;
  error?: JoinClassError;
}

/**
 * Submits a join request by class code. The teacher must approve it.
 */
export async function joinClass(
  classCode: string,
  idToken: string
): Promise<JoinClassResult> {
  return requestClassMembership({ classCode: classCode.toUpperCase().trim() }, idToken);
}

// ── getClassById ──────────────────────────────────────────────────────────────

/** Fetches a class document by its Firestore document ID. Returns null if not found. */
export async function getClassById(classId: string): Promise<(ClassDoc & { id: string }) | null> {
  const snap = await getDoc(doc(db, "classes", classId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as ClassDoc) };
}

// ── deleteClass ───────────────────────────────────────────────────────────────

export type DeleteClassError = "NOT_FOUND" | "FORBIDDEN" | "UNAUTHENTICATED" | "DELETE_FAILED";

export interface DeleteClassResult {
  success: boolean;
  error?: DeleteClassError;
}

/**
 * Deletes a class through the authenticated server API. The server verifies
 * ownership and cleans up mirrored membership documents with Admin SDK.
 */
export async function deleteClass(
  classId: string,
  idToken: string
): Promise<DeleteClassResult> {
  const response = await fetch(`/api/classes/${encodeURIComponent(classId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (response.ok) return { success: true };

  const payload = (await response.json().catch(() => null)) as { error?: DeleteClassError } | null;
  return { success: false, error: payload?.error ?? "DELETE_FAILED" };
}

// ── joinClassById ─────────────────────────────────────────────────────────────

/**
 * Submits a join request from a class-specific link.
 */
export async function joinClassById(
  classId: string,
  idToken: string
): Promise<JoinClassResult> {
  return requestClassMembership({ classId }, idToken);
}

async function requestClassMembership(
  input: { classCode?: string; classId?: string },
  idToken: string
): Promise<JoinClassResult> {
  const response = await fetch("/api/classes/join", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as
    | { classId?: string; className?: string; error?: JoinClassError }
    | null;
  if (response.ok) {
    return { success: true, classId: payload?.classId, className: payload?.className };
  }
  return { success: false, error: payload?.error ?? "JOIN_FAILED" };
}

// ── searchTeachers ────────────────────────────────────────────────────────────

/**
 * Searches MOD/admin users via the `searchKeywords` array-contains index.
 *
 * Requires a Firestore composite index:
 *   Collection: users | Fields: role (ASC), searchKeywords (ARRAY)
 *
 * Teachers must have the `searchKeywords` field populated in their user doc
 * (via generateSearchKeywords()) for them to appear in results.
 */
export async function searchTeachers(rawQuery: string): Promise<UserProfile[]> {
  const keyword = normalizeTeacherSearchInput(rawQuery);
  if (keyword.length < 2) return [];

  const snap = await getDocs(
    query(
      collection(db, "users"),
      where("role", "in", ["mod", "admin"]),
      where("searchKeywords", "array-contains", keyword),
      limit(20)
    )
  );
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile));
}

/** @deprecated Use generateSearchKeywords from @/utils/searchKeywords */
export function buildSearchKeywords(
  fullName: string,
  email: string,
  phoneNumber?: string
): string[] {
  return generateSearchKeywords(fullName, email, phoneNumber);
}

// ── removeDiacritics ──────────────────────────────────────────────────────────

/** Vietnamese-aware diacritic stripping. NFD + combining mark removal + đ/Đ. */
export function removeDiacritics(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"));
}

// ── createClassGroup ──────────────────────────────────────────────────────────

export async function createClassGroup(
  name: string,
  ownerId: string,
  description?: string
): Promise<string> {
  const payload: Omit<ClassGroupDoc, "createdAt" | "updatedAt"> & {
    createdAt: unknown;
    updatedAt: unknown;
  } = {
    name,
    description: description ?? "",
    ownerId,
    classIds: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, "class_groups"), payload);
  return ref.id;
}
