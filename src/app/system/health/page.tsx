"use client";

import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { Panel, StateBox, fmtNum, useSystemData } from "@/components/system/ui";

interface Health {
  services: Array<{ key: string; label: string; ok: boolean; ms: number }>;
  config: Array<{ key: string; label: string; on: boolean; note: string }>;
  counts: Array<{ name: string; count: number | null }>;
  runtime: { node: string; region: string; vercel: boolean };
}
const COLLECTION_LABEL: Record<string, string> = {
  users: "Người dùng", exams: "Đề thi", submissions: "Bài nộp", classes: "Lớp học", class_members: "Thành viên lớp", class_assignments: "Bài tập lớp",
  class_courses: "Khóa học", class_announcements: "Thông báo lớp", notifications: "Thông báo trong trang", push_subscriptions: "Thiết bị nhận thông báo đẩy",
  essay_ai_grading: "Kết quả chấm AI", admin_audit_logs: "Nhật ký quản trị",
};

export default function SystemHealthPage() {
  const { data, error, loading, reload } = useSystemData<Health>("/api/system/health");
  if (!data) return <StateBox loading={loading} error={error} onRetry={reload} />;
  const max = Math.max(1, ...data.counts.map((c) => c.count ?? 0));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-extrabold text-gray-900">Hệ thống</h1>
        <button type="button" onClick={reload} className="flex h-10 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600"><RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />Kiểm tra lại</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.services.map((s) => (
          <Panel key={s.key}>
            <div className="flex items-center gap-3">
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{s.ok ? <CheckCircle2 size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-900">{s.label}</p><p className="text-xs text-gray-500">{s.ok ? "Hoạt động" : "Không kết nối được"}</p></div>
              <span className="font-display text-lg font-extrabold tabular-nums text-gray-900">{s.ms}<span className="text-xs font-semibold text-gray-400"> ms</span></span>
            </div>
          </Panel>
        ))}
      </div>
      <Panel title="Cấu hình dịch vụ">
        <ul className="divide-y divide-gray-100">
          {data.config.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0"><span className="block truncate font-semibold text-gray-800">{c.label}</span>{c.note && <span className="block truncate text-xs text-gray-400">{c.note}</span>}</span>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${c.on ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{c.on ? "Đã bật" : "Chưa cấu hình"}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Số bản ghi theo nhóm dữ liệu">
        <ul className="space-y-2.5">
          {[...data.counts].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).map((c) => (
            <li key={c.name}>
              <div className="flex items-baseline justify-between text-sm"><span className="font-semibold text-gray-800">{COLLECTION_LABEL[c.name] ?? c.name}</span><span className="font-bold tabular-nums text-gray-900">{c.count === null ? "—" : fmtNum(c.count)}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-gray-100"><div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.max(1, ((c.count ?? 0) / max) * 100)}%` }} /></div>
            </li>
          ))}
        </ul>
      </Panel>
      <p className="text-xs text-gray-400">Chạy trên {data.runtime.vercel ? "Vercel" : "máy chủ"}{data.runtime.region ? ` · vùng ${data.runtime.region}` : ""} · Node {data.runtime.node}</p>
    </div>
  );
}
