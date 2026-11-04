"use client";

/**
 * Chi tiết bài làm (P1/P2/P3 + ReviewMode). Chỉ mod xem được khi họ là tác giả đề (authorEmail).
 * Logic chấm điểm dùng cùng hàm recalc như /student/review/[id].
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { parseLatexExam, ParsedQuestion } from "@/utils/latexParser";
import {
  ScoreResult,
  P2_TABLE,
  normalizeAnswer,
  formatCountdown,
  type ExamActivityEvent,
  type ExamActivitySummary,
  type QuestionTimingStat,
} from "@/utils/examTypes";
import ReviewMode, { type EssayReview } from "@/components/ReviewMode";
import EssayGradedWork, { useEssayResult } from "@/components/essay/EssayGradedWork";
import StateIcon from "@/components/StateIcon";
import { essayQuestionPoints, hasEssayPart, orderQuestionsByPart } from "@/utils/examStructure";
import { answersToDisplay, buildExamVersion } from "@/utils/examVersions";
import { AlertTriangle, PenTool } from "lucide-react";

interface StoredAnswers {
  p1Ans: Record<string, number>;
  p2Ans: Record<string, (boolean | null)[]>;
  p3Ans: Record<string, string>;
}

function strKeysToNum<T>(obj: Record<string, T>): Record<number, T> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [Number(k), v]));
}

function parseAnswers(json: string): {
  p1Ans: Record<number, number>;
  p2Ans: Record<number, (boolean | null)[]>;
  p3Ans: Record<number, string>;
} {
  try {
    const raw: StoredAnswers = JSON.parse(json);
    return {
      p1Ans: strKeysToNum(raw.p1Ans ?? {}),
      p2Ans: strKeysToNum(raw.p2Ans ?? {}),
      p3Ans: strKeysToNum(raw.p3Ans ?? {}),
    };
  } catch {
    return { p1Ans: {}, p2Ans: {}, p3Ans: {} };
  }
}

function recalcScore(
  questions: ParsedQuestion[],
  p1Ans: Record<number, number>,
  p2Ans: Record<number, (boolean | null)[]>,
  p3Ans: Record<number, string>,
  storedScore?: Partial<ScoreResult>
): ScoreResult {
  const p1Qs = questions.filter((q) => q.type === "multiple_choice");
  const p2Qs = questions.filter((q) => q.type === "true_false");
  const p3Qs = questions.filter((q) => q.type === "short_answer");

  let p1 = 0;
  let p1Correct = 0;
  p1Qs.forEach((q) => {
    if (p1Ans[q.id] === (q.correctAnswer as number)) {
      p1++;
      p1Correct++;
    }
  });
  p1 = storedScore?.p1 ?? (p1Qs.length > 0 ? (p1 / p1Qs.length) * 3 : 0);

  let p2 = 0;
  const p2Details: ScoreResult["part2"]["details"] = [];
  p2Qs.forEach((q) => {
    const correct = q.correctAnswer as boolean[];
    const student = p2Ans[q.id] ?? new Array(correct.length).fill(null);
    const hits = correct.filter((c, i) => c === student[i]).length;
    const qScore = P2_TABLE[hits] ?? 0;
    p2 += qScore;
    p2Details.push({ match: hits, maxMatch: correct.length, score: qScore });
  });

  let p3 = 0;
  let p3Correct = 0;
  p3Qs.forEach((q) => {
    const ns = normalizeAnswer(p3Ans[q.id] ?? "");
    const nc = normalizeAnswer(String(q.correctAnswer ?? ""));
    if (ns !== "" && ns === nc) p3Correct++;
  });
  p3 = storedScore?.p3 ?? (p3Qs.length > 0 ? (p3Correct / p3Qs.length) * 1 : 0);

  const r = (n: number) => Math.round(n * 100) / 100;
  const finalP1 = storedScore?.p1 ?? r(p1);
  const finalP2 = storedScore?.p2 ?? r(p2);
  const finalP3 = storedScore?.p3 ?? r(p3);

  return {
    p1: finalP1,
    p2: finalP2,
    p3: finalP3,
    p4: storedScore?.p4 ?? null,
    total: storedScore?.total ?? r(finalP1 + finalP2 + finalP3),
    part1: storedScore?.part1 ?? { correct: p1Correct, total: p1Qs.length, score: finalP1 },
    part2: storedScore?.part2 ?? { details: p2Details, totalScore: finalP2 },
    part3: storedScore?.part3 ?? { correct: p3Correct, total: p3Qs.length, score: finalP3 },
  };
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
        <div className="absolute inset-0 rounded-full border-4 border-brand-600 border-t-transparent animate-spin" />
      </div>
      <p className="text-gray-500 text-sm animate-pulse">Đang tải bài làm…</p>
    </div>
  );
}

export default function TeacherSubmissionReviewPage() {
  const { submissionId: submissionIdParam } = useParams<{ submissionId: string }>();
  const searchParams = useSearchParams();
  const returnToRaw = searchParams.get("returnTo");
  const submissionId = decodeURIComponent(submissionIdParam ?? "");

  const { user, isAdmin, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [examTitle, setExamTitle] = useState("");
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [p1Ans, setP1Ans] = useState<Record<number, number>>({});
  const [p2Ans, setP2Ans] = useState<Record<number, (boolean | null)[]>>({});
  const [p3Ans, setP3Ans] = useState<Record<number, string>>({});
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [activitySummary, setActivitySummary] = useState<ExamActivitySummary | null>(null);
  const [essayGrade, setEssayGrade] = useState<{ examId: string; status: "pending" | "graded" } | null>(null);
  const [part4TotalScore, setPart4TotalScore] = useState<number | null>(null);
  const getToken = useCallback(() => user!.getIdToken(), [user]);
  // Giáo viên luôn nhận đủ phiếu chấm và ảnh bài làm, kể cả khi còn chấm nháp.
  const essayResult = useEssayResult(essayGrade ? submissionId : null, user ? getToken : null);
  const essayReview = useMemo<EssayReview | undefined>(() => {
    if (!essayGrade || part4TotalScore === null) return undefined;
    const graded = essayGrade.status === "graded";
    return {
      scores: graded ? essayResult.data?.grading?.essayScores ?? {} : {},
      comments: essayResult.data?.grading?.essayComments ?? {},
      maxPoints: essayQuestionPoints(questions, part4TotalScore),
      total: part4TotalScore,
      graded,
      slot: essayResult.data ? <EssayGradedWork data={essayResult.data} pending={!graded} /> : undefined,
    };
  }, [essayGrade, essayResult.data, part4TotalScore, questions]);

  const backHref =
    returnToRaw &&
    returnToRaw.startsWith("/") &&
    !returnToRaw.startsWith("//") &&
    (returnToRaw.startsWith("/teacher/") || returnToRaw.startsWith("/admin/"))
      ? returnToRaw
      : "/teacher/classes";

  useEffect(() => {
    if (!submissionId || authLoading || !user?.email) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const subSnap = await getDoc(doc(db, "submissions", submissionId));
        if (!subSnap.exists()) {
          if (!cancelled) setError("Không tìm thấy bài làm này.");
          return;
        }
        const sub = subSnap.data();

        const examSnap = await getDoc(doc(db, "exams", sub.examId));
        if (!examSnap.exists()) {
          if (!cancelled) setError("Không tìm thấy đề thi tương ứng.");
          return;
        }
        const exam = examSnap.data();
        const authorEmail = String(exam.authorEmail ?? "");

        if (!isAdmin && authorEmail !== user.email) {
          if (!cancelled) setError("Bạn không có quyền xem bài làm này (không phải đề của bạn).");
          return;
        }

        if (cancelled) return;

        setExamTitle(sub.examTitle ?? exam.title ?? "Bài thi");

        let qs: ParsedQuestion[];
        if (exam.tikzProcessed && Array.isArray(exam.questions)) {
          qs = exam.questions as ParsedQuestion[];
        } else if (exam.rawLatex) {
          const { part1 = "", part2 = "", part3 = "", part4 = "" } = exam.rawLatex;
          qs = orderQuestionsByPart([
            ...parseLatexExam(part1),
            ...parseLatexExam(part2),
            ...parseLatexExam(part3),
            ...parseLatexExam(part4, { essay: true }),
          ]);
        } else {
          qs = (exam.questions ?? []) as ParsedQuestion[];
        }
        // Đề trộn nhiều mã: hiện đúng bản đề học sinh đã làm.
        const version = buildExamVersion(qs, exam.versioning, sub.examCode, String(sub.examId));
        qs = version.questions;
        setQuestions(qs);

        const { p1Ans: a1, p2Ans: a2, p3Ans: a3 } = answersToDisplay(parseAnswers(sub.answersJson ?? "{}"), version.orders);
        setP1Ans(a1);
        setP2Ans(a2);
        setP3Ans(a3);

        const score = recalcScore(qs, a1, a2, a3, sub.scores);
        setScoreResult(score);
        if (sub.gradingStatus === "pending" || sub.gradingStatus === "graded") {
          setEssayGrade({ examId: String(sub.examId), status: sub.gradingStatus });
          if (hasEssayPart(exam.structure)) setPart4TotalScore(Number(exam.scoringConfig?.part4TotalScore ?? 0));
        }
        if (Array.isArray(sub.activityLog) || Array.isArray(sub.questionTimings)) {
          setActivitySummary({
            activityLog: (sub.activityLog ?? []) as ExamActivityEvent[],
            questionTimings: (sub.questionTimings ?? []) as QuestionTimingStat[],
            totalElapsedSeconds: Number(sub.totalElapsedSeconds ?? 0),
            lastInteractionAtSeconds: Number(sub.lastInteractionAtSeconds ?? 0),
            idleBeforeSubmitSeconds: Number(sub.idleBeforeSubmitSeconds ?? 0),
          });
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Lỗi khi tải dữ liệu. Vui lòng thử lại.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [submissionId, user?.email, authLoading, isAdmin]);

  if (authLoading) return <Spinner />;

  return (
    <AdminGuard>
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <StateIcon icon="alert" tone="danger" className="mb-4" />
          <p className="text-danger-500 font-semibold text-lg mb-6">{error}</p>
          <Link
            href={backHref}
            className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl transition-colors"
          >
            ← Quay lại
          </Link>
        </div>
      ) : !scoreResult ? null : (
        <div>
          <div className="workspace-page max-w-3xl mx-auto px-4 pt-6">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-brand-600 transition-colors"
            >
              ← Quay lại học sinh / lớp
            </Link>
          </div>

          <div className="max-w-3xl mx-auto px-4 pt-6">
            <section className="rounded-3xl border border-brand-100 bg-white p-6 shadow-[var(--shadow-soft)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Nhật ký thời gian</p>
                  <h2 className="mt-1 text-xl font-extrabold font-display text-gray-900">Tiến trình làm bài theo từng câu</h2>
                </div>
                {!activitySummary && (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">
                    Bài cũ chưa có nhật ký
                  </span>
                )}
              </div>

              {activitySummary && (
                <>
                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-brand-50 p-4">
                      <p className="text-xs font-semibold text-brand-700">Tổng thời gian</p>
                      <p className="mt-1 text-2xl font-extrabold text-brand-900">
                        {formatCountdown(activitySummary.totalElapsedSeconds)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-amber-50 p-4">
                      <p className="text-xs font-semibold text-amber-700">Tương tác cuối</p>
                      <p className="mt-1 text-2xl font-extrabold text-amber-900">
                        +{formatCountdown(activitySummary.lastInteractionAtSeconds)}
                      </p>
                    </div>
                    <div className={`rounded-2xl p-4 ${activitySummary.idleBeforeSubmitSeconds >= 300 ? "bg-danger-50" : "bg-brand-50"}`}>
                      <p className={`text-xs font-semibold ${activitySummary.idleBeforeSubmitSeconds >= 300 ? "text-danger-700" : "text-brand-700"}`}>
                        Không tương tác trước khi nộp
                      </p>
                      <p className={`mt-1 text-2xl font-extrabold ${activitySummary.idleBeforeSubmitSeconds >= 300 ? "text-danger-900" : "text-brand-900"}`}>
                        {formatCountdown(activitySummary.idleBeforeSubmitSeconds)}
                      </p>
                    </div>
                  </div>

                  {activitySummary.idleBeforeSubmitSeconds >= 300 && (
                    <p className="mt-4 rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-800">
                      <AlertTriangle size={14} className="mr-1 inline align-[-2px]" aria-hidden="true" />Học sinh không có tương tác trong ít nhất 5 phút trước khi bài được nộp. Đây là tín hiệu để giáo viên xem xét cùng các dữ liệu khác.
                    </p>
                  )}

                  <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-100">
                    <table className="w-full text-sm">
                      <thead className="bg-brand-50 text-left text-xs uppercase tracking-wide text-brand-700">
                        <tr>
                          <th className="px-4 py-3">Câu</th>
                          <th className="px-4 py-3">Thời gian xem</th>
                          <th className="px-4 py-3">Số lượt vào</th>
                          <th className="px-4 py-3">Trả lời lần cuối</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {activitySummary.questionTimings.map((item) => (
                          <tr key={item.questionId}>
                            <td className="px-4 py-3 font-bold text-gray-800">Câu {item.questionNumber}</td>
                            <td className="px-4 py-3 text-gray-600">{formatCountdown(item.totalSeconds)}</td>
                            <td className="px-4 py-3 text-gray-600">{item.visits}</td>
                            <td className="px-4 py-3 text-gray-600">
                              {item.lastAnsweredAtSeconds === undefined
                                ? "—"
                                : `+${formatCountdown(item.lastAnsweredAtSeconds)}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <details className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <summary className="cursor-pointer font-bold text-gray-700">
                      Xem dòng thời gian chi tiết ({activitySummary.activityLog.length} sự kiện)
                    </summary>
                    <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                      {activitySummary.activityLog.map((event, index) => {
                        const actionLabel = {
                          enter: "Mở câu",
                          answer: "Chọn/nhập đáp án",
                          leave: "Rời câu",
                          submit: "Nộp bài tại câu",
                        }[event.action];
                        return (
                          <div key={`${event.atSeconds}-${index}`} className="flex gap-3 rounded-xl bg-white px-3 py-2 text-xs">
                            <span className="w-16 shrink-0 font-mono font-bold text-brand-700">+{formatCountdown(event.atSeconds)}</span>
                            <span className="font-semibold text-gray-700">Câu {event.questionNumber}</span>
                            <span className="text-gray-500">{actionLabel}</span>
                            {event.answer && <span className="ml-auto max-w-[45%] truncate font-semibold text-brand-800">{event.answer}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </>
              )}
            </section>
          </div>

          {essayGrade && (
            <div className="workspace-page mx-auto mt-6 max-w-4xl px-4">
              <Link href={`/admin/grade/${essayGrade.examId}?s=${submissionId}`} className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800 transition hover:border-violet-300">
                <PenTool size={18} aria-hidden="true" />
                {essayGrade.status === "pending" ? "Phần tự luận chưa chấm · Mở màn hình chấm" : "Xem hoặc sửa bài chấm tự luận"}
                <span className="ml-auto" aria-hidden="true">→</span>
              </Link>
            </div>
          )}

          <ReviewMode
            title={examTitle}
            questions={questions}
            p1Ans={p1Ans}
            p2Ans={p2Ans}
            p3Ans={p3Ans}
            scoreResult={scoreResult}
            standalone
            essay={essayReview}
          />

          <div className="max-w-3xl mx-auto px-4 pb-10 flex gap-4 justify-center">
            <Link
              href={backHref}
              className="px-8 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl transition-colors"
            >
              ← Quay lại danh sách
            </Link>
          </div>
        </div>
      )}
    </AdminGuard>
  );
}
