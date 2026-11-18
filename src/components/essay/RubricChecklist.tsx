import { processLatexText } from "@/utils/textProcessor";
import { rubricTotal, type RubricStep } from "@/utils/essayRubric";

const fmt = (value: number) => String(Math.round(value * 100) / 100).replace(".", ",");

/** Thang chấm dạng danh sách tick: mỗi ý đạt thì tick, điểm câu tự cộng lại. */
export default function RubricChecklist({ rubric, ticked, onToggle }: {
  rubric: RubricStep[];
  ticked: boolean[];
  onToggle: (index: number) => void;
}) {
  if (rubric.length === 0) return null;
  const earned = rubric.reduce((sum, step, index) => (ticked[index] ? sum + step.points : sum), 0);
  return (
    <fieldset className="mt-2 min-w-0 rounded-xl border border-violet-200 bg-violet-50/40 p-2">
      <legend className="px-1 text-xs font-semibold text-violet-800">Thang chấm · tick ý đạt ({fmt(earned)}/{fmt(rubricTotal(rubric))} điểm)</legend>
      <ul className="space-y-0.5">
        {rubric.map((step, index) => (
          <li key={index}>
            <label className={`flex min-h-10 cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1.5 text-[13px] leading-5 transition ${ticked[index] ? "bg-emerald-50" : "hover:bg-white"}`}>
              <input type="checkbox" checked={Boolean(ticked[index])} onChange={() => onToggle(index)} className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600" />
              <span className="mt-0.5 shrink-0 rounded-md bg-violet-100 px-1.5 py-0.5 font-display text-[11px] font-bold tabular-nums text-violet-800">{fmt(step.points)}</span>
              <span className="min-w-0 text-gray-800">{processLatexText(step.text)}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
