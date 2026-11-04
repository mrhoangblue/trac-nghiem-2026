import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";
import { normalizeAnswer } from "@/utils/examTypes";
import { ESSAY_UPLOAD_GRACE_MINUTES, hasEssayPart } from "@/utils/examStructure";
import { uploadWindow } from "@/lib/essaySubmission";
import { pickVersionCode, versionCodes } from "@/utils/examVersions";
import { isClassOnly } from "@/utils/examAudience";
import { parseExamDateTime, verifyExamPassword, type PasswordSecret } from "@/lib/examAccess";
import { resolveExamQuestions } from "@/lib/examAnswerKey";

export const runtime = "nodejs";

type AnswerMap = Record<string, unknown>;

// Kiểm tra kiểu và độ dài của body trước khi dùng; giá trị số còn được kẹp lại ở phía dưới.
const SubmitExamBody = z.object({
  action: z.enum(["start", "submit"]).nullish(),
  examId: z.string().trim().min(1).max(128),
  submissionId: z.string().max(128).nullish(),
  studentName: z.string().max(400).nullish(),
  studentAvatar: z.string().max(2000).nullish(),
  answersJson: z.string().max(500_000).nullish(),
  cheatCount: z.number().nullish(),
  activityLog: z.array(z.unknown()).max(5000).nullish(),
  questionTimings: z.array(z.unknown()).max(5000).nullish(),
  totalElapsedSeconds: z.number().nullish(),
  idleBeforeSubmitSeconds: z.number().nullish(),
  lastInteractionAtSeconds: z.number().nullish(),
  isTeacherPreview: z.boolean().nullish(),
  exitedEarly: z.boolean().nullish(),
  password: z.string().max(200).nullish(),
});

function timestampMillis(value: unknown): number | null {
  return (value as { toMillis?: () => number } | null)?.toMillis?.() ?? null;
}

function asRecord(value: unknown): AnswerMap {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as AnswerMap
    : {};
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampInteger(value: unknown, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(finiteNumber(value))));
}

function safeEvents(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, 500) : [];
}


type StartDenial = { error: string; status: number };

/**
 * Kiểm tra quyền bắt đầu làm đề ở máy chủ (không tin việc client đã qua /access):
 * lớp được giao, giờ mở/đóng, mật khẩu, số lượt làm tối đa.
 */
