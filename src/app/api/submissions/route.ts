import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";
import { normalizeAnswer } from "@/utils/examTypes";

export const runtime = "nodejs";

type AnswerMap = Record<string, unknown>;

interface SubmitExamBody {
  examId?: string;
  submissionId?: string;
  studentName?: string;
  studentAvatar?: string;
  answersJson?: string;
  cheatCount?: number;
  activityLog?: unknown[];
  questionTimings?: unknown[];
  totalElapsedSeconds?: number;
  idleBeforeSubmitSeconds?: number;
  lastInteractionAtSeconds?: number;
  isTeacherPreview?: boolean;
  exitedEarly?: boolean;
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

export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser?.email) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = await request.json() as SubmitExamBody;
    const examId = body.examId?.trim();
    if (!examId) {
      return NextResponse.json({ error: "EXAM_ID_REQUIRED" }, { status: 400 });
    }

    const examSnapshot = await adminDb.collection("exams").doc(examId).get();
    if (!examSnapshot.exists) {
      return NextResponse.json({ error: "EXAM_NOT_FOUND" }, { status: 404 });
    }
    const exam = examSnapshot.data() ?? {};
    const questions = Array.isArray(exam.questions) ? exam.questions : [];

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
    const scores = {
      p1: rounded(p1),
      p2: rounded(p2),
      p3: rounded(p3),
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
    };

    let submissionRef = adminDb.collection("submissions").doc();
    if (body.submissionId?.trim()) {
      const candidate = adminDb.collection("submissions").doc(body.submissionId.trim());
      const existing = await candidate.get();
      if (
        existing.exists
        && String(existing.data()?.studentEmail ?? "").toLowerCase() === authUser.email.toLowerCase()
        && existing.data()?.status === "IN_PROGRESS"
      ) {
        submissionRef = candidate;
      }
    }
    await submissionRef.set(payload, { merge: true });

    return NextResponse.json({ id: submissionRef.id, scores });
  } catch (error) {
    console.error("POST /api/submissions failed:", error);
    return NextResponse.json({ error: "SUBMISSION_SAVE_FAILED" }, { status: 500 });
  }
}
