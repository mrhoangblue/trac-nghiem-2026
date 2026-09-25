import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  hashExamPassword,
  parseExamDateTime,
  validateExamPassword,
  verifyExamPassword,
  type PasswordSecret,
} from "@/lib/examAccess";
import { verifyAuth } from "@/lib/verifyAuth";

export const runtime = "nodejs";

function publicMetadata(data: FirebaseFirestore.DocumentData) {
  return {
    title: data.title ?? "Bài thi",
    duration: Number(data.duration ?? 90),
    startTime: data.startTime ?? null,
    endTime: data.endTime ?? null,
    requiresPassword: Boolean(data.requiresPassword),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { examId } = await params;
    const examSnapshot = await adminDb.collection("exams").doc(examId).get();
    if (!examSnapshot.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const exam = examSnapshot.data()!;
    const metadata = publicMetadata(exam);
    const now = new Date();
    const opensAt = parseExamDateTime(exam.startTime);
    const closesAt = parseExamDateTime(exam.endTime);

    if (opensAt && now < opensAt) {
      return NextResponse.json({ error: "NOT_OPEN", metadata }, { status: 403 });
    }
    if (closesAt && now >= closesAt) {
      return NextResponse.json({ error: "CLOSED", metadata }, { status: 403 });
    }

    if (metadata.requiresPassword) {
      const body = (await request.json().catch(() => ({}))) as { password?: string };
      if (!body.password) {
        return NextResponse.json({ error: "PASSWORD_REQUIRED", metadata }, { status: 423 });
      }

      const secretSnapshot = await adminDb.collection("exam_secrets").doc(examId).get();
      const secret = secretSnapshot.data() as PasswordSecret | undefined;
      if (!secret || !verifyExamPassword(body.password, secret)) {
        return NextResponse.json({ error: "INVALID_PASSWORD", metadata }, { status: 403 });
      }
    }

    return NextResponse.json({ exam: { id: examSnapshot.id, ...exam } });
  } catch (error) {
    console.error("POST /api/exams/[examId]/access failed:", error);
    return NextResponse.json({ error: "ACCESS_FAILED" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser || !["admin", "mod"].includes(authUser.role)) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { examId } = await params;
    const examRef = adminDb.collection("exams").doc(examId);
    const examSnapshot = await examRef.get();
    if (!examSnapshot.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const exam = examSnapshot.data()!;
    if (authUser.role !== "admin" && exam.authorEmail !== authUser.email) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = (await request.json()) as {
      passwordAction?: "keep" | "set" | "remove";
      password?: string;
      startTime?: string | null;
      endTime?: string | null;
    };

    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if ("startTime" in body) updates.startTime = body.startTime || null;
    if ("endTime" in body) updates.endTime = body.endTime || null;

    const nextStart = parseExamDateTime(
      "startTime" in body ? body.startTime : exam.startTime
    );
    const nextEnd = parseExamDateTime("endTime" in body ? body.endTime : exam.endTime);
    if (nextStart && nextEnd && nextEnd <= nextStart) {
      return NextResponse.json({ error: "INVALID_TIME_RANGE" }, { status: 400 });
    }

    const batch = adminDb.batch();
    const secretRef = adminDb.collection("exam_secrets").doc(examId);

    if (body.passwordAction === "set") {
      const password = body.password ?? "";
      const validationError = validateExamPassword(password);
      if (validationError) {
        return NextResponse.json({ error: "INVALID_PASSWORD", message: validationError }, { status: 400 });
      }
      batch.set(secretRef, {
        ...hashExamPassword(password),
        updatedAt: FieldValue.serverTimestamp(),
      });
      updates.requiresPassword = true;
    } else if (body.passwordAction === "remove") {
      batch.delete(secretRef);
      updates.requiresPassword = false;
    }

    batch.update(examRef, updates);
    await batch.commit();
    return NextResponse.json({ success: true, ...publicMetadata({ ...exam, ...updates }) });
  } catch (error) {
    console.error("PATCH /api/exams/[examId]/access failed:", error);
    return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }
}
