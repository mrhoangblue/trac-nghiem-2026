import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { hashExamPassword, parseExamDateTime, validateExamPassword } from "@/lib/examAccess";
import {
  deleteExamSource,
  normalizeRawLatex,
  storeExamSource,
  type ExamSourceReference,
} from "@/lib/examSourceStorage";
import { verifyAuth } from "@/lib/verifyAuth";
import type { ParsedQuestion } from "@/utils/latexParser";

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_FIRESTORE_QUESTIONS_BYTES = 850 * 1024;

interface UpdateExamBody {
  title?: unknown;
  questions?: unknown;
  scoringConfig?: { part1TotalScore?: unknown; part3TotalScore?: unknown };
  duration?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  rawLatex?: unknown;
  tikzProcessed?: unknown;
  tikzImageCount?: unknown;
  maxRetries?: unknown;
  gradeLevel?: unknown;
  examType?: unknown;
  targetType?: unknown;
  targetClassIds?: unknown;
  isShared?: unknown;
  passwordAction?: unknown;
  password?: unknown;
}

function optionalDate(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  return parseExamDateTime(value) ? value : undefined;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser || !["admin", "mod"].includes(authUser.role)) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { examId } = await params;
    const examRef = adminDb.collection("exams").doc(examId);
    const examSnapshot = await examRef.get();
    if (!examSnapshot.exists) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const current = examSnapshot.data() ?? {};
    const currentAuthor = typeof current.authorEmail === "string" ? current.authorEmail.toLowerCase() : "";
    if (authUser.role !== "admin" && currentAuthor && currentAuthor !== authUser.email.toLowerCase()) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = await request.json() as UpdateExamBody;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 240 || !Array.isArray(body.questions)) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    const questions = body.questions as ParsedQuestion[];
    if (questions.length === 0 || questions.length > 300) {
      return NextResponse.json({ error: "INVALID_QUESTION_COUNT" }, { status: 400 });
    }
    if (Buffer.byteLength(JSON.stringify(questions), "utf8") > MAX_FIRESTORE_QUESTIONS_BYTES) {
      return NextResponse.json(
        { error: "EXAM_DOCUMENT_TOO_LARGE", message: "Nội dung câu hỏi vượt giới hạn an toàn của Firestore." },
        { status: 413 },
      );
    }
    const startTime = optionalDate(body.startTime);
    const endTime = optionalDate(body.endTime);
    if (startTime === undefined || endTime === undefined) {
      return NextResponse.json({ error: "INVALID_TIME" }, { status: 400 });
    }
    const startsAt = parseExamDateTime(startTime);
    const endsAt = parseExamDateTime(endTime);
    if (startsAt && endsAt && endsAt <= startsAt) {
      return NextResponse.json({ error: "INVALID_TIME_RANGE" }, { status: 400 });
    }

    const passwordAction = ["keep", "set", "remove"].includes(String(body.passwordAction))
      ? String(body.passwordAction) as "keep" | "set" | "remove"
      : "keep";
    const password = typeof body.password === "string" ? body.password : "";
    if (passwordAction === "set") {
      const passwordError = validateExamPassword(password);
      if (passwordError) return NextResponse.json({ error: "INVALID_PASSWORD", message: passwordError }, { status: 400 });
    }

    const part1 = questions.filter((question) => question.type === "multiple_choice").length;
    const part2 = questions.filter((question) => question.type === "true_false").length;
    const part3 = questions.filter((question) => question.type === "short_answer").length;
    const targetType = body.targetType === "classes" ? "classes" : "all";
    const targetClassIds = targetType === "classes" && Array.isArray(body.targetClassIds)
      ? body.targetClassIds.filter((value): value is string => typeof value === "string" && value.length <= 160).slice(0, 100)
      : [];
    const updates: Record<string, unknown> = {
      title,
      questions,
      questionCount: questions.length,
      part1Count: part1,
      part2Count: part2,
      part3Count: part3,
      scoringConfig: {
        part1TotalScore: Number(body.scoringConfig?.part1TotalScore ?? 3),
        part3TotalScore: Number(body.scoringConfig?.part3TotalScore ?? 3),
      },
      duration: Math.max(1, Math.min(600, Number(body.duration ?? 90))),
      startTime,
      endTime,
      tikzProcessed: Boolean(body.tikzProcessed),
      tikzImageCount: Math.max(0, Number(body.tikzImageCount ?? 0)),
      maxRetries: Math.max(1, Math.min(100, Number(body.maxRetries ?? 1))),
      gradeLevel: typeof body.gradeLevel === "string" ? body.gradeLevel.slice(0, 80) : "",
      examType: typeof body.examType === "string" ? body.examType.slice(0, 120) : null,
      targetType,
      targetClassIds,
      isShared: Boolean(body.isShared),
      authorEmail: currentAuthor || authUser.email,
      updatedAt: FieldValue.serverTimestamp(),
    };

    let nextSource: ExamSourceReference | null = null;
    if ("rawLatex" in body) {
      const normalizedRawLatex = normalizeRawLatex(body.rawLatex);
      if (!normalizedRawLatex) {
        return NextResponse.json({ error: "INVALID_LATEX_SOURCE" }, { status: 400 });
      }
      nextSource = await storeExamSource({
        examId,
        rawLatex: normalizedRawLatex,
        uploadedBy: authUser.uid,
      });
      updates.rawLatexSource = nextSource;
      updates.rawLatex = FieldValue.delete();
    }

    const batch = adminDb.batch();
    const secretRef = adminDb.collection("exam_secrets").doc(examId);
    if (passwordAction === "set") {
      batch.set(secretRef, { ...hashExamPassword(password), updatedAt: FieldValue.serverTimestamp() });
      updates.requiresPassword = true;
    } else if (passwordAction === "remove") {
      batch.delete(secretRef);
      updates.requiresPassword = false;
    }
    batch.update(examRef, updates);
    try {
      await batch.commit();
    } catch (error) {
      await deleteExamSource(nextSource).catch(() => undefined);
      throw error;
    }
    if (nextSource && current.rawLatexSource) {
      await deleteExamSource(current.rawLatexSource).catch((error) => {
        console.error("Failed to delete previous exam source:", error);
      });
    }
    return NextResponse.json({ success: true, id: examId });
  } catch (error) {
    console.error("PATCH /api/exams/[examId] failed:", error);
    return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser || !["admin", "mod"].includes(authUser.role)) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const { examId } = await params;
    const examRef = adminDb.collection("exams").doc(examId);
    const snapshot = await examRef.get();
    if (!snapshot.exists) return NextResponse.json({ success: true });
    const exam = snapshot.data() ?? {};
    const authorEmail = String(exam.authorEmail ?? "").trim().toLowerCase();
    if (authUser.role !== "admin" && authorEmail !== authUser.email.toLowerCase()) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const batch = adminDb.batch();
    batch.delete(examRef);
    batch.delete(adminDb.collection("exam_secrets").doc(examId));
    await batch.commit();
    await deleteExamSource(exam.rawLatexSource).catch((error) => {
      console.error("Failed to delete exam source after exam removal:", error);
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/exams/[examId] failed:", error);
    return NextResponse.json({ error: "DELETE_FAILED" }, { status: 500 });
  }
}