async function checkStartAllowed(params: {
  examId: string;
  exam: FirebaseFirestore.DocumentData;
  uid: string;
  password: unknown;
  completedCount: number;
}): Promise<StartDenial | null> {
  const { examId, exam, uid, password, completedCount } = params;

  if (isClassOnly(exam.targetType, exam.targetClassIds)) {
    const targets = new Set<string>(exam.targetClassIds);
    const memberships = await adminDb.collection("classes").where("studentIds", "array-contains", uid).select().get();
    if (!memberships.docs.some((item) => targets.has(item.id))) {
      return { error: "NOT_IN_CLASS", status: 403 };
    }
  }

  const now = new Date();
  const opensAt = parseExamDateTime(exam.startTime);
  const closesAt = parseExamDateTime(exam.endTime);
  if (opensAt && now < opensAt) return { error: "NOT_OPEN", status: 403 };
  if (closesAt && now >= closesAt) return { error: "CLOSED", status: 403 };

  if (exam.requiresPassword) {
    if (typeof password !== "string" || !password) return { error: "PASSWORD_REQUIRED", status: 423 };
    const secretSnapshot = await adminDb.collection("exam_secrets").doc(examId).get();
    const secret = secretSnapshot.data() as PasswordSecret | undefined;
    if (!secret || !verifyExamPassword(password, secret)) return { error: "INVALID_PASSWORD", status: 403 };
  }

  const maxRetries = finiteNumber(exam.maxRetries, 1);
  if (maxRetries > 0 && completedCount >= maxRetries) {
    return { error: "MAX_RETRIES_REACHED", status: 403 };
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser?.email) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const examId = request.nextUrl.searchParams.get("examId")?.trim();
    if (!examId) {
      return NextResponse.json({ error: "EXAM_ID_REQUIRED" }, { status: 400 });
    }

    // Query only by examId (single-field index), then enforce ownership on the
    // server. This avoids fragile client-side composite-index queries while
    // never exposing another student's answers.
    const snapshot = await adminDb.collection("submissions").where("examId", "==", examId).get();
    const owned = snapshot.docs
      .map((document) => ({ id: document.id, data: document.data() }))
      .filter(({ data }) => String(data.studentEmail ?? "").toLowerCase() === authUser.email.toLowerCase());
    const completedCount = owned.filter(({ data }) =>
      data.status === "COMPLETED" && data.isTeacherPreview !== true
    ).length;
    const inProgress = owned
      .filter(({ data }) => data.status === "IN_PROGRESS")
      .sort((left, right) => (
        timestampMillis(right.data.lastActivityAt)
        ?? timestampMillis(right.data.examStartTime)
        ?? 0
      ) - (
        timestampMillis(left.data.lastActivityAt)
        ?? timestampMillis(left.data.examStartTime)
        ?? 0
      ))[0];
    // Bài đã nộp Phần I–III, còn trong thời gian bổ sung ảnh tự luận: tải lại trang thì quay về bước nộp ảnh.
    const essayStage = owned.find(({ data }) => uploadWindow(data).open && data.status === "COMPLETED");

    return NextResponse.json({
      completedCount,
      essayUpload: essayStage ? {
        id: essayStage.id,
        uploadDeadlineMillis: uploadWindow(essayStage.data).deadline,
      } : null,
      inProgress: inProgress ? {
        id: inProgress.id,
        answersJson: typeof inProgress.data.answersJson === "string" ? inProgress.data.answersJson : "{}",
        examStartTimeMillis: timestampMillis(inProgress.data.examStartTime),
        activityLog: safeEvents(inProgress.data.activityLog),
        questionTimings: safeEvents(inProgress.data.questionTimings),
        lastInteractionAtSeconds: clampInteger(inProgress.data.lastInteractionAtSeconds, 0, 7 * 24 * 60 * 60),
        currentQuestionIndex: clampInteger(inProgress.data.currentQuestionIndex, 0, 299),
        examCode: typeof inProgress.data.examCode === "string" ? inProgress.data.examCode : null,
      } : null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/submissions failed:", error);
    return NextResponse.json({ error: "SUBMISSION_STATE_LOAD_FAILED" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser?.email) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const parsedBody = SubmitExamBody.safeParse(await request.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }
    const body = parsedBody.data;
    const examId = body.examId;

    const examSnapshot = await adminDb.collection("exams").doc(examId).get();
    if (!examSnapshot.exists) {
      return NextResponse.json({ error: "EXAM_NOT_FOUND" }, { status: 404 });
    }
    const exam = examSnapshot.data() ?? {};
    // Chấm trên đúng bộ câu hỏi mà học sinh được nhận (xem examAnswerKey).
    const questions = resolveExamQuestions(exam);

    if (body.action === "start") {
      const isStaff = ["admin", "mod"].includes(authUser.role);
      const isTeacherPreview = Boolean(body.isTeacherPreview && isStaff);
      const existingSnapshot = await adminDb.collection("submissions").where("examId", "==", examId).get();
      const existing = existingSnapshot.docs.find((document) => {
        const data = document.data();
        return data.status === "IN_PROGRESS"
          && String(data.studentEmail ?? "").toLowerCase() === authUser.email.toLowerCase()
          && Boolean(data.isTeacherPreview) === isTeacherPreview;
      });
      if (existing) {
        const examCode = existing.data().examCode;
        return NextResponse.json({ id: existing.id, resumed: true, examCode: typeof examCode === "string" ? examCode : null });
      }
      if (!isStaff) {
        const completedCount = existingSnapshot.docs.filter((document) => {
          const data = document.data();
          return data.status === "COMPLETED"
            && data.isTeacherPreview !== true
            && String(data.studentEmail ?? "").toLowerCase() === authUser.email.toLowerCase();
        }).length;
        const denial = await checkStartAllowed({
          examId,
          exam,
          uid: authUser.uid,
          password: body.password,
          completedCount,
        });
        if (denial) return NextResponse.json({ error: denial.error }, { status: denial.status });
      }
      // Đề trộn nhiều mã: chia đều mã cho các lượt làm của đề này.
      const examCode = pickVersionCode(
        versionCodes(exam.versioning),
        existingSnapshot.docs.map((document) => document.data().examCode as string | undefined),
      );

      const sessionRef = adminDb.collection("submissions").doc();
      await sessionRef.set({
        examId,
        examTitle: String(exam.title ?? "Bài thi"),
        studentName: String(body.studentName ?? "Học sinh").slice(0, 160),
        studentEmail: authUser.email,
        studentAvatar: String(body.studentAvatar ?? "").slice(0, 1000),
        status: "IN_PROGRESS",
        examStartTime: FieldValue.serverTimestamp(),
        activityLog: [],
        questionTimings: [],
        lastInteractionAtSeconds: 0,
        currentQuestionIndex: 0,
        ...(examCode ? { examCode } : {}),
        ...(isTeacherPreview ? { isTeacherPreview: true } : {}),
      });
      return NextResponse.json({ id: sessionRef.id, resumed: false, examCode }, { status: 201 });
    }

    const callerIsStaff = ["admin", "mod"].includes(authUser.role);
    // Bài nộp phải gắn với một phiên đã bắt đầu qua action "start" (đã qua kiểm tra
    // giờ/lớp/mật khẩu/lượt làm). Giáo viên xem thử thì được tạo mới như trước.
    let sessionRef: FirebaseFirestore.DocumentReference | null = null;
    const requestedId = body.submissionId?.trim();
    if (requestedId) {
      const candidate = adminDb.collection("submissions").doc(requestedId);
      const candidateSnapshot = await candidate.get();
      const candidateData = candidateSnapshot.data();
      const ownedByCaller = candidateSnapshot.exists
        && String(candidateData?.studentEmail ?? "").toLowerCase() === authUser.email.toLowerCase()
        && candidateData?.examId === examId;
      if (ownedByCaller && candidateData?.status === "COMPLETED") {
        // Gửi lại do mạng chập chờn: trả kết quả đã chấm, không chấm/ghi đè lần hai.
        const savedUpload = uploadWindow(candidateData);
        if (savedUpload.open) {
          return NextResponse.json({ id: candidate.id, essayUpload: { uploadDeadlineMillis: savedUpload.deadline } });
        }
        // Đề tự luận chưa chấm xong thì chưa công bố điểm tạm tính.
        return NextResponse.json({ id: candidate.id, scores: candidateData.gradingStatus === "pending" ? null : candidateData.scores ?? null });
      }
      if (ownedByCaller && candidateData?.status === "IN_PROGRESS") sessionRef = candidate;
    }
    if (!sessionRef && !callerIsStaff) {
      return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 409 });
    }

    let parsedAnswers: Record<string, AnswerMap> = {};
    try {
      parsedAnswers = asRecord(JSON.parse(body.answersJson ?? "{}")) as Record<string, AnswerMap>;
    } catch {
      return NextResponse.json({ error: "INVALID_ANSWERS" }, { status: 400 });
    }
    const p1Ans = asRecord(parsedAnswers.p1Ans);
    const p2Ans = asRecord(parsedAnswers.p2Ans);
    const p3Ans = asRecord(parsedAnswers.p3Ans);
    const p1Questions = questions.filter((question) => question?.type === "multiple_choice");
    const p2Questions = questions.filter((question) => question?.type === "true_false");
    const p3Questions = questions.filter((question) => question?.type === "short_answer");

    const p1Results = p1Questions.map((question) => (
      finiteNumber(p1Ans[String(question.id)], Number.NaN) === finiteNumber(question.correctAnswer, Number.NaN)
    ));
    const part1TotalScore = finiteNumber(exam.scoringConfig?.part1TotalScore, 3);
    const p1 = p1Questions.length > 0
      ? p1Results.filter(Boolean).length * part1TotalScore / p1Questions.length
      : 0;

    const p2Results = p2Questions.map((question) => {
      const correct = Array.isArray(question.correctAnswer) ? question.correctAnswer as unknown[] : [];
      const storedAnswer = p2Ans[String(question.id)];
      const student = Array.isArray(storedAnswer) ? storedAnswer as unknown[] : [];
      return correct.filter((answer: unknown, index: number) => answer === student[index]).length;
    });
    const p2Table = [0, 0.1, 0.25, 0.5, 1];
    const p2 = p2Results.reduce((sum, matches) => sum + (p2Table[matches] ?? 0), 0);

    const p3Results = p3Questions.map((question) => {
      const studentAnswer = normalizeAnswer(p3Ans[String(question.id)]);
      return studentAnswer.length > 0 && studentAnswer === normalizeAnswer(question.correctAnswer);
    });
    const part3TotalScore = finiteNumber(exam.scoringConfig?.part3TotalScore, 3);
    const p3 = p3Questions.length > 0
      ? p3Results.filter(Boolean).length * part3TotalScore / p3Questions.length
      : 0;
    const rounded = (value: number) => Math.round(value * 100) / 100;
    // Đề có tự luận: Phần IV chờ giáo viên chấm, tổng tạm tính chỉ gồm Phần I–III.
    const essayExam = hasEssayPart(exam.structure) && questions.some((question) => question?.type === "essay");
    const uploadDeadline = essayExam ? Timestamp.fromMillis(Date.now() + ESSAY_UPLOAD_GRACE_MINUTES * 60 * 1000) : null;
    const scores = {
      p1: rounded(p1),
      p2: rounded(p2),
      p3: rounded(p3),
      ...(essayExam ? { p4: null } : {}),
      total: rounded(p1 + p2 + p3),
      part1: { correct: p1Results.filter(Boolean).length, total: p1Questions.length, score: rounded(p1) },
      part2: {
        details: p2Results.map((matches, index) => ({
          match: matches,
          maxMatch: Array.isArray(p2Questions[index]?.correctAnswer) ? p2Questions[index].correctAnswer.length : 4,
          score: p2Table[matches] ?? 0,
        })),
        totalScore: rounded(p2),
      },
      part3: { correct: p3Results.filter(Boolean).length, total: p3Questions.length, score: rounded(p3) },
    };

    const isStaff = ["admin", "mod"].includes(authUser.role);
    const isTeacherPreview = Boolean(body.isTeacherPreview && isStaff);
    const payload = {
      examId,
      examTitle: String(exam.title ?? "Bài thi"),
      studentName: String(body.studentName ?? "Học sinh").slice(0, 160),
      studentEmail: authUser.email,
      studentAvatar: String(body.studentAvatar ?? "").slice(0, 1000),
      status: "COMPLETED",
      submittedAt: FieldValue.serverTimestamp(),
      part1Results: p1Results,
      part2Results: p2Results,
      part3Results: p3Results,
      scores,
      answersJson: JSON.stringify({ p1Ans, p2Ans, p3Ans }),
      cheatCount: clampInteger(body.cheatCount, 0, 10_000),
      activityLog: safeEvents(body.activityLog),
      questionTimings: safeEvents(body.questionTimings),
      totalElapsedSeconds: clampInteger(body.totalElapsedSeconds, 0, 7 * 24 * 60 * 60),
      idleBeforeSubmitSeconds: clampInteger(body.idleBeforeSubmitSeconds, 0, 7 * 24 * 60 * 60),
      lastInteractionAtSeconds: clampInteger(body.lastInteractionAtSeconds, 0, 7 * 24 * 60 * 60),
      ...(isTeacherPreview ? { isTeacherPreview: true } : {}),
      ...(body.exitedEarly ? { exitedEarly: true } : {}),
      ...(uploadDeadline ? { gradingStatus: "pending", essay: { uploadDeadline } } : {}),
    };

    const submissionRef = sessionRef ?? adminDb.collection("submissions").doc();
    // merge giữ nguyên essay.files đã tải trong lúc làm bài.
    await submissionRef.set(payload, { merge: true });

    if (uploadDeadline) {
      // Không trả điểm: học sinh chỉ thấy kết quả khi giáo viên chấm xong.
      return NextResponse.json({ id: submissionRef.id, essayUpload: { uploadDeadlineMillis: uploadDeadline.toMillis() } });
    }
    return NextResponse.json({ id: submissionRef.id, scores });
  } catch (error) {
    console.error("POST /api/submissions failed:", error);
    return NextResponse.json({ error: "SUBMISSION_SAVE_FAILED" }, { status: 500 });
  }
}
