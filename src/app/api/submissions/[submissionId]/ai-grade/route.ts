import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { AiGradingError, aiGradingConfigured, gradeEssayWithAI, type AiGradingQuestion } from "@/lib/aiGrading";
import { essayFiles, loadSubmissionForUser } from "@/lib/essaySubmission";
import { verifyAuth } from "@/lib/verifyAuth";
import { essayQuestionPoints } from "@/utils/examStructure";
import type { AiGradingResult } from "@/utils/aiGradingTypes";
import type { ParsedQuestion } from "@/utils/latexParser";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Mỗi bài chỉ chạy một lượt chấm AI tại một thời điểm; lượt treo quá lâu coi như đã hỏng. */
const RUNNING_LOCK_MS = 5 * 60 * 1000;
/** Kết quả AI lưu riêng, không nằm trong tài liệu bài nộp mà học sinh đọc được. */
const collection = () => adminDb.collection("essay_ai_grading");

async function loadForGrader(request: NextRequest, submissionId: string) {
  const authUser = await verifyAuth(request);
  if (!authUser?.email) return { error: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }) } as const;
  const loaded = await loadSubmissionForUser(submissionId, authUser);
  if (!loaded?.isGrader) return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) } as const;
  return { authUser, loaded } as const;
}

function storedResult(data: FirebaseFirestore.DocumentData | undefined): AiGradingResult | null {
  const result = data?.result as AiGradingResult | undefined;
  return result && Array.isArray(result.questions) ? result : null;
}

/** Kết quả chấm AI đã lưu của một bài (null nếu chưa chấm). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
  try {
    const { submissionId } = await params;
    const context = await loadForGrader(request, submissionId);
    if ("error" in context) return context.error;
    const snapshot = await collection().doc(submissionId).get();
    return NextResponse.json({ configured: aiGradingConfigured(), result: storedResult(snapshot.data()) });
  } catch (error) {
    console.error("GET ai-grade failed:", error);
    return NextResponse.json({ error: "AI_GRADE_LOAD_FAILED" }, { status: 500 });
  }
}

/** Giáo viên tác giả đề hoặc admin yêu cầu AI chấm nháp phần tự luận của một bài. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  let locked = false;
  try {
    const context = await loadForGrader(request, submissionId);
    if ("error" in context) return context.error;
    const { authUser, loaded: { data, exam } } = context;
    if (!aiGradingConfigured()) return NextResponse.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
    if (data.status !== "COMPLETED" || (data.gradingStatus !== "pending" && data.gradingStatus !== "graded")) {
      return NextResponse.json({ error: "NOT_GRADABLE" }, { status: 409 });
    }
    const files = essayFiles(data);
    if (files.length === 0) return NextResponse.json({ error: "NO_FILES" }, { status: 409 });

    const allQuestions = Array.isArray(exam.questions) ? exam.questions as ParsedQuestion[] : [];
    const maxPoints = essayQuestionPoints(allQuestions, Number(exam.scoringConfig?.part4TotalScore ?? 0));
    const questions: AiGradingQuestion[] = allQuestions.flatMap((question, index) => question.type === "essay" ? [{
      id: question.id,
      number: index + 1,
      max: maxPoints.get(question.id) ?? 0,
      questionText: String(question.questionText ?? ""),
      answer: typeof question.correctAnswer === "string" ? question.correctAnswer : "",
      guidance: String(question.explanation ?? ""),
      rubric: Array.isArray(question.rubric) ? question.rubric : [],
    }] : []);
    if (questions.length === 0) return NextResponse.json({ error: "NO_ESSAY_QUESTIONS" }, { status: 409 });

    const ref = collection().doc(submissionId);
    const busy = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const startedAt = (snapshot.data()?.runningSince as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
      if (Date.now() - startedAt < RUNNING_LOCK_MS) return true;
      transaction.set(ref, { submissionId, examId: data.examId, runningSince: FieldValue.serverTimestamp(), requestedBy: authUser.email }, { merge: true });
      return false;
    });
    if (busy) return NextResponse.json({ error: "ALREADY_RUNNING" }, { status: 409 });
    locked = true;

    const result = await gradeEssayWithAI({ questions, files });
    await ref.set({ result, runningSince: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    locked = false;
    return NextResponse.json({ result });
  } catch (error) {
    if (locked) await collection().doc(submissionId).set({ runningSince: FieldValue.delete() }, { merge: true }).catch(() => undefined);
    if (error instanceof AiGradingError) {
      console.error("AI grading failed:", error.message);
      const status = error.code === "RATE_LIMITED" ? 429 : error.code === "FILES_TOO_LARGE" ? 413 : error.code === "AI_NOT_CONFIGURED" ? 503 : 502;
      return NextResponse.json({ error: error.code }, { status });
    }
    console.error("POST ai-grade failed:", error);
    return NextResponse.json({ error: "AI_GRADE_FAILED" }, { status: 500 });
  }
}
