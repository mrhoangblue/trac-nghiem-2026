"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Search } from "lucide-react";
import { Panel, Pill, ReasonDialog, StateBox, fmtDate, fmtNum, systemRequest, useSystemData } from "@/components/system/ui";

interface ExamRow {
  id: string; title: string; author: string; gradeLevel: string | null; examType: string | null; classOnly: boolean;
  questionCount: number; createdAtMillis: number | null; attempts: number; hidden: boolean; hiddenReason: string;
}
type Filter = "all" | "visible" | "hidden";
const PAGE = 50;

function ExamsContent() {
  const params = useSearchParams();
  const { data, error, loading, reload } = useSystemData<{ exams: ExamRow[] }>("/api/system/exams");
  const [filter, setFilter] = useState<Filter>(params.get("filter") === "hidden" ? "hidden" : "all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [target, setTarget] = useState<ExamRow | null>(null);
  const [notice, setNotice] = useState("");

  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (data?.exams ?? [])
      .filter((row) => filter === "all" || (filter === "hidden" ? row.hidden : !row.hidden))
      .filter((row) => !keyword || `${row.title} ${row.author}`.toLowerCase().includes(keyword))
      .sort((a, b) => (b.createdAtMillis ?? 0) - (a.createdAtMillis ?? 0));
  }, [data, filter, search]);
  const hiddenCount = (data?.exams ?? []).filter((row) => row.hidden).length;

  const confirm = async (reason: string) => {
    if (!target) return;
    try {
      await systemRequest("/api/system/exams", { method: "PATCH", body: JSON.stringify({ examId: target.id, action: target.hidden ? "unhide" : "hide", reason }) });
      setNotice(target.hidden ? "Đã hiện lại đề." : "Đã ẩn đề khỏi kho đề.");
      reload();
    } catch {
      setNotice("Không cập nhật được, thử lại.");
    }
    setTarget(null);
  };

  const FILTERS: Array<[Filter, string, number]> = [["all", "Tất cả", data?.exams.length ?? 0], ["visible", "Đang hiện", (data?.exams.length ?? 0) - hiddenCount], ["hidden", "Đã ẩn", hiddenCount]];
  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-extrabold text-gray-900">Đề thi</h1>
      <Panel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-label="Lọc đề" className="flex flex-wrap gap-1.5">
            {FILTERS.map(([value, label, count]) => (
              <button key={value} type="button" onClick={() => { setFilter(value); setLimit(PAGE); }} aria-pressed={filter === value}
                className={`h-10 rounded-xl px-3 text-sm font-semibold transition ${filter === value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{label} <span className="tabular-nums opacity-70">{fmtNum(count)}</span></button>
            ))}
          </div>
          <label className="relative block lg:w-72">
            <span className="sr-only">Tìm đề</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setLimit(PAGE); }} placeholder="Tên đề, giáo viên" className="h-11 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" />
          </label>
        </div>
        {notice && <p role="status" className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">{notice}</p>}
      </Panel>

      <Panel className="!p-0 overflow-hidden">
        {!data ? <StateBox loading={loading} error={error} onRetry={reload} /> : rows.length === 0 ? <StateBox empty="Không có đề phù hợp." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                <tr><th className="px-4 py-2.5">Đề</th><th className="px-3 py-2.5">Giáo viên</th><th className="px-3 py-2.5">Phạm vi</th><th className="px-3 py-2.5 text-right">Câu</th><th className="px-3 py-2.5 text-right">Lượt làm</th><th className="px-3 py-2.5">Tạo</th><th className="sticky right-0 bg-gray-50 px-3 py-2.5 text-right">Thao tác</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.slice(0, limit).map((row) => (
                  <tr key={row.id} className={row.hidden ? "bg-amber-50/40" : undefined}>
                    <td className="max-w-[300px] px-4 py-2.5">
                      <p className="truncate font-semibold text-gray-900">{row.title}</p>
                      <p className="truncate text-xs text-gray-500">{[row.gradeLevel, row.examType].filter(Boolean).join(" · ") || "—"}{row.hidden ? ` · ẩn: ${row.hiddenReason || "không ghi lý do"}` : ""}</p>
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 text-gray-600">{row.author || "—"}</td>
                    <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1"><Pill tone={row.classOnly ? "indigo" : "gray"}>{row.classOnly ? "Chỉ lớp" : "Công khai"}</Pill>{row.hidden && <Pill tone="amber">Đã ẩn</Pill>}</div></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(row.questionCount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(row.attempts)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-600">{fmtDate(row.createdAtMillis)}</td>
                    <td className="sticky right-0 bg-white px-3 py-2.5 text-right">
                      <button type="button" onClick={() => setTarget(row)} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold ${row.hidden ? "border-emerald-200 text-emerald-700" : "border-gray-200 text-gray-700 hover:text-rose-600"}`}>
                        {row.hidden ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}{row.hidden ? "Hiện lại" : "Ẩn đề"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > limit && <button type="button" onClick={() => setLimit(limit + PAGE)} className="h-11 w-full border-t border-gray-100 text-sm font-semibold text-indigo-700">Xem thêm ({fmtNum(rows.length - limit)})</button>}
      </Panel>

      {target && (
        <ReasonDialog title={target.hidden ? "Hiện lại đề" : "Ẩn đề khỏi hệ thống"} detail={target.hidden ? target.title : `${target.title}: học sinh sẽ không thấy hay làm được đề này cho tới khi hiện lại.`}
          confirmLabel={target.hidden ? "Hiện lại" : "Ẩn đề"} danger={!target.hidden} requireReason={!target.hidden} onCancel={() => setTarget(null)} onConfirm={confirm} />
      )}
    </div>
  );
}

export default function SystemExamsPage() {
  return <Suspense fallback={<StateBox loading />}><ExamsContent /></Suspense>;
}
