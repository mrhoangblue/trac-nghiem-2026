import { processLatexText } from "@/utils/textProcessor";
import { rubricTotal, type RubricStep } from "@/utils/essayRubric";

const fmt = (value: number) => String(Math.round(value * 100) / 100).replace(".", ",");

/** Thang chấm từng ý (\buoc) của một câu tự luận; chỉ giáo viên thấy. */
export default function RubricList({ rubric }: { rubric: RubricStep[] }) {
  if (rubric.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-gray-500">Thang chấm · {rubric.length} ý · {fmt(rubricTotal(rubric))} điểm</p>
      <ol className="space-y-1.5">
        {rubric.map((step, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 rounded-md bg-violet-100 px-1.5 py-0.5 font-display text-[11px] font-bold tabular-nums text-violet-800">{fmt(step.points)}</span>
            <span className="min-w-0 leading-6">{processLatexText(step.text)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
