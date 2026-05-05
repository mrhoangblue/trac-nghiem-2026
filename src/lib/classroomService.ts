/**
 * classroomService.ts — Firebase service layer for the Classroom module.
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  limit,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ClassDoc, ClassGroupDoc } from "@/utils/classroomTypes";
import type { UserProfile } from "@/lib/AuthContext";

// ── Class code generation ─────────────────────────────────────────────────────
// Charset excludes O (looks like 0) and I (looks like 1) for readability.
const CLASS_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CLASS_CODE_LENGTH = 6;

function randomCode(): string {
  let result = "";
  for (let i = 0; i < CLASS_CODE_LENGTH; i++) {
    result += CLASS_CODE_CHARS[Math.floor(Math.random() * CLASS_CODE_CHARS.length)];
  }
  return result;
}

/** Returns a collision-free 6-char class code verified against Firestore. */
export async function generateClassCode(): Promise<string> {
  const ref = collection(db, "classes");
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const snap = await getDocs(query(ref, where("classCode", "==", code), limit(1)));
    if (snap.empty) return code;
  }
  throw new Error("Không thể tạo mã lớp duy nhất — thử lại sau.");
}

// ── createClass ───────────────────────────────────────────────────────────────

export interface CreateClassInput {
  name: string;
  description?: string;
  teacherId: string;
  teacherName: string;
  groupId?: string;
  maxStudents?: number;
}

/** Creates a new class and returns both classId and the generated classCode. */
export async function createClass(
  input: CreateClassInput
): Promise<{ classId: string; classCode: string }> {
  const classCode = await generateClassCode();
  const payload: Omit<ClassDoc, "createdAt" | "updatedAt"> & {
    createdAt: unknown;
    updatedAt: unknown;
  } = {
    classCode,
    name: input.name,
    description: input.description ?? "",
    teacherId: input.teacherId,
    teacherName: input.teacherName,
    studentIds: [],
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(input.groupId && { groupId: input.groupId }),
    ...(input.maxStudents !== undefined && { maxStudents: input.maxStudents }),
  };
  const docRef = await addDoc(collection(db, "classes"), payload);
  return { classId: docRef.id, classCode };
}

// ── joinClass ─────────────────────────────────────────────────────────────────

export type JoinClassError = "NOT_FOUND" | "INACTIVE" | "FULL" | "ALREADY_JOINED";

export interface JoinClassResult {
  success: boolean;
  classId?: string;
  className?: string;
  error?: JoinClassError;
}

/**
 * Enrolls a student in a class by classCode.
 * Atomically updates `classes.studentIds` and mirrors to `class_members`.
 */
export async function joinClass(
  classCode: string,
  student: Pick<UserProfile, "uid" | "fullName" | "email">
): Promise<JoinClassResult> {
  const normalised = classCode.toUpperCase().trim();
  const snap = await getDocs(
    query(collection(db, "classes"), where("classCode", "==", normalised), limit(1))
  );
  if (snap.empty) return { success: false, error: "NOT_FOUND" };

  const classDocSnap = snap.docs[0];
  const data = classDocSnap.data() as ClassDoc;

  if (!data.isActive) return { success: false, error: "INACTIVE" };
  if (data.studentIds.includes(student.uid)) return { success: false, error: "ALREADY_JOINED" };
  if (data.maxStudents !== undefined && data.studentIds.length >= data.maxStudents) {
    return { success: false, error: "FULL" };
  }

  await updateDoc(classDocSnap.ref, {
    studentIds: arrayUnion(student.uid),
    updatedAt: serverTimestamp(),
  });

  await setDoc(
    doc(db, "class_members", `${classDocSnap.id}_${student.uid}`),
    {
      classId: classDocSnap.id,
      studentId: student.uid,
      studentName: student.fullName,
      studentEmail: student.email,
      joinedAt: serverTimestamp(),
      status: "active",
    },
    { merge: true }
  );

  return { success: true, classId: classDocSnap.id, className: data.name };
}

// ── searchTeachers ────────────────────────────────────────────────────────────

/**
 * Searches MOD/admin users via the `searchKeywords` array-contains index.
 *
 * Requires a Firestore composite index:
 *   Collection: users | Fields: role (ASC), searchKeywords (ARRAY)
 *
 * Teachers must have the `searchKeywords` field populated in their user doc
 * (via buildSearchKeywords()) for them to appear in results.
 */
export async function searchTeachers(rawQuery: string): Promise<UserProfile[]> {
  const keyword = removeDiacritics(rawQuery.trim().toLowerCase());
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

// ── buildSearchKeywords ───────────────────────────────────────────────────────

/**
 * Generates the `searchKeywords` array for a MOD user's Firestore doc.
 * Merge this into their user document whenever they update their profile.
 */
export function buildSearchKeywords(
  fullName: string,
  email: string,
  phoneNumber?: string
): string[] {
  const keywords = new Set<string>();
  const addTokens = (text: string) => {
    const norm = removeDiacritics(text.toLowerCase().trim());
    if (norm) keywords.add(norm);
    norm.split(/\s+/).forEach((t) => t.length >= 2 && keywords.add(t));
  };
  addTokens(fullName);
  if (email) keywords.add(email.toLowerCase().trim());
  if (phoneNumber) {
    keywords.add(phoneNumber.trim());
    const digitsOnly = phoneNumber.replace(/\D/g, "");
    if (digitsOnly) keywords.add(digitsOnly);
  }
  return Array.from(keywords);
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
