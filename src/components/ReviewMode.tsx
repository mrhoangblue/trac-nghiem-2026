"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Latex from "react-latex-next";
import "katex/dist/katex.min.css";
import { Award, BookOpenCheck, Check, ChevronDown, History, Home, Lightbulb, Minus, Target, TrendingUp, X } from "lucide-react";
import { ParsedQuestion } from "@/utils/latexParser";
import { processLatexText } from "@/utils/textProcessor";
import ExplanationRenderer from "@/components/ExplanationRenderer";
import TikzRenderer from "@/components/TikzRenderer";
import { ScoreResult, normalizeAnswer, formatP2Answers } from "@/utils/examTypes";
import { SECTION_META } from "@/components/QuizClient";

interface ReviewModeProps {
  title: string;
  questions: ParsedQuestion[];
  p1Ans: Record<number, number>;
  p2Ans: Record<number, (boolean | null)[]>;
  p3Ans: Record<number, string>;
  scoreResult: ScoreResult;
  /** Nếu true, ẩn nút "Về trang chủ" (dùng trong trang review độc lập) */
  standalone?: boolean;
  /** Đề có tự luận đã chấm: điểm, nhận xét từng câu và bài làm có nét chấm. */
  essay?: EssayReview;
}

export interface EssayReview {
  scores: Record<string, number>;
  maxPoints: Map<number, number>;
  comments: Record<string, string>;
  total: number;
  /** false: giáo viên chưa chấm xong, câu tự luận hiện "chờ chấm" thay vì tính sai. */
  graded?: boolean;
  /** Bài làm của học sinh kèm nét chấm, hiện sau danh sách câu. */
  slot?: React.ReactNode;
}

type Filter = "all" | "wrong" | "right";
/** right: đúng hết; partial: chấm được một phần (tự luận); wrong: chưa đúng; pending: tự luận chờ chấm. */
type QuestionStatus = "right" | "partial" | "wrong" | "pending";

const formatPoints = (value: number) => String(Math.round(value * 100) / 100).replace(".", ",");

const STATUS_STYLE: Record<QuestionStatus, { border: string; bar: string; chip: string; map: string; label: string }> = {
  right: { border: "border-emerald-200", bar: "bg-gradient-to-b from-emerald-400 to-teal-500", chip: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", map: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100", label: "đúng" },
  partial: { border: "border-amber-200", bar: "bg-gradient-to-b from-amber-400 to-orange-500", chip: "bg-amber-50 text-amber-800 ring-1 ring-amber-200", map: "bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100", label: "đúng một phần" },
  wrong: { border: "border-rose-200", bar: "bg-gradient-to-b from-rose-400 to-pink-500", chip: "bg-rose-50 text-rose-700 ring-1 ring-rose-200", map: "bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100", label: "sai" },
  pending: { border: "border-gray-200", bar: "bg-gradient-to-b from-gray-300 to-gray-400", chip: "bg-gray-100 text-gray-600 ring-1 ring-gray-200", map: "bg-gray-100 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-200", label: "chờ chấm" },
};

// ── Score tiers ───────────────────────────────────────────────────────────────

function tierFor(total: number) {
  if (total >= 8) return { label: "Xuất sắc!", message: "Bạn đã nắm rất chắc kiến thức. Giữ vững phong độ nhé!", gradient: "from-emerald-500 via-teal-500 to-cyan-500", ring: "#34D399", Icon: Award };
  if (total >= 6.5) return { label: "Làm tốt lắm!", message: "Kết quả khá tốt. Xem lại vài câu sai để bứt phá lên điểm cao hơn.", gradient: "from-indigo-600 via-violet-600 to-fuchsia-500", ring: "#A5B4FC", Icon: TrendingUp };
  if (total >= 5) return { label: "Đã đạt yêu cầu", message: "Bạn đang đi đúng hướng. Đọc kỹ lời giải các câu sai để củng cố thêm.", gradient: "from-amber-500 via-orange-500 to-rose-500", ring: "#FDE68A", Icon: Target };
  return { label: "Cố gắng thêm nhé!", message: "Đừng nản lòng — mỗi câu sai là một bài học. Hãy xem lời giải và luyện lại.", gradient: "from-rose-500 via-pink-500 to-violet-500", ring: "#FBCFE8", Icon: Lightbulb };
}

// ── Animated score ring ───────────────────────────────────────────────────────

