import { AlertTriangle, Sparkles } from "lucide-react";
import { processLatexText } from "@/utils/textProcessor";
import type { AiConfidence, AiQuestionResult } from "@/utils/aiGradingTypes";
import type { RubricStep } from "@/utils/essayRubric";

const fmt = (value: number) => String(Math.round(value * 100) / 100).replace(".", ",");

const CONFIDENCE: Record<AiConfidence, { label: string; className: string }> = {
  high: { label: "AI chắc chắn", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  medium: { label: "AI hơi phân vân", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  low: { label: "Cần thầy cô xem kỹ", className: "bg-rose-50 text-rose-700 ring-rose-200" },
};

/** Điểm AI đề xuất cho một câu: từng ý của thang chấm, chỗ AI dựa vào và mức chắc chắn. */
export default function AiGradeDetail({ result, rubric, onApply }: {
  result: AiQuestionResult;
  rubric: RubricStep[];
  /** Ghi điểm và nhận xét AI vào phiếu chấm của câu này. */
  onApply: () => void;
}) {
  const confidence = CONFIDENCE[result.confidence];
  return (
    <div className="mt-2 rounded-xl border border-violet-200 bg-violet-50/50 p-2.5 text-[13px] leading-5 text-gray-800">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 font-semibold text-violet-800"><Sparkles size={13} aria-hidden="true" />AI đề xuất {fmt(result.score)} / {fmt(result.max)}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${confidence.className}`}>{confidence.label}</span>
        <button type="button" onClick={(event) => { event.stopPropagation(); onApply(); }} className="ml-auto rounded-lg border border-violet-300 bg-white px-2 py-1 text-[11px] font-semibold text-violet-800 hover:bg-violet-100">Dùng điểm này</button>
      </div>
      {result.unreadable && (
        <p className="mt-1.5 flex items-start gap-1 text-xs font-semibold text-rose-700"><AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />AI không đọc được hoặc không tìm thấy bài làm của câu này.</p>
      )}
      {result.steps.length > 0 && (
        <ol className="mt-2 space-y-1.5">
          {result.steps.map((step, index) => {
            const full = step.awarded >= step.points - 1e-9;
            const none = step.awarded <= 1e-9;
            return (
              <li key={index} className="flex items-start gap-2">
                <span className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 font-display text-[11px] font-bold tabular-nums ${full ? "bg-emerald-100 text-emerald-800" : none ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>{fmt(step.awarded)}/{fmt(step.points)}</span>
                <span className="min-w-0">
                  {rubric[index] && <span className="block">{processLatexText(rubric[index].text)}</span>}
                  {step.evidence && <span className="block text-xs text-gray-500">Trong bài: {processLatexText(step.evidence)}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {result.comment && <p className="mt-2 border-t border-violet-200/70 pt-1.5 text-xs text-gray-600">Nhận xét: {processLatexText(result.comment)}</p>}
    </div>
  );
}
