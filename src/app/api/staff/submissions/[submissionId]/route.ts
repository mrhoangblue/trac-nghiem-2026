import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";
import { resolveExamQuestions } from "@/lib/examAnswerKey";

export const runtime = "nodejs";

/**
 * Bài làm của một học sinh kèm đề đầy đủ (có đáp án) cho giáo viên xem lại.
 * Chỉ admin hoặc tác giả của đề được xem, giống danh sách bài nộp của đề.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser?.email || !["admin", "mod"].includes(authUser.role)) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { submissionId } = await params;
    const submissionSnapshot = await adminDb.collection("submissions").doc(submissionId).get();
    const submission = submissionSnapshot.data();
    if (!submission) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const examSnapshot = await adminDb.collection("exams").doc(String(submission.examId ?? "")).get();
    if (!examSnapshot.exists) return NextResponse.json({ error: "EXAM_NOT_FOUND" }, { status: 404 });
    const exam = examSnapshot.data() ?? {};

    if (
      authUser.role !== "admin"
      && String(exam.authorEmail ?? "").toLowerCase() !== authUser.email.toLowerCase()
    ) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const list = (value: unknown) => (Array.isArray(value) ? value : []);
    return NextResponse.json({
      submission: {
        id: submissionSnapshot.id,
        examId: String(submission.examId ?? ""),
        examTitle: submission.examTitle ?? null,
        examCode: typeof submission.examCode === "string" ? submission.examCode : null,
        gradingStatus: submission.gradingStatus === "pending" || submission.gradingStatus === "graded" ? submission.gradingStatus : null,
        answersJson: typeof submission.answersJson === "string" ? submission.answersJson : "{}",
        scores: submission.scores && typeof submission.scores === "object" ? submission.scores : null,
        activityLog: list(submission.activityLog),
        questionTimings: list(submission.questionTimings),
        hasActivity: Array.isArray(submission.activityLog) || Array.isArray(submission.questionTimings),
        totalElapsedSeconds: Number(submission.totalElapsedSeconds ?? 0),
        lastInteractionAtSeconds: Number(submission.lastInteractionAtSeconds ?? 0),
        idleBeforeSubmitSeconds: Number(submission.idleBeforeSubmitSeconds ?? 0),
      },
      exam: {
        title: exam.title ?? "Bài thi",
        structure: exam.structure ?? null,
        versioning: exam.versioning ?? null,
        scoringConfig: exam.scoringConfig ?? null,
        questions: resolveExamQuestions(exam),
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/staff/submissions/[submissionId] failed:", error);
    return NextResponse.json({ error: "SUBMISSION_LOAD_FAILED" }, { status: 500 });
  }
}
