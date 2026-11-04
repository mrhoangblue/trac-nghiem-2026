"use client";

import Image from "next/image";
import Latex from "react-latex-next";
import "katex/dist/katex.min.css";
import { AlertTriangle, Check, X } from "lucide-react";
import type { ParsedQuestion } from "@/utils/latexParser";
import { processLatexText } from "@/utils/textProcessor";
import TikzRenderer from "@/components/TikzRenderer";
import ExplanationRenderer from "@/components/ExplanationRenderer";
import { essayQuestionPoints } from "@/utils/examStructure";

const SECTIONS = [
  { type: "multiple_choice", roman: "I", label: "Trắc nghiệm nhiều phương án", tone: "from-sky-400 to-indigo-500" },
  { type: "true_false", roman: "II", label: "Trắc nghiệm Đúng – Sai", tone: "from-amber-400 to-orange-500" },
  { type: "short_answer", roman: "III", label: "Trả lời ngắn", tone: "from-emerald-400 to-teal-500" },
  { type: "essay", roman: "IV", label: "Tự luận", tone: "from-fuchsia-400 to-violet-500" },
] as const;

export default function ExamPreview({
  questions,
  title,
  description,
  coverImageUrl,
  chips,
  part4TotalScore,
  hideAnswers = false,
  onEssayPointsChange,
}: {
  questions: ParsedQuestion[];
  title: string;
  description?: string;
  coverImageUrl?: string;
  chips: string[];
  /** Có giá trị khi đề 4 phần: hiện điểm từng câu tự luận. */
  part4TotalScore?: number;
  /** Bản in cho học sinh: không tô đáp án, không hiện lời giải. */
  hideAnswers?: boolean;
  /** Khi có: hiện bảng nhận dạng câu hỏi và cho giáo viên đặt điểm từng câu tự luận. */
  onEssayPointsChange?: (questionId: number, points: number | null) => void;
}) {
  const essayPoints = part4TotalScore === undefined ? null : essayQuestionPoints(questions, part4TotalScore);
  return (
    <article className="space-y-6">
      {coverImageUrl && /^https?:\/\//i.test(coverImageUrl) && (
        <div className="relative aspect-[16/7] overflow-hidden rounded-2xl bg-brand-50">
          <Image src={coverImageUrl} alt={`Ảnh minh họa ${title}`} fill unoptimized className="object-cover" />
        </div>
      )}
      <header className="border-b border-gray-100 pb-5 text-center">
        <h3 className="font-display text-xl font-extrabold text-gray-900">{title}</h3>
        {description && <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">{description}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          {chips.map((chip) => <span key={chip} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{chip}</span>)}
        </div>
      </header>

      {onEssayPointsChange && (
        <ClassificationPanel questions={questions} essayPoints={essayPoints} onEssayPointsChange={onEssayPointsChange} />
      )}

      {SECTIONS.map((section) => {
        const sectionQuestions = questions.filter((question) => question.type === section.type);
        if (sectionQuestions.length === 0) return null;
        return (
          <section key={section.type} className="space-y-4">
            <div className="flex items-center gap-3">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br font-display text-xs font-bold text-white ${section.tone}`}>{section.roman}</span>
              <p className="font-display text-sm font-bold text-gray-900">Phần {section.roman}. {section.label}</p>
              <span className="ml-auto text-xs font-medium text-gray-400">{sectionQuestions.length} câu</span>
            </div>
            {sectionQuestions.map((question) => {
              const number = questions.indexOf(question) + 1;
              return (
                <div key={question.id} id={`preview-q-${question.id}`} className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                  <div className={question.tikzCode ? "grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)]" : ""}>
                    <div className="min-w-0 space-y-3">
                      <div className="leading-7 text-gray-900">
                        <span className="mr-1.5 font-display font-bold text-brand-600">Câu {number}.</span>
                        {question.type === "essay" && essayPoints && (
                          <span className="mr-1.5 rounded-md bg-violet-50 px-1.5 py-0.5 text-xs font-bold text-violet-700">{String(essayPoints.get(question.id) ?? 0).replace(".", ",")} điểm</span>
                        )}
                        {processLatexText(question.questionText)}
                      </div>
                      <AnswerPreview question={question} hideAnswers={hideAnswers} />
                    </div>
                    {question.tikzCode && (
                      <div className="flex min-h-40 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <TikzRenderer code={question.tikzCode} />
                      </div>
                    )}
                  </div>
                  {question.imageUrls && question.imageUrls.length > 0 && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {question.imageUrls.map((url, imageIndex) => (
                        <Image key={`${url}-${imageIndex}`} src={url} alt={`Hình minh họa câu ${number}`} width={960} height={640} unoptimized className="max-h-72 w-full rounded-xl border border-gray-200 bg-gray-50 object-contain p-2" />
                      ))}
                    </div>
                  )}
                  {question.explanation && !hideAnswers && (
                    <details className="group mt-3 rounded-xl bg-gray-50 text-sm text-gray-700">
                      <summary className="flex min-h-10 cursor-pointer list-none items-center px-3 font-semibold text-gray-600 marker:hidden">
                        <span className="mr-2 transition-transform group-open:rotate-90">›</span>{question.type === "essay" ? "Hướng dẫn chấm (học sinh không thấy)" : "Lời giải"}
                      </summary>
                      <div className="border-t border-gray-200 px-3 py-3"><ExplanationRenderer explanation={question.explanation} /></div>
                    </details>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </article>
  );
}

/** "Câu 1–12, 15" từ danh sách số câu. */
function formatRanges(numbers: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < numbers.length; i++) {
    let j = i;
    while (j + 1 < numbers.length && numbers[j + 1] === numbers[j] + 1) j++;
    parts.push(j > i ? `${numbers[i]}–${numbers[j]}` : String(numbers[i]));
    i = j;
  }
  return parts.join(", ");
}

const formatPoints = (value: number) => String(Math.round(value * 100) / 100).replace(".", ",");

function ClassificationPanel({
  questions,
  essayPoints,
  onEssayPointsChange,
}: {
  questions: ParsedQuestion[];
  essayPoints: Map<number, number> | null;
  onEssayPointsChange: (questionId: number, points: number | null) => void;
}) {
  const essays = questions.map((question, index) => ({ question, number: index + 1 })).filter((item) => item.question.type === "essay");
  const total = essays.reduce((sum, item) => sum + (essayPoints?.get(item.question.id) ?? item.question.points ?? 0), 0);
  return (
    <section aria-label="Bảng nhận dạng câu hỏi" className="rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
      <p className="font-display text-sm font-bold text-gray-900">Hệ thống đã nhận dạng</p>
      <ul className="mt-2 grid gap-1.5 text-sm text-gray-700 sm:grid-cols-2">
        {SECTIONS.map((section) => {
          const numbers = questions.map((question, index) => (question.type === section.type ? index + 1 : 0)).filter(Boolean);
          return (
            <li key={section.type} className="flex items-baseline gap-2">
              <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gradient-to-br text-[10px] font-bold text-white ${section.tone}`}>{section.roman}</span>
              <span className="font-semibold">{section.label}:</span>
              <span className={numbers.length ? "text-gray-700" : "text-gray-400"}>{numbers.length ? `${numbers.length} câu (câu ${formatRanges(numbers)})` : "không có"}</span>
            </li>
          );
        })}
      </ul>
      {essays.length > 0 && (
        <div className="mt-4 border-t border-brand-100 pt-3">
          <p className="text-sm font-semibold text-gray-900">Phần IV · đặt điểm từng câu tự luận</p>
          <p className="mt-0.5 text-xs text-gray-500">Câu tự luận là khối có lệnh <code className="rounded bg-white px-1">{"\\dapso{}"}</code>. Nhập điểm tối đa cho từng câu, tổng Phần IV tự cộng.</p>
          <ul className="mt-2 space-y-1.5">
            {essays.map(({ question, number }) => {
              const effective = essayPoints?.get(question.id) ?? question.points ?? 0;
              const hasMarker = String(question.correctAnswer ?? "").trim() !== "";
              return (
                <li key={question.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white px-3 py-2 text-sm">
                  <a href={`#preview-q-${question.id}`} className="font-bold text-violet-700 hover:underline">Câu {number}</a>
                  <span className={`text-xs font-medium ${hasMarker ? "text-emerald-700" : "text-amber-700"}`}>
                    {hasMarker ? "có đáp số \\dapso" : "\\dapso{} để trống hoặc không có"}
                  </span>
                  <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-gray-600">
                    Điểm tối đa
                    <input
                      key={`${question.id}-${effective}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step={0.25}
                      defaultValue={effective}
                      aria-label={`Điểm tối đa câu ${number}`}
                      className="h-9 w-20 rounded-lg border border-gray-300 px-2 text-right text-sm font-bold text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                      onBlur={(event) => {
                        const value = event.currentTarget.valueAsNumber;
                        onEssayPointsChange(question.id, Number.isFinite(value) && value > 0 ? value : null);
                      }}
                      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-right text-sm font-bold text-gray-900">Tổng Phần IV: {formatPoints(total)} điểm</p>
        </div>
      )}
    </section>
  );
}

function AnswerPreview({ question, hideAnswers }: { question: ParsedQuestion; hideAnswers: boolean }) {
  if (question.type === "multiple_choice" && question.options) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {question.options.map((option, index) => {
          const correct = !hideAnswers && question.correctAnswer === index;
          return (
            <div key={index} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-sm ${correct ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-gray-200 text-gray-700"}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-display text-xs font-bold ${correct ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-600"}`}>{String.fromCharCode(65 + index)}</span>
              <span className="min-w-0 pt-0.5">{processLatexText(option)}</span>
            </div>
          );
        })}
      </div>
    );
  }
  if (question.type === "true_false" && question.options) {
    const answers = question.correctAnswer as boolean[];
    return (
      <div className="space-y-2">
        {question.options.map((option, index) => (
          <div key={index} className="flex items-start gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700">
            <span className="shrink-0 pt-0.5 font-display font-bold text-gray-500">{String.fromCharCode(97 + index)})</span>
            <span className="min-w-0 flex-1 pt-0.5">{processLatexText(option)}</span>
            {!hideAnswers && <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${answers[index] ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
              {answers[index] ? <Check size={12} aria-hidden="true" /> : <X size={12} aria-hidden="true" />}{answers[index] ? "Đúng" : "Sai"}
            </span>}
          </div>
        ))}
      </div>
    );
  }
  if (hideAnswers) return null;
  if (question.type === "short_answer") {
    const missing = !String(question.correctAnswer ?? "").trim();
    return (
      <div className={`inline-flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm ${missing ? "border-rose-300 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
        <span className="font-semibold">Đáp án:</span>
        {missing ? (
          <span className="inline-flex items-center gap-1 font-semibold"><AlertTriangle size={14} aria-hidden="true" />Thiếu đáp án, cần bổ sung trước khi lưu</span>
        ) : question.correctAnswerImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={question.correctAnswerImageUrl} alt="Đáp án MathType" className="inline-block h-auto max-h-20 max-w-full align-middle" />
        ) : (
          <Latex>{String(question.correctAnswer ?? "")}</Latex>
        )}
        {question.requiresAnswerReview && <span className="basis-full text-xs font-semibold text-amber-700">Cần nhập giá trị chữ/số để chấm tự động.</span>}
      </div>
    );
  }
  if (question.type === "essay") {
    return <p className="rounded-xl border border-dashed border-violet-200 bg-violet-50/50 px-3 py-2 text-xs font-medium text-violet-800">Học sinh làm ra giấy, chụp ảnh hoặc tải PDF lên sau khi nộp Phần I–III. Giáo viên chấm trực tiếp trên bài.</p>;
  }
  return null;
}
