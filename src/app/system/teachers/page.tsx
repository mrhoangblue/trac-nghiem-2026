"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Panel, Pill, StateBox, fmtAgo, fmtDate, fmtNum, useSystemData } from "@/components/system/ui";

interface Row {
  uid: string; email: string; name: string; school: string; status: "pending" | "active" | "dormant" | "new"; disabled: boolean; createdAt: number | null;
  exams: number; attempts: number; attempts30: number; distinctStudents: number; avgScore: number | null;
  classes: number; classStudents: number; pendingGrading: number; lastActivity: number | null;
}
type SortKey = "attempts30" | "attempts" | "exams" | "classStudents" | "pendingGrading" | "lastActivity" | "createdAt";
const STATUS: Record<Row["status"], { label: string; tone: "amber" | "green" | "gray" | "indigo" }> = { pending: { label: "Chờ duyệt", tone: "amber" }, active: { label: "Đang dùng", tone: "green" }, dormant: { label: "Ngừng dùng 30 ngày", tone: "gray" }, new: { label: "Chưa dùng", tone: "indigo" } };

export default function SystemTeachersPage() {
  const { data, error, loading, reload } = useSystemData<{ teachers: Row[] }>("/api/system/teachers");
  const [filter, setFilter] = useState<"all" | Row["status"]>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("attempts30");

  const counts = useMemo(() => {
    const all = data?.teachers ?? [];
    return { all: all.length, active: all.filter((r) => r.status === "active").length, dormant: all.filter((r) => r.status === "dormant").length, new: all.filter((r) => r.status === "new").length, pending: all.filter((r) => r.status === "pending").length };
  }, [data]);
  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (data?.teachers ?? [])
      .filter((r) => filter === "all" || r.status === filter)
      .filter((r) => !keyword || `${r.name} ${r.email} ${r.school}`.toLowerCase().includes(keyword))
      .sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0));
  }, [data, filter, search, sort]);

  const FILTERS: Array<["all" | Row["status"], string]> = [["all", "Tất cả"], ["active", "Đang dùng"], ["dormant", "Ngừng dùng"], ["new", "Chưa dùng"], ["pending", "Chờ duyệt"]];
  const head = (key: SortKey, label: string) => (
    <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => setSort(key)} aria-pressed={sort === key} className={`font-semibold ${sort === key ? "text-indigo-700" : "text-gray-500"}`}>{label}{sort === key ? " ↓" : ""}</button></th>
  );
  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-extrabold text-gray-900">Giáo viên</h1>
      <Panel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-label="Lọc giáo viên" className="flex flex-wrap gap-1.5">
            {FILTERS.map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`h-10 rounded-xl px-3 text-sm font-semibold transition ${filter === value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{label} <span className="tabular-nums opacity-70">{fmtNum(counts[value])}</span></button>
            ))}
          </div>
          <label className="relative block lg:w-72"><span className="sr-only">Tìm giáo viên</span><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tên, email, trường" className="h-11 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" /></label>
        </div>
      </Panel>
      <Panel className="!p-0 overflow-hidden">
        {!data ? <StateBox loading={loading} error={error} onRetry={reload} /> : rows.length === 0 ? <StateBox empty="Không có giáo viên phù hợp." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-gray-50 text-left text-xs"><tr><th className="px-4 py-2.5 font-semibold text-gray-500">Giáo viên</th><th className="px-3 py-2.5 font-semibold text-gray-500">Trạng thái</th>{head("exams", "Đề")}{head("attempts30", "Lượt làm 30 ngày")}{head("attempts", "Lượt làm tổng")}<th className="px-3 py-2.5 text-right font-semibold text-gray-500">HS làm</th><th className="px-3 py-2.5 text-right font-semibold text-gray-500">Điểm TB</th><th className="px-3 py-2.5 text-right font-semibold text-gray-500">Lớp</th>{head("classStudents", "HS trong lớp")}{head("pendingGrading", "Chờ chấm")}{head("lastActivity", "Hoạt động")}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.uid} className={r.disabled ? "bg-rose-50/30" : undefined}>
                    <td className="max-w-[250px] px-4 py-2.5"><p className="truncate font-semibold text-gray-900">{r.name || "(chưa có tên)"}</p><p className="truncate text-xs text-gray-500">{r.email}{r.school ? ` · ${r.school}` : ""}</p><p className="text-[11px] text-gray-400">Đăng ký {fmtDate(r.createdAt)}</p></td>
                    <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1"><Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>{r.disabled && <Pill tone="rose">Đã khóa</Pill>}</div></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(r.exams)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmtNum(r.attempts30)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmtNum(r.attempts)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(r.distinctStudents)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.avgScore === null ? "—" : r.avgScore.toLocaleString("vi-VN")}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(r.classes)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(r.classStudents)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${r.pendingGrading > 0 ? "font-semibold text-amber-700" : ""}`}>{fmtNum(r.pendingGrading)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-gray-600">{fmtAgo(r.lastActivity)}</td>
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
