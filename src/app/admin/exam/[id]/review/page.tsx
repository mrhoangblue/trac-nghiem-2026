"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Latex from "react-latex-next";
import "katex/dist/katex.min.css";
import AdminGuard from "@/components/AdminGuard";
import ExplanationRenderer from "@/components/ExplanationRenderer";
import TikzRenderer from "@/components/TikzRenderer";
import { useAuth } from "@/lib/AuthContext";
import type { ParsedQuestion } from "@/utils/latexParser";
import { processLatexText } from "@/utils/textProcessor";

type Filter = "all" | "multiple_choice" | "true_false" | "short_answer" | "issues";

interface ExamReviewData {
  id: string;
  title: string;
  description: string;
  authorEmail: string;
  gradeLevel: string;
  examType: string;
  duration: number;
  createdAt: string | null;
  updatedAt: string | null;
  tikzProcessed: boolean;
  tikzImageCount: number;
  tikzFailedCount: number;
  questions: ParsedQuestion[];
}

const TYPE_META: Record<string, { label: string; short: string; tone: string }> = {
  multiple_choice: {
    label: "Trắc nghiệm nhiều lựa chọn",
    short: "Phần I",
    tone: "border-brand-200 bg-brand-50 text-brand-800",
  },
  true_false: {
    label: "Trắc nghiệm đúng / sai",
    short: "Phần II",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
  },
  short_answer: {
    label: "Trắc nghiệm trả lời ngắn",
    short: "Phần III",
    tone: "border-success-200 bg-success-50 text-success-800",
  },
};

function questionIssues(question: ParsedQuestion): string[] {
  const issues: string[] = [];
  if (question.type === "multiple_choice") {
    if (!Number.isInteger(question.correctAnswer) || !question.options?.length) {
      issues.push("Thiếu đáp án đúng");
    }
  } else if (question.type === "true_false") {
    const answer = question.correctAnswer;
    if (!Array.isArray(answer) || !question.options?.length || answer.length !== question.options.length) {
      issues.push("Đáp án đúng/sai chưa đủ");
    }
  } else if (question.type === "short_answer") {
    if (!String(question.correctAnswer ?? "").trim() && !question.correctAnswerImageUrl) {
      issues.push("Thiếu đáp án trả lời ngắn");
    }
  } else {
    issues.push("Loại câu hỏi chưa xác định");
  }
  if (question.requiresAnswerReview) issues.push("Đáp án cần giáo viên xác nhận");
  if (question.tikzCode && !question.tikzImageUrl) issues.push("Hình TikZ câu hỏi chưa có ảnh R2");
  if (question.explanationTikzCode && !question.explanationTikzImageUrl) {
    issues.push("Hình TikZ lời giải chưa có ảnh R2");
  }
  return issues;
}

function formatDate(value: string | null): string {
  if (!value) return "Chưa ghi nhận";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa ghi nhận";
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function LoadingState() {
  return (
    <div className="mx-auto flex min-h-[65vh] max-w-6xl items-center justify-center px-4">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
        <p className="mt-4 text-sm font-semibold text-gray-500">Đang dựng bản kiểm duyệt đề thi…</p>
      </div>
    </div>
  );
}

function ReviewImage({ src, alt, onBroken }: { src: string; alt: string; onBroken: () => void }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="flex min-h-36 w-full items-center justify-center rounded-2xl border border-danger-200 bg-danger-50 px-6 text-center text-sm font-bold text-danger-700">
        Không tải được ảnh. Cần kiểm tra lại URL trên R2.
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="mx-auto max-h-[460px] max-w-full object-contain"
      loading="lazy"
      onError={() => {
        setBroken(true);
        onBroken();
      }}
    />
  );
}

function QuestionFigure({
  url,
  code,
  alt,
  onBroken,
}: {
  url?: string;
  code?: string;
  alt: string;
  onBroken: () => void;
}) {
  if (!url && !code) return null;
  return (
    <div className="exam-figure my-5 overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
      {url ? <ReviewImage src={url} alt={alt} onBroken={onBroken} /> : <TikzRenderer code={code ?? ""} />}
    </div>
  );
}

