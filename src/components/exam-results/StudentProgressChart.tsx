import { TrendingDown, TrendingUp } from "lucide-react";

export interface ProgressPoint { examId: string; title: string; total: number; millis: number }

const number = (value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

/** Tiến bộ của một học sinh: điểm cao nhất ở từng đề, đề cũ bên trái. */
export default function StudentProgressChart({ points }: { points: ProgressPoint[] }) {
  if (points.length === 0) return null;
  const totals = points.map((point) => point.total);
  const average = totals.reduce((sum, value) => sum + value, 0) / totals.length;
  const last = totals[totals.length - 1];
  const previous = totals.slice(-4, -1);
  const change = previous.length ? last - previous.reduce((sum, value) => sum + value, 0) / previous.length : 0;
  const width = Math.max(320, points.length * 72);
  const height = 160;
  const left = 28;
  const top = 22;
  const bottom = 26;
  const x = (index: number) => (points.length === 1 ? (left + width) / 2 : left + 16 + (index * (width - left - 32)) / (points.length - 1));
  const y = (total: number) => top + (1 - Math.max(0, Math.min(10, total)) / 10) * (height - top - bottom);
  const tone = (total: number) => (total >= 8 ? "fill-success-500" : total >= 5 ? "fill-yellow-500" : "fill-danger-500");

  return (
    <section className="mb-8 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <h2 className="font-extrabold text-gray-900">Tiến bộ qua các đề</h2>
        <dl className="ml-auto flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
          <div><dt className="inline">Số đề: </dt><dd className="inline font-bold tabular-nums text-gray-900">{points.length}</dd></div>
          <div><dt className="inline">Trung bình: </dt><dd className="inline font-bold tabular-nums text-gray-900">{number(average)}</dd></div>
          <div><dt className="inline">Cao nhất: </dt><dd className="inline font-bold tabular-nums text-gray-900">{number(Math.max(...totals))}</dd></div>
          {previous.length > 0 && Math.abs(change) >= 0.25 && (
            <div className={`inline-flex items-center gap-1 font-bold ${change > 0 ? "text-success-700" : "text-danger-600"}`}>
              {change > 0 ? <TrendingUp size={15} aria-hidden="true" /> : <TrendingDown size={15} aria-hidden="true" />}
              Đề gần nhất {change > 0 ? "tăng" : "giảm"} {number(Math.abs(change))} so với các đề trước
            </div>
          )}
        </dl>
      </div>
      <div className="overflow-x-auto">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Điểm các đề theo thời gian: ${points.map((point) => `${point.title} ${number(point.total)}`).join("; ")}`} className="max-w-none">
          {[0, 5, 10].map((mark) => (
            <g key={mark}>
              <line x1={left} x2={width} y1={y(mark)} y2={y(mark)} className={mark === 5 ? "stroke-gray-300" : "stroke-gray-100"} strokeDasharray={mark === 5 ? "4 4" : undefined} />
              <text x={left - 6} y={y(mark) + 4} textAnchor="end" className="fill-gray-400 text-[10px]">{mark}</text>
            </g>
          ))}
          {points.length > 1 && <polyline fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="stroke-brand-400" points={points.map((point, index) => `${x(index)},${y(point.total)}`).join(" ")} />}
          {points.map((point, index) => (
            <g key={point.examId}>
              <title>{`${point.title}: ${number(point.total)} điểm`}</title>
              <circle cx={x(index)} cy={y(point.total)} r="5" className={`${tone(point.total)} stroke-white`} strokeWidth="2" />
              <text x={x(index)} y={y(point.total) - 9} textAnchor="middle" className="fill-gray-800 text-[11px] font-bold">{number(point.total)}</text>
              <text x={x(index)} y={height - 8} textAnchor="middle" className="fill-gray-400 text-[10px]">{new Date(point.millis).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}</text>
            </g>
          ))}
        </svg>
      </div>
      <p className="mt-2 text-xs text-gray-400">Mỗi điểm là lượt cao nhất của một đề, xếp theo ngày nộp. Đường đứt là mức 5 điểm. Bài tự luận chưa chấm chưa được tính.</p>
    </section>
  );
}