function useCountUp(target: number, durationMs = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      queueMicrotask(() => setValue(target));
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

function ScoreRing({ total, color }: { total: number; color: string }) {
  const shown = useCountUp(total);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, Math.min(1, shown / 10));
  return (
    <div className="relative h-44 w-44 shrink-0 sm:h-52 sm:w-52">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgb(255 255 255 / .18)" strokeWidth="10" />
        <circle cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="font-display text-5xl font-extrabold tabular-nums sm:text-6xl">{shown.toFixed(2).replace(/\.?0+$/, "") || "0"}</p>
        <p className="text-sm font-semibold text-white/75">trên 10 điểm</p>
      </div>
    </div>
  );
}

function Confetti() {
  const colors = ["#FDE68A", "#A5B4FC", "#F9A8D4", "#6EE7B7", "#FFFFFF", "#93C5FD"];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="result-confetti absolute top-0 block h-3 w-1.5 rounded-sm"
          style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 7) * 0.18}s`, animationDuration: `${2.4 + (i % 5) * 0.35}s` }}
        />
      ))}
    </div>
  );
}

// ── Correctness per question ──────────────────────────────────────────────────

function questionStatus(q: ParsedQuestion, p1Ans: ReviewModeProps["p1Ans"], p2Ans: ReviewModeProps["p2Ans"], p3Ans: ReviewModeProps["p3Ans"], essay?: EssayReview): QuestionStatus {
  if (q.type === "essay") {
    if (!essay || essay.graded === false) return "pending";
    const max = essay.maxPoints.get(q.id) ?? 0;
    const got = essay.scores[q.id] ?? 0;
    if (max > 0 && got >= max - 1e-9) return "right";
    return got > 0 ? "partial" : "wrong";
  }
  return isAutoCorrect(q, p1Ans, p2Ans, p3Ans) ? "right" : "wrong";
}

function isAutoCorrect(q: ParsedQuestion, p1Ans: ReviewModeProps["p1Ans"], p2Ans: ReviewModeProps["p2Ans"], p3Ans: ReviewModeProps["p3Ans"]) {
  if (q.type === "multiple_choice") return p1Ans[q.id] === (q.correctAnswer as number);
  if (q.type === "true_false") {
    const correct = q.correctAnswer as boolean[];
    const student = p2Ans[q.id] ?? new Array(correct.length).fill(null);
    return correct.every((c, i) => c === student[i]);
  }
  const student = normalizeAnswer(p3Ans[q.id] ?? "");
  const correct = normalizeAnswer(String(q.correctAnswer ?? ""));
  return student !== "" && student === correct;
}

export default function ReviewMode({
  title,
  questions,
  p1Ans,
  p2Ans,
  p3Ans,
  scoreResult,
  standalone = false,
  essay,
}: ReviewModeProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const tier = tierFor(scoreResult.total);
  const statuses = questions.map((q) => questionStatus(q, p1Ans, p2Ans, p3Ans, essay));
  const rightCount = statuses.filter((status) => status === "right").length;
  const pendingCount = statuses.filter((status) => status === "pending").length;
  // "Cần xem lại" gồm câu sai và câu tự luận mới đúng một phần; câu chờ chấm không tính.
  const wrongCount = statuses.length - rightCount - pendingCount;
  const results = statuses.map((status) => status === "right");
  const essayRows = essay
    ? questions.flatMap((q, idx) => (q.type === "essay" ? [{ number: idx + 1, id: q.id, max: essay.maxPoints.get(q.id) ?? 0, got: essay.scores[q.id] }] : []))
    : [];

  const p2Max = scoreResult.part2?.details?.length ?? 0;
  const sections = [
    { key: "multiple_choice", label: "Phần I · Trắc nghiệm", score: scoreResult.p1, ratio: scoreResult.part1?.total ? scoreResult.part1.correct / scoreResult.part1.total : null, detail: scoreResult.part1 ? `${scoreResult.part1.correct}/${scoreResult.part1.total} câu đúng` : "", bar: "from-sky-400 to-indigo-500" },
    { key: "true_false", label: "Phần II · Đúng/Sai", score: scoreResult.p2, ratio: p2Max ? scoreResult.part2.details.reduce((sum, d) => sum + (d.maxMatch ? d.match / d.maxMatch : 0), 0) / p2Max : null, detail: scoreResult.part2?.details?.map((d) => formatP2Answers(d.match, d.maxMatch)).join(" · ") ?? "", bar: "from-violet-500 to-fuchsia-500" },
    { key: "short_answer", label: "Phần III · Trả lời ngắn", score: scoreResult.p3, ratio: scoreResult.part3?.total ? scoreResult.part3.correct / scoreResult.part3.total : null, detail: scoreResult.part3 ? `${scoreResult.part3.correct}/${scoreResult.part3.total} câu đúng` : "", bar: "from-emerald-400 to-teal-500" },
    ...(essay ? [{ key: "essay", label: "Phần IV · Tự luận", score: essay.graded === false ? 0 : scoreResult.p4 ?? 0, ratio: essay.graded !== false && essay.total > 0 ? (scoreResult.p4 ?? 0) / essay.total : null, detail: essay.graded === false ? "Giáo viên chưa chấm xong" : "Giáo viên chấm", bar: "from-fuchsia-400 to-violet-500" }] : []),
  ].filter((s) => questions.some((q) => q.type === s.key));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      {/* ── Score hero ─────────────────────────────────────────────────────── */}
      <section className={`result-pop relative overflow-hidden rounded-[2rem] bg-gradient-to-br ${tier.gradient} p-6 text-white shadow-[var(--shadow-lift)] sm:p-9`}>
        <div aria-hidden="true" className="edu-dots absolute inset-0 opacity-50 mix-blend-overlay" />
        <div aria-hidden="true" className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
        {!standalone && scoreResult.total >= 8 && <Confetti />}
        <div className="relative flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
          <ScoreRing total={scoreResult.total} color={tier.ring} />
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/25 backdrop-blur">
              <tier.Icon size={14} aria-hidden="true" />Kết quả bài làm
            </p>
            <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{tier.label}</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-white/85 sm:text-base">{tier.message}</p>
            <p className="mt-3 line-clamp-2 text-sm font-medium text-white/70">{title}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5 sm:justify-start">
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold ring-1 ring-white/20"><Check size={16} aria-hidden="true" />{rightCount} câu đúng hoàn toàn</span>
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold ring-1 ring-white/20"><X size={16} aria-hidden="true" />{wrongCount} câu cần xem lại</span>
              {pendingCount > 0 && <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold ring-1 ring-white/20"><Minus size={16} aria-hidden="true" />{pendingCount} câu tự luận chờ chấm</span>}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section breakdown ─────────────────────────────────────────────── */}
      <section className={`mt-6 grid gap-4 ${sections.length === 3 ? "sm:grid-cols-3" : sections.length === 2 ? "sm:grid-cols-2" : ""}`} aria-label="Điểm từng phần">
        {sections.map((s, i) => (
          <div key={s.key} className="result-rise rounded-3xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-soft)]" style={{ animationDelay: `${150 + i * 90}ms` }}>
            <p className="text-sm font-semibold text-gray-500">{s.label}</p>
            <p className="mt-1 font-display text-3xl font-extrabold text-gray-900">{formatPoints(s.score)}<span className="ml-1 text-base font-semibold text-gray-400">{s.key === "essay" && essay ? `/ ${formatPoints(essay.total)} điểm` : "điểm"}</span></p>
            {s.ratio !== null && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full bg-gradient-to-r ${s.bar}`} style={{ width: `${Math.round(Math.min(1, s.ratio) * 100)}%` }} />
              </div>
            )}
            {s.detail && <p className="mt-2 text-xs leading-5 text-gray-500">{s.detail}</p>}
            {s.key === "essay" && essayRows.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-xs text-gray-600" aria-label="Điểm từng câu tự luận">
                {essayRows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3">
                    <a href={`#review-q-${row.number}`} className="font-semibold text-violet-700 hover:underline">Câu {row.number}</a>
                    <span className="tabular-nums">{essay?.graded === false || row.got === undefined ? "chưa chấm" : formatPoints(row.got)} / {formatPoints(row.max)} điểm</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>

      {/* ── Question map + filter ─────────────────────────────────────────── */}
      <section className="result-rise z-20 mt-6 lg:sticky lg:top-[4.5rem] rounded-3xl border border-gray-200 bg-white/85 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:p-5" style={{ animationDelay: "380ms" }} aria-label="Bản đồ câu hỏi">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-lg font-bold text-gray-900">Xem lại từng câu</h2>
          <div className="flex gap-1 rounded-2xl bg-gray-100 p-1" role="tablist" aria-label="Lọc câu hỏi">
            {([["all", `Tất cả (${results.length})`], ["wrong", `Câu sai (${wrongCount})`], ["right", `Câu đúng (${rightCount})`]] as [Filter, string][]).map(([key, label]) => (
              <button key={key} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className={`min-h-9 flex-1 whitespace-nowrap rounded-xl px-3 text-xs font-semibold transition-all sm:flex-none sm:text-sm ${filter === key ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {questions.map((q, idx) => (
            <a key={q.id} href={`#review-q-${idx + 1}`} title={`Câu ${idx + 1}: ${STATUS_STYLE[statuses[idx]].label}`} className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition hover:-translate-y-0.5 ${STATUS_STYLE[statuses[idx]].map}`}>
              {idx + 1}
            </a>
          ))}
        </div>
      </section>

      {/* ── Per-question review ───────────────────────────────────────────── */}
      <div className="mt-6 space-y-5">
        {questions.map((q, idx) => {
          const status = statuses[idx];
          const isCorrect = status === "right";
          if ((filter === "wrong" && (status === "right" || status === "pending")) || (filter === "right" && !isCorrect)) return null;
          const prevType = idx > 0 ? questions[idx - 1].type : null;
          const isFirstOfSection = filter === "all" && (idx === 0 || prevType !== q.type);
          const sectionMeta = SECTION_META[q.type];
          const hasExplanation = !!(q.explanation || q.explanationTikzImageUrl || q.explanationTikzCode);

          return (
            <div key={q.id} id={`review-q-${idx + 1}`} className="scroll-mt-48">
              {isFirstOfSection && sectionMeta && (
                <div className="mb-4 mt-8 flex items-center gap-3 first:mt-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 font-display text-sm font-extrabold text-white shadow-md shadow-indigo-500/25">{sectionMeta.roman}</span>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{sectionMeta.label}</p>
                    <p className="text-xs text-gray-500">{sectionMeta.note}</p>
                  </div>
                </div>
              )}
              <article className={`relative overflow-hidden rounded-3xl border bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6 ${STATUS_STYLE[status].border}`}>
                <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${STATUS_STYLE[status].bar}`} />
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-gray-900 px-3 py-1 text-xs font-bold text-white">Câu {idx + 1}</span>
                  {q.type === "essay" ? (
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[status].chip}`}>
                      {status === "pending"
                        ? `Chờ chấm · tối đa ${formatPoints(essay?.maxPoints.get(q.id) ?? 0)} điểm`
                        : `${formatPoints(essay?.scores[q.id] ?? 0)} / ${formatPoints(essay?.maxPoints.get(q.id) ?? 0)} điểm${status === "partial" ? " · đúng một phần" : status === "wrong" ? " · chưa đạt" : ""}`}
                    </span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${isCorrect ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"}`}>
                      {isCorrect ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}{isCorrect ? "Chính xác" : "Chưa đúng"}
                    </span>
                  )}
                </div>
                <div className="exam-reading mb-4 font-medium leading-relaxed text-gray-900">
                  {processLatexText(q.questionText)}
                </div>

                {(q.tikzImageUrl || q.tikzCode) && (
                  <div className="mb-4 flex justify-center rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    {q.tikzImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={q.tikzImageUrl} alt="Hình vẽ Toán học" className="h-auto max-w-full" loading="lazy" />
                    ) : (
                      <TikzRenderer code={q.tikzCode as string} />
                    )}
                  </div>
                )}

                {/* ── P1 review ── */}
                {q.type === "multiple_choice" && q.options && (
                  <div className="mb-4 grid gap-2">
                    {q.options.map((opt, i) => {
                      const isStudentPick = p1Ans[q.id] === i;
                      const isCorrectAns = (q.correctAnswer as number) === i;
                      return (
                        <div key={i} className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm ${isCorrectAns ? "border-emerald-300 bg-emerald-50 text-emerald-950" : isStudentPick ? "border-rose-300 bg-rose-50 text-rose-950" : "border-gray-200 bg-white text-gray-600"}`}>
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${isCorrectAns ? "bg-emerald-500 text-white" : isStudentPick ? "bg-rose-500 text-white" : "bg-gray-100 text-gray-500"}`}>{String.fromCharCode(65 + i)}</span>
                          <span className="flex-1">{processLatexText(opt)}</span>
                          {isCorrectAns && <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700"><Check size={14} aria-hidden="true" />Đáp án đúng</span>}
                          {isStudentPick && !isCorrectAns && <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-rose-600"><X size={14} aria-hidden="true" />Bạn chọn</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── P2 review ── */}
                {q.type === "true_false" && q.options && (
                  <div className="mb-4 overflow-x-auto rounded-2xl border border-gray-200">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 text-xs">
                          <th className="w-10 px-3 py-2.5 text-center font-semibold text-gray-500">Ý</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Phát biểu</th>
                          <th className="w-24 px-2 py-2.5 text-center font-semibold text-gray-500">Bạn chọn</th>
                          <th className="w-24 px-2 py-2.5 text-center font-semibold text-gray-500">Đáp án</th>
                        </tr>
                      </thead>
                      <tbody>
                        {q.options.map((stmt, i) => {
                          const correctBool = (q.correctAnswer as boolean[])[i];
                          const studentVal = (p2Ans[q.id] ?? [])[i];
                          const answered = studentVal === true || studentVal === false;
                          const isMatch = studentVal === correctBool;
                          return (
                            <tr key={i} className="border-t border-gray-100">
                              <td className="px-3 py-3 text-center font-bold text-violet-600">{String.fromCharCode(97 + i)}</td>
                              <td className="px-3 py-3 leading-relaxed text-gray-800">{processLatexText(stmt)}</td>
                              <td className="px-2 py-2 text-center">
                                {answered ? (
                                  <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${isMatch ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"}`}>
                                    {isMatch ? <Check size={12} aria-hidden="true" /> : <X size={12} aria-hidden="true" />}{studentVal ? "Đúng" : "Sai"}
                                  </span>
                                ) : <span className="inline-flex items-center gap-1 text-xs text-gray-400"><Minus size={12} aria-hidden="true" />Bỏ trống</span>}
                              </td>
                              <td className="px-2 py-2 text-center">
                                <span className={`inline-block rounded-lg px-2 py-1 text-xs font-bold ${correctBool ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}>{correctBool ? "ĐÚNG" : "SAI"}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {q.type === "essay" && String(q.correctAnswer ?? "").trim() && (
                  <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"><b>Đáp số:</b> <Latex>{String(q.correctAnswer)}</Latex></p>
                )}

                {q.type === "essay" && essay?.comments[q.id] && (
                  <p className="mb-4 rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm text-violet-900"><b>Nhận xét của giáo viên:</b> {essay.comments[q.id]}</p>
                )}

                {/* ── P3 review ── */}
                {q.type === "short_answer" && (
                  <div className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
                    <div className={`rounded-2xl border px-4 py-3 ${isCorrect ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                      <p className="text-xs font-semibold text-gray-500">Bạn nhập</p>
                      <p className={`mt-1 text-lg font-bold ${isCorrect ? "text-emerald-800" : "text-rose-800"}`}>{p3Ans[q.id] || <em className="text-sm font-medium text-gray-400">Chưa trả lời</em>}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <p className="text-xs font-semibold text-gray-500">Đáp án đúng</p>
                      <p className="mt-1 text-lg font-bold text-emerald-800">
                        {q.correctAnswerImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={q.correctAnswerImageUrl} alt="Đáp án MathType" className="inline-block h-auto max-h-16 max-w-full align-middle" />
                        ) : (
                          <Latex>{String(q.correctAnswer ?? "")}</Latex>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* Explanation: opened by default on wrong answers */}
                {hasExplanation && (
                  <details open={!isCorrect} className="group rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-violet-50/40">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-indigo-700 [&::-webkit-details-marker]:hidden">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm"><BookOpenCheck size={15} aria-hidden="true" /></span>
                      Lời giải chi tiết
                      <ChevronDown size={16} aria-hidden="true" className="ml-auto transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-indigo-100 px-4 pb-4 pt-3">
                      {(q.explanationTikzImageUrl || q.explanationTikzCode) && (
                        <div className="mb-3 flex justify-center rounded-xl border border-gray-200 bg-white p-3">
                          {q.explanationTikzImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={q.explanationTikzImageUrl} alt="Hình vẽ lời giải" className="h-auto max-w-full" loading="lazy" />
                          ) : (
                            <TikzRenderer code={q.explanationTikzCode as string} />
                          )}
                        </div>
                      )}
                      {q.explanation && (
                        <div className="text-sm leading-relaxed text-gray-700">
                          <ExplanationRenderer explanation={q.explanation} />
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </article>
            </div>
          );
        })}
        {filter === "all" && essay?.slot}
        {filter !== "all" && (filter === "wrong" ? wrongCount : rightCount) === 0 && (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
            {filter === "wrong" ? "Tuyệt vời — không có câu nào sai!" : "Chưa có câu nào đúng hoàn toàn. Xem lời giải để cải thiện nhé."}
          </div>
        )}
      </div>

      {!standalone && (
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-6 font-semibold text-gray-700 shadow-sm transition hover:border-brand-200 hover:text-brand-700">
            <Home size={18} aria-hidden="true" />Về trang chủ
          </Link>
          <Link href="/student/history" className="edu-btn inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-6 font-semibold text-white">
            <History size={18} aria-hidden="true" />Lịch sử làm bài
          </Link>
        </div>
      )}
    </div>
  );
}