function QuestionCard({
  question,
  index,
  onBrokenImage,
}: {
  question: ParsedQuestion;
  index: number;
  onBrokenImage: (key: string) => void;
}) {
  const issues = questionIssues(question);
  const meta = TYPE_META[question.type] ?? TYPE_META.multiple_choice;
  const correctIndex = typeof question.correctAnswer === "number" ? question.correctAnswer : -1;
  const tfAnswers = Array.isArray(question.correctAnswer) ? question.correctAnswer : [];

  return (
    <article
      id={`question-${index + 1}`}
      className={`scroll-mt-28 overflow-hidden rounded-[28px] border bg-[#fffefa] shadow-[0_14px_45px_rgba(69,43,27,0.07)] ${
        issues.length ? "border-danger-200" : "border-[#e9dfd1]"
      }`}
    >
      <div className="flex flex-col gap-3 border-b border-[#eee5d8] bg-white/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#32190f] text-sm font-black text-white">
            {index + 1}
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">{meta.short}</p>
            <p className="text-sm font-bold text-gray-800">Câu {index + 1} · {meta.label}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {question.tikzImageUrl && (
            <span className="rounded-full border border-success-200 bg-success-50 px-3 py-1 text-[11px] font-bold text-success-700">
              TikZ đã lưu R2
            </span>
          )}
          {issues.map((issue) => (
            <span key={issue} className="rounded-full border border-danger-200 bg-danger-50 px-3 py-1 text-[11px] font-bold text-danger-700">
              {issue}
            </span>
          ))}
        </div>
      </div>

      <div className="exam-reading px-5 py-6 sm:px-8 sm:py-8">
        <div className="text-[1.03rem] font-medium leading-8 text-[#251c17]">
          {processLatexText(question.questionText)}
        </div>

        {question.imageUrls?.map((url, imageIndex) => (
          <div key={`${url}-${imageIndex}`} className="exam-figure my-5 rounded-2xl border border-gray-200 bg-white p-4">
            <ReviewImage
              src={url}
              alt={`Hình minh họa câu ${index + 1}`}
              onBroken={() => onBrokenImage(`q-${index}-image-${imageIndex}`)}
            />
          </div>
        ))}

        <QuestionFigure
          url={question.tikzImageUrl}
          code={question.tikzCode}
          alt={`Hình TikZ câu ${index + 1}`}
          onBroken={() => onBrokenImage(`q-${index}-tikz`)}
        />

        {question.type === "multiple_choice" && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {(question.options ?? []).map((option, optionIndex) => {
              const correct = optionIndex === correctIndex;
              return (
                <div
                  key={optionIndex}
                  className={`flex min-h-14 items-start gap-3 rounded-2xl border px-4 py-3 ${
                    correct
                      ? "border-success-400 bg-success-50 text-success-950"
                      : "border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${correct ? "bg-success-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                    {String.fromCharCode(65 + optionIndex)}
                  </span>
                  <div className="min-w-0 flex-1 leading-7">{processLatexText(option)}</div>
                  {correct && <span className="shrink-0 text-xs font-black text-success-700">ĐÁP ÁN</span>}
                </div>
              );
            })}
          </div>
        )}

        {question.type === "true_false" && (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-[580px] border-collapse text-sm">
              <thead className="bg-[#f7f2e9] text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="w-14 px-4 py-3 text-center">Ý</th>
                  <th className="px-4 py-3">Mệnh đề</th>
                  <th className="w-28 px-4 py-3 text-center">Đáp án</th>
                </tr>
              </thead>
              <tbody>
                {(question.options ?? []).map((statement, statementIndex) => {
                  const answer = tfAnswers[statementIndex];
                  return (
                    <tr key={statementIndex} className="border-t border-gray-100">
                      <td className="px-4 py-4 text-center font-black text-brand-700">{String.fromCharCode(97 + statementIndex)})</td>
                      <td className="px-4 py-4 leading-7 text-gray-800">{processLatexText(statement)}</td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex min-w-16 justify-center rounded-full border px-3 py-1 text-xs font-black ${
                          answer === true
                            ? "border-success-200 bg-success-50 text-success-700"
                            : answer === false
                              ? "border-danger-200 bg-danger-50 text-danger-700"
                              : "border-gray-200 bg-gray-50 text-gray-500"
                        }`}>
                          {answer === true ? "ĐÚNG" : answer === false ? "SAI" : "THIẾU"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {question.type === "short_answer" && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-success-200 bg-success-50 px-5 py-4">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-success-700">Đáp án ngắn</span>
            {question.correctAnswerImageUrl ? (
              <div className="max-w-full rounded-xl bg-white px-3 py-2">
                <ReviewImage
                  src={question.correctAnswerImageUrl}
                  alt={`Đáp án câu ${index + 1}`}
                  onBroken={() => onBrokenImage(`q-${index}-answer`)}
                />
              </div>
            ) : (
              <strong className="rounded-xl bg-white px-4 py-2 text-lg text-success-900 shadow-sm">
                <Latex>{String(question.correctAnswer ?? "Chưa có đáp án")}</Latex>
              </strong>
            )}
          </div>
        )}

        {(question.explanation || question.explanationTikzImageUrl || question.explanationTikzCode) && (
          <section className="mt-6 rounded-2xl border border-[#ead7bf] bg-[#fff9ef] p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-[#ead7bf]" />
              <h3 className="text-xs font-black uppercase tracking-[0.18em] text-brand-700">Lời giải chi tiết</h3>
              <span className="h-px flex-1 bg-[#ead7bf]" />
            </div>
            <QuestionFigure
              url={question.explanationTikzImageUrl}
              code={question.explanationTikzCode}
              alt={`Hình TikZ lời giải câu ${index + 1}`}
              onBroken={() => onBrokenImage(`q-${index}-explanation-tikz`)}
            />
            {question.explanation && (
              <div className="leading-8 text-gray-800">
                <ExplanationRenderer explanation={question.explanation} />
              </div>
            )}
          </section>
        )}
      </div>
    </article>
  );
}

export default function TeacherExamReviewPage() {
  const params = useParams<{ id: string }>();
  const examId = params.id;
  const { user, loading: authLoading } = useAuth();
  const [exam, setExam] = useState<ExamReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    const currentUser = user;
    let cancelled = false;
    async function loadExam() {
      setLoading(true);
      setError("");
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/exams/${encodeURIComponent(examId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            payload.error === "FORBIDDEN"
              ? "Bạn không có quyền xem đề thi này."
              : payload.error === "NOT_FOUND"
                ? "Không tìm thấy đề thi."
                : "Không thể tải nội dung đề thi.",
          );
        }
        if (!cancelled) setExam(payload as ExamReviewData);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Không thể tải đề thi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadExam();
    return () => {
      cancelled = true;
    };
  }, [authLoading, examId, user]);

  const stats = useMemo(() => {
    const questions = exam?.questions ?? [];
    const issueQuestions = questions.filter((question) => questionIssues(question).length > 0);
    const tikzImages = questions.reduce(
      (total, question) => total + Number(Boolean(question.tikzImageUrl)) + Number(Boolean(question.explanationTikzImageUrl)),
      0,
    );
    return {
      total: questions.length,
      multipleChoice: questions.filter((question) => question.type === "multiple_choice").length,
      trueFalse: questions.filter((question) => question.type === "true_false").length,
      shortAnswer: questions.filter((question) => question.type === "short_answer").length,
      issues: issueQuestions.length,
      tikzImages,
    };
  }, [exam]);

  const visibleQuestions = useMemo(() => {
    const questions = exam?.questions ?? [];
    return questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => {
        if (filter === "all") return true;
        if (filter === "issues") return questionIssues(question).length > 0;
        return question.type === filter;
      });
  }, [exam, filter]);

  const markBroken = (key: string) => {
    setBrokenImages((current) => new Set(current).add(key));
  };

  return (
    <AdminGuard>
      {loading ? (
        <LoadingState />
      ) : error || !exam ? (
        <div className="mx-auto flex min-h-[65vh] max-w-3xl flex-col items-center justify-center px-4 text-center">
          <div className="rounded-[28px] border border-danger-200 bg-danger-50 p-8">
            <p className="text-lg font-black text-danger-800">{error || "Không thể mở đề thi."}</p>
            <Link href="/admin/exam-list" className="mt-5 inline-flex rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white">
              Quay lại danh sách đề
            </Link>
          </div>
        </div>
      ) : (
        <div className="min-h-screen bg-[#f6f1e8] pb-20 print:bg-white">
          <header className="border-b border-[#e5d9c9] bg-[#fffdf8] print:border-0">
            <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-4xl">
                  <Link href="/admin/exam-list" className="text-sm font-bold text-brand-700 hover:text-brand-900 print:hidden">
                    ← Danh sách đề thi
                  </Link>
                  <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-brand-700">Bản kiểm duyệt dành cho giáo viên</p>
                  <h1 className="mt-2 text-3xl font-black leading-tight text-[#25170f] sm:text-4xl">{exam.title}</h1>
                  {exam.description && <p className="mt-3 max-w-3xl text-base leading-7 text-gray-600">{exam.description}</p>}
                  <p className="mt-3 text-xs text-gray-500">
                    {exam.gradeLevel || "Chưa phân loại"} · {exam.examType || "Chưa chọn loại đề"} · {exam.duration ? `${exam.duration} phút` : "Không giới hạn thời gian"} · Cập nhật {formatDate(exam.updatedAt ?? exam.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 print:hidden">
                  <button type="button" onClick={() => window.print()} className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:border-brand-300">
                    In bản kiểm duyệt
                  </button>
                  <Link href={`/admin/exam/${exam.id}`} className="rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-bold text-brand-700 hover:border-brand-400">
                    Xem kết quả
                  </Link>
                  <Link href={`/admin/edit-exam/${exam.id}`} className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-900/10 hover:bg-brand-800">
                    Sửa đề thi
                  </Link>
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { label: "Tổng số câu", value: stats.total, hint: "Toàn bộ đề" },
                { label: "Phần I", value: stats.multipleChoice, hint: "Nhiều lựa chọn" },
                { label: "Phần II", value: stats.trueFalse, hint: "Đúng / sai" },
                { label: "Phần III", value: stats.shortAnswer, hint: "Trả lời ngắn" },
                { label: "Cần kiểm tra", value: stats.issues + brokenImages.size, hint: `${stats.tikzImages} ảnh TikZ trên R2`, alert: stats.issues + brokenImages.size > 0 },
              ].map((item) => (
                <div key={item.label} className={`rounded-2xl border bg-white px-5 py-4 ${item.alert ? "border-danger-200" : "border-[#e5d9c9]"}`}>
                  <p className={`text-3xl font-black ${item.alert ? "text-danger-700" : "text-[#2f1a10]"}`}>{item.value}</p>
                  <p className="mt-1 text-sm font-black text-gray-800">{item.label}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{item.hint}</p>
                </div>
              ))}
            </section>

            <div className="mt-5 flex gap-2 overflow-x-auto pb-2 print:hidden">
              {[
                ["all", `Tất cả (${stats.total})`],
                ["multiple_choice", `Phần I (${stats.multipleChoice})`],
                ["true_false", `Phần II (${stats.trueFalse})`],
                ["short_answer", `Phần III (${stats.shortAnswer})`],
                ["issues", `Cần kiểm tra (${stats.issues})`],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value as Filter)}
                  className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-bold transition ${
                    filter === value
                      ? "border-[#32190f] bg-[#32190f] text-white"
                      : "border-[#dfd1bf] bg-white text-gray-600 hover:border-brand-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {exam.questions.length === 0 ? (
              <div className="mt-8 rounded-[28px] border border-amber-200 bg-amber-50 p-10 text-center">
                <p className="text-lg font-black text-amber-900">Đề thi chưa có dữ liệu câu hỏi đã phân tích.</p>
                <p className="mt-2 text-sm text-amber-800">Hãy mở trang sửa đề, biên dịch lại nội dung rồi lưu đề.</p>
              </div>
            ) : (
              <div className="mt-7 grid items-start gap-7 xl:grid-cols-[220px_minmax(0,1fr)]">
                <aside className="sticky top-24 hidden max-h-[calc(100vh-7rem)] overflow-y-auto rounded-[24px] border border-[#e2d6c5] bg-[#fffdf8] p-4 xl:block print:hidden">
                  <p className="px-2 text-xs font-black uppercase tracking-[0.18em] text-brand-700">Mục lục câu hỏi</p>
                  <div className="mt-4 grid grid-cols-5 gap-2">
                    {exam.questions.map((question, index) => {
                      const hasIssue = questionIssues(question).length > 0;
                      return (
                        <a
                          key={`${question.id}-${index}`}
                          href={`#question-${index + 1}`}
                          title={hasIssue ? `Câu ${index + 1} cần kiểm tra` : `Đi tới câu ${index + 1}`}
                          className={`flex aspect-square items-center justify-center rounded-lg border text-xs font-black ${
                            hasIssue
                              ? "border-danger-300 bg-danger-50 text-danger-700"
                              : "border-[#e5d9c9] bg-white text-gray-700 hover:border-brand-400 hover:text-brand-700"
                          }`}
                        >
                          {index + 1}
                        </a>
                      );
                    })}
                  </div>
                  <div className="mt-5 space-y-2 border-t border-[#e9dfd1] pt-4 text-xs text-gray-500">
                    <p><strong className="text-gray-700">{stats.tikzImages}</strong> ảnh TikZ đã lưu trên R2</p>
                    <p><strong className="text-gray-700">{exam.tikzFailedCount}</strong> lỗi TikZ lúc lưu gần nhất</p>
                    <p className={exam.tikzProcessed ? "text-success-700" : "font-bold text-danger-700"}>
                      {exam.tikzProcessed ? "Đã hoàn tất xử lý TikZ" : "TikZ chưa được xử lý hoàn tất"}
                    </p>
                  </div>
                </aside>

                <div className="min-w-0 space-y-6">
                  {visibleQuestions.length ? (
                    visibleQuestions.map(({ question, index }) => (
                      <QuestionCard
                        key={`${question.id}-${index}`}
                        question={question}
                        index={index}
                        onBrokenImage={markBroken}
                      />
                    ))
                  ) : (
                    <div className="rounded-[28px] border border-success-200 bg-success-50 p-10 text-center">
                      <p className="text-lg font-black text-success-800">Không có câu hỏi nào cần kiểm tra trong bộ lọc này.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </AdminGuard>
  );
}
