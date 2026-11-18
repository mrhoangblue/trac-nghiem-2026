"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Lock, LockOpen, Search, X } from "lucide-react";
import { Panel, Pill, ReasonDialog, StateBox, fmtAgo, fmtDate, fmtNum, systemRequest, useSystemData } from "@/components/system/ui";

interface Row {
  uid: string; email: string; fullName: string; school: string; role: string; disabled: boolean;
  createdAtMillis: number | null; lastActiveMillis: number | null; submissions: number; exams: number; attemptsOnExams: number; protected: boolean;
}
type Filter = "all" | "pending" | "mod" | "student" | "disabled";
type Pending = { row: Row; action: "approve" | "reject" | "disable" | "enable" | "setRole"; role?: string };

const ROLE_LABEL: Record<string, string> = { mod: "Giáo viên", student: "Học sinh", pending_teacher: "Chờ duyệt", admin: "Quản trị" };
const PAGE = 50;

function UsersContent() {
  const params = useSearchParams();
  const initial = (["pending", "mod", "student", "disabled"].includes(params.get("filter") ?? "") ? params.get("filter") : "all") as Filter;
  const { data, error, loading, reload } = useSystemData<{ users: Row[] }>("/api/system/users");
  const [filter, setFilter] = useState<Filter>(initial);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState("");

  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (data?.users ?? [])
      .filter((row) => filter === "all" || (filter === "pending" ? row.role === "pending_teacher" : filter === "disabled" ? row.disabled : row.role === filter))
      .filter((row) => !keyword || `${row.fullName} ${row.email} ${row.school}`.toLowerCase().includes(keyword))
      .sort((a, b) => (b.createdAtMillis ?? 0) - (a.createdAtMillis ?? 0));
  }, [data, filter, search]);
  const counts = useMemo(() => {
    const all = data?.users ?? [];
    return { all: all.length, pending: all.filter((r) => r.role === "pending_teacher").length, mod: all.filter((r) => r.role === "mod").length, student: all.filter((r) => r.role === "student").length, disabled: all.filter((r) => r.disabled).length };
  }, [data]);

  const run = async (reason: string) => {
    if (!pending) return;
    try {
      await systemRequest("/api/system/users", { method: "PATCH", body: JSON.stringify({ uid: pending.row.uid, action: pending.action, role: pending.role, reason }) });
      setNotice("Đã cập nhật.");
      setPending(null);
      reload();
    } catch (failure) {
      setNotice(failure instanceof Error && failure.message === "PROTECTED_ACCOUNT" ? "Không thể thao tác lên tài khoản quản trị." : "Không cập nhật được, thử lại.");
      setPending(null);
    }
  };

  const FILTERS: Array<[Filter, string]> = [["all", "Tất cả"], ["pending", "Chờ duyệt"], ["mod", "Giáo viên"], ["student", "Học sinh"], ["disabled", "Đã khóa"]];
  const titles: Record<Pending["action"], string> = { approve: "Duyệt làm giáo viên", reject: "Từ chối giáo viên", disable: "Khóa tài khoản", enable: "Mở khóa tài khoản", setRole: "Đổi vai trò" };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-extrabold text-gray-900">Người dùng</h1>
      <Panel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-label="Lọc người dùng" className="flex flex-wrap gap-1.5">
            {FILTERS.map(([value, label]) => (
              <button key={value} type="button" onClick={() => { setFilter(value); setLimit(PAGE); }} aria-pressed={filter === value}
                className={`h-10 rounded-xl px-3 text-sm font-semibold transition ${filter === value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {label} <span className="tabular-nums opacity-70">{fmtNum(counts[value])}</span>
              </button>
            ))}
          </div>
          <label className="relative block lg:w-72">
            <span className="sr-only">Tìm người dùng</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setLimit(PAGE); }} placeholder="Tên, email, trường" className="h-11 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" />
          </label>
        </div>
        {notice && <p role="status" className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">{notice}</p>}
      </Panel>

      <Panel className="!p-0 overflow-hidden">
        {!data ? <StateBox loading={loading} error={error} onRetry={reload} /> : rows.length === 0 ? <StateBox empty="Không có người dùng phù hợp." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                <tr><th className="px-4 py-2.5">Người dùng</th><th className="px-3 py-2.5">Vai trò</th><th className="px-3 py-2.5">Đăng ký</th><th className="px-3 py-2.5">Hoạt động</th><th className="px-3 py-2.5 text-right">Bài nộp</th><th className="px-3 py-2.5 text-right">Đề / lượt làm</th><th className="sticky right-0 bg-gray-50 px-3 py-2.5 text-right">Thao tác</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.slice(0, limit).map((row) => (
                  <tr key={row.uid} className={row.disabled ? "bg-rose-50/30" : undefined}>
                    <td className="max-w-[260px] px-4 py-2.5">
                      <p className="truncate font-semibold text-gray-900">{row.fullName || "(chưa có tên)"}</p>
                      <p className="truncate text-xs text-gray-500">{row.email}{row.school ? ` · ${row.school}` : ""}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1"><Pill tone={row.role === "pending_teacher" ? "amber" : row.role === "mod" ? "green" : row.role === "admin" ? "indigo" : "gray"}>{ROLE_LABEL[row.role] ?? row.role}</Pill>{row.disabled && <Pill tone="rose">Đã khóa</Pill>}</div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-600">{fmtDate(row.createdAtMillis)}</td>
                    <td className="px-3 py-2.5 text-gray-600">{fmtAgo(row.lastActiveMillis)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(row.submissions)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.role === "mod" || row.exams > 0 ? `${fmtNum(row.exams)} / ${fmtNum(row.attemptsOnExams)}` : "—"}</td>
                    <td className="sticky right-0 bg-white px-3 py-2.5">
                      {row.protected || row.role === "admin" ? <span className="block text-right text-xs text-gray-400">Quản trị</span> : (
                        <div className="flex items-center justify-end gap-1.5">
                          {row.role === "pending_teacher" && (
                            <>
                              <button type="button" onClick={() => setPending({ row, action: "approve" })} className="inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-xs font-semibold text-white"><Check size={14} aria-hidden="true" />Duyệt</button>
                              <button type="button" onClick={() => setPending({ row, action: "reject" })} className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-200 px-2.5 text-xs font-semibold text-gray-700"><X size={14} aria-hidden="true" />Từ chối</button>
                            </>
                          )}
                          {row.role !== "pending_teacher" && (
                            <select aria-label={`Vai trò của ${row.email}`} value={row.role} onChange={(event) => setPending({ row, action: "setRole", role: event.target.value })} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700">
                              <option value="student">Học sinh</option><option value="mod">Giáo viên</option>
                            </select>
                          )}
                          <button type="button" onClick={() => setPending({ row, action: row.disabled ? "enable" : "disable" })} aria-label={row.disabled ? `Mở khóa ${row.email}` : `Khóa ${row.email}`}
                            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${row.disabled ? "border-emerald-200 text-emerald-700" : "border-gray-200 text-gray-500 hover:text-rose-600"}`}>
                            {row.disabled ? <LockOpen size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > limit && <button type="button" onClick={() => setLimit(limit + PAGE)} className="h-11 w-full border-t border-gray-100 text-sm font-semibold text-indigo-700">Xem thêm ({fmtNum(rows.length - limit)})</button>}
      </Panel>

      {pending && (
        <ReasonDialog title={titles[pending.action]} detail={`${pending.row.fullName || pending.row.email} · ${pending.row.email}${pending.role ? ` → ${ROLE_LABEL[pending.role]}` : ""}`}
          confirmLabel="Xác nhận" danger={pending.action === "disable" || pending.action === "reject"} requireReason={pending.action === "disable"}
          onCancel={() => setPending(null)} onConfirm={run} />
      )}
    </div>
  );
}

export default function SystemUsersPage() {
  return <Suspense fallback={<StateBox loading />}><UsersContent /></Suspense>;
}
