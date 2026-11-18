"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Kpi, Panel, Pill, StateBox, fmtAgo, fmtDate, fmtNum, useSystemData } from "@/components/system/ui";

interface Row {
  id: string; name: string; code: string; active: boolean; createdAt: number | null; teacher: string; teacherEmail: string;
  students: number; pending: number; assignments: number; openAssignments: number; courses: number; announcements30: number; lastActivity: number | null; dormant: boolean;
}

export default function SystemClassesPage() {
  const { data, error, loading, reload } = useSystemData<{ classes: Row[] }>("/api/system/classes");
  const [filter, setFilter] = useState<"all" | "active" | "dormant" | "pending">("all");
  const [search, setSearch] = useState("");
  const all = useMemo(() => data?.classes ?? [], [data]);
  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return all
      .filter((r) => filter === "all" || (filter === "dormant" ? r.dormant : filter === "pending" ? r.pending > 0 : !r.dormant))
      .filter((r) => !keyword || `${r.name} ${r.teacher} ${r.teacherEmail} ${r.code}`.toLowerCase().includes(keyword))
      .sort((a, b) => b.students - a.students);
  }, [all, filter, search]);
  const students = all.reduce((sum, r) => sum + r.students, 0);
  const FILTERS: Array<[typeof filter, string, number]> = [["all", "Tất cả", all.length], ["active", "Đang hoạt động", all.filter((r) => !r.dormant).length], ["dormant", "Không hoạt động 30 ngày", all.filter((r) => r.dormant).length], ["pending", "Có yêu cầu chờ", all.filter((r) => r.pending > 0).length]];

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-extrabold text-gray-900">Lớp học</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Lớp học" value={fmtNum(all.length)} />
        <Kpi label="Học sinh trong lớp" value={fmtNum(students)} footer={<span className="text-xs text-gray-400">{all.length ? `${(students / all.length).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} mỗi lớp` : ""}</span>} />
        <Kpi label="Bài tập đang mở" value={fmtNum(all.reduce((s, r) => s + r.openAssignments, 0))} />
        <Kpi label="Lớp không hoạt động" value={fmtNum(all.filter((r) => r.dormant).length)} tone={all.some((r) => r.dormant) ? "warn" : "default"} />
      </div>
      <Panel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-label="Lọc lớp" className="flex flex-wrap gap-1.5">
            {FILTERS.map(([value, label, count]) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`h-10 rounded-xl px-3 text-sm font-semibold transition ${filter === value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{label} <span className="tabular-nums opacity-70">{fmtNum(count)}</span></button>)}
          </div>
          <label className="relative block lg:w-72"><span className="sr-only">Tìm lớp</span><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tên lớp, giáo viên, mã lớp" className="h-11 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" /></label>
        </div>
      </Panel>
      <Panel className="!p-0 overflow-hidden">
        {!data ? <StateBox loading={loading} error={error} onRetry={reload} /> : rows.length === 0 ? <StateBox empty="Không có lớp phù hợp." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500"><tr><th className="px-4 py-2.5">Lớp</th><th className="px-3 py-2.5">Giáo viên</th><th className="px-3 py-2.5 text-right">Học sinh</th><th className="px-3 py-2.5 text-right">Chờ duyệt</th><th className="px-3 py-2.5 text-right">Bài tập (mở)</th><th className="px-3 py-2.5 text-right">Khóa học</th><th className="px-3 py-2.5 text-right">Thông báo 30 ngày</th><th className="px-3 py-2.5 text-right">Hoạt động</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="max-w-[240px] px-4 py-2.5"><p className="truncate font-semibold text-gray-900">{r.name}</p><p className="text-xs text-gray-500">Mã {r.code || "—"} · tạo {fmtDate(r.createdAt)} {!r.active && <Pill tone="gray">Đã đóng</Pill>}</p></td>
                    <td className="max-w-[220px] px-3 py-2.5"><p className="truncate text-gray-800">{r.teacher || "—"}</p><p className="truncate text-xs text-gray-500">{r.teacherEmail}</p></td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmtNum(r.students)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${r.pending > 0 ? "font-semibold text-amber-700" : ""}`}>{fmtNum(r.pending)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(r.assignments)} ({fmtNum(r.openAssignments)})</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(r.courses)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(r.announcements30)}</td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right ${r.dormant ? "text-amber-700" : "text-gray-600"}`}>{fmtAgo(r.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
