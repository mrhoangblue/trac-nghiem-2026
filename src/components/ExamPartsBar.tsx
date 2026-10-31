import type { PartCounts } from "@/utils/examStructure";

const PARTS = [
  { key: "p1", roman: "I", label: "Trắc nghiệm", short: "TN", bar: "bg-gradient-to-r from-sky-400 to-indigo-500", dot: "bg-indigo-500" },
  { key: "p2", roman: "II", label: "Đúng/Sai", short: "Đ/S", bar: "bg-gradient-to-r from-amber-400 to-orange-500", dot: "bg-orange-500" },
  { key: "p3", roman: "III", label: "Trả lời ngắn", short: "TLN", bar: "bg-gradient-to-r from-emerald-400 to-teal-500", dot: "bg-teal-500" },
  { key: "p4", roman: "IV", label: "Tự luận", short: "TL", bar: "bg-gradient-to-r from-fuchsia-400 to-violet-500", dot: "bg-violet-500" },
] as const;

/**
 * Cấu trúc đề trên thẻ: thanh tỉ lệ số câu từng phần và chú thích.
 * `compact` viết tắt tên phần (TN, Đ/S, TLN, TL) để vừa một dòng.
 */
export default function ExamPartsBar({ counts, compact = false, className = "" }: { counts: PartCounts; compact?: boolean; className?: string }) {
  const parts = PARTS.filter((part) => counts[part.key] > 0);
  const total = parts.reduce((sum, part) => sum + counts[part.key], 0);
  if (!total) return null;
  const summary = parts.map((part) => `Phần ${part.roman} ${part.label}: ${counts[part.key]} câu`).join(", ");
  return (
    <div className={className} role="img" aria-label={`Cấu trúc đề: ${summary}`} title={summary}>
      <div aria-hidden="true" className={`flex gap-0.5 overflow-hidden rounded-full bg-gray-100 ${compact ? "h-1.5" : "h-2"}`}>
        {parts.map((part) => (
          <span key={part.key} className={`h-full first:rounded-l-full last:rounded-r-full ${part.bar}`} style={{ width: `${(counts[part.key] / total) * 100}%` }} />
        ))}
      </div>
      <div aria-hidden="true" className={`flex flex-wrap gap-x-3 gap-y-1 font-semibold text-gray-500 ${compact ? "mt-1.5 text-[11px]" : "mt-2 text-[11px]"}`}>
        {parts.map((part) => (
          <span key={part.key} className="inline-flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${part.dot}`} />
            {compact ? part.short : part.label} <span className="tabular-nums text-gray-800">{counts[part.key]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
