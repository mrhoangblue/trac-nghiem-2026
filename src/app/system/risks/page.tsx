"use client";

import Link from "next/link";
import { Kpi, Panel, Pill, StateBox, fmtDate, fmtDateTime, fmtNum, useSystemData } from "@/components/system/ui";

interface Risks {
  suspicious: Array<{ id: string; examTitle: string; email: string; at: number; total: number | null; reasons: string[] }>;
  staleGrading: Array<{ email: string; name: string; count: number; oldestDays: number }>;
  waitingTeachers: Array<{ uid: string; email: string; name: string; school: string; waitingDays: number }>;
  unused: Array<{ id: string; title: string; author: string; ageDays: number }>;
  resets: Array<{ examTitle: string; studentEmail: string; deleted: number; by: string; at: number | null }>;
  quality: { previews: number; noEmail: number; zeroScore: number; disabledUsers: number };
}

export default function SystemRisksPage() {
  const { data, error, loading, reload } = useSystemData<Risks>("/api/system/risks");
  if (!data) return <StateBox loading={loading} error={error} onRetry={reload} />;
  const { quality } = data;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-extrabold text-gray-900">An toàn và chất lượng</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Bài nộp đáng ngờ · 30 ngày" value={fmtNum(data.suspicious.length)} tone={data.suspicious.length > 0 ? "warn" : "default"} />
        <Kpi label="Bài 0 điểm (đã chấm)" value={fmtNum(quality.zeroScore)} footer={<span className="text-xs text-gray-400">có thể là bài trống</span>} />
        <Kpi label="Bài nộp không có email" value={fmtNum(quality.noEmail)} tone={quality.noEmail > 0 ? "warn" : "default"} />
        <Kpi label="Bài làm thử của giáo viên" value={fmtNum(quality.previews)} footer={<span className="text-xs text-gray-400">không tính vào số liệu</span>} />
      </div>

      <Panel title="Bài nộp đáng ngờ" className="!p-0 overflow-hidden">
        {data.suspicious.length === 0 ? <StateBox empty="Không có bài nộp nào bị gắn cờ." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500"><tr><th className="px-4 py-2.5">Nộp lúc</th><th className="px-3 py-2.5">Học sinh</th><th className="px-3 py-2.5">Đề</th><th className="px-3 py-2.5 text-right">Điểm</th><th className="px-3 py-2.5">Dấu hiệu</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{data.suspicious.map((s) => (
              <tr key={s.id}><td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-gray-600">{fmtDateTime(s.at)}</td><td className="max-w-[200px] truncate px-3 py-2.5 text-gray-800">{s.email || "(không email)"}</td><td className="max-w-[240px] truncate px-3 py-2.5 text-gray-600">{s.examTitle}</td><td className="px-3 py-2.5 text-right tabular-nums">{s.total === null ? "—" : s.total.toLocaleString("vi-VN")}</td><td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{s.reasons.map((r) => <Pill key={r} tone="amber">{r}</Pill>)}</div></td></tr>
            ))}</tbody></table></div>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Giáo viên để bài tự luận chờ quá 48 giờ">
          {data.staleGrading.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">Không có bài nào bị chậm.</p> : (
            <ul className="divide-y divide-gray-100">{data.staleGrading.map((t) => <li key={t.email} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="min-w-0"><span className="block truncate font-semibold text-gray-900">{t.name}</span><span className="block truncate text-xs text-gray-500">{t.email}</span></span><span className="shrink-0 text-right text-xs"><span className="block font-display text-base font-extrabold tabular-nums text-amber-700">{fmtNum(t.count)} bài</span><span className="text-gray-400">lâu nhất {t.oldestDays} ngày</span></span></li>)}</ul>
          )}
        </Panel>
        <Panel title="Giáo viên chờ duyệt" action={<Link href="/system/users?filter=pending" className="text-xs font-semibold text-indigo-700">Mở danh sách</Link>}>
          {data.waitingTeachers.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">Không có ai đang chờ.</p> : (
            <ul className="divide-y divide-gray-100">{data.waitingTeachers.map((t) => <li key={t.uid} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="min-w-0"><span className="block truncate font-semibold text-gray-900">{t.name || t.email}</span><span className="block truncate text-xs text-gray-500">{t.email}{t.school ? ` · ${t.school}` : ""}</span></span><Pill tone={t.waitingDays >= 3 ? "amber" : "gray"}>chờ {t.waitingDays} ngày</Pill></li>)}</ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Đề quá 14 ngày chưa ai làm">
          {data.unused.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">Mọi đề đều đã có lượt làm.</p> : (
            <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">{data.unused.map((e) => <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="min-w-0"><span className="block truncate font-semibold text-gray-900">{e.title}</span><span className="block truncate text-xs text-gray-500">{e.author || "—"}</span></span><span className="shrink-0 text-xs text-gray-400">{e.ageDays} ngày</span></li>)}</ul>
          )}
        </Panel>
        <Panel title="Giáo viên xóa bài làm để cho làm lại">
          {data.resets.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">Chưa có lần reset nào.</p> : (
            <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">{data.resets.map((r, i) => <li key={i} className="py-2.5 text-sm"><p className="truncate font-semibold text-gray-900">{r.examTitle}</p><p className="truncate text-xs text-gray-500">{r.by} xóa {fmtNum(r.deleted)} bài của {r.studentEmail} · {fmtDate(r.at)}</p></li>)}</ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
