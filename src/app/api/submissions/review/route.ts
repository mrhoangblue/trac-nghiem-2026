import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";
import { resolveExamQuestions } from "@/lib/examAnswerKey";
import { parseExamDateTime } from "@/lib/examAccess";

export const runtime = "nodejs";

/**
 * Đề kèm đáp án và lời giải để học sinh xem lại bài của CHÍNH MÌNH.
 * Chỉ trả khi bài đã nộp; đề có tự luận thì phải chờ giáo viên chấm xong.
 * Câu hỏi giữ thứ tự gốc; máy khách tự dựng lại bản đề theo mã đề đã làm.
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser?.email) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const submissionId = request.nextUrl.searchParams.get("submissionId")?.trim();
    if (!submissionId) {
      return NextResponse.json({ error: "SUBMISSION_ID_REQUIRED" }, { status: 400 });
    }

    const submissionSnapshot = await adminDb.collection("submissions").doc(submissionId).get();
    const submission = submissionSnapshot.data();
    // Không phân biệt "không tồn tại" và "của người khác" để không dò được mã bài nộp.
    if (!submission || String(submission.studentEmail ?? "").toLowerCase() !== authUser.email.toLowerCase()) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (submission.status !== "COMPLETED") {
      return NextResponse.json({ error: "NOT_SUBMITTED" }, { status: 409 });
    }
    if (submission.gradingStatus === "pending") {
      return NextResponse.json({ error: "GRADING_PENDING", examTitle: submission.examTitle ?? null }, { status: 423 });
    }

    const examSnapshot = await adminDb.collection("exams").doc(String(submission.examId ?? "")).get();
    if (!examSnapshot.exists) {
      return NextResponse.json({ error: "EXAM_NOT_FOUND" }, { status: 404 });
    }
    const exam = examSnapshot.data() ?? {};

    // Đề có giờ đóng: giữ đáp án đến khi đề đóng, nếu không học sinh nộp trắng rồi
    // lấy đáp án chuyển cho bạn đang làm. Bài thử của giáo viên không bị giữ.
    const closesAt = parseExamDateTime(exam.endTime);
    if (closesAt && Date.now() < closesAt.getTime() && submission.isTeacherPreview !== true) {
      return NextResponse.json(
        { error: "ANSWERS_NOT_RELEASED", examTitle: submission.examTitle ?? null, releaseAtMillis: closesAt.getTime() },
        { status: 423 },
      );
    }

    return NextResponse.json({
      examId: examSnapshot.id,
      examTitle: submission.examTitle ?? exam.title ?? "Bài thi",
      structure: exam.structure ?? null,
      versioning: exam.versioning ?? null,
      scoringConfig: exam.scoringConfig ?? null,
      examCode: typeof submission.examCode === "string" ? submission.examCode : null,
      gradingStatus: submission.gradingStatus ?? null,
      questions: resolveExamQuestions(exam),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/submissions/review failed:", error);
    return NextResponse.json({ error: "REVIEW_LOAD_FAILED" }, { status: 500 });
  }
}
