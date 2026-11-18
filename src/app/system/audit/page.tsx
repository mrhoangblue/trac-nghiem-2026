"use client";

import { Panel, StateBox, fmtDateTime, useSystemData } from "@/components/system/ui";

interface Log { id: string; action: string; targetType: string; targetId: string; targetLabel: string; adminEmail: string; detail: Record<string, unknown>; atMillis: number | null }

const ACTIONS: Record<string, string> = {
  "user.approve_teacher": "Duyệt giáo viên", "user.reject_teacher": "Từ chối giáo viên", "user.set_role": "Đổi vai trò",
  "user.disable": "Khóa tài khoản", "user.enable": "Mở khóa tài khoản", "exam.hide": "Ẩn đề", "exam.unhide": "Hiện lại đề",
};

export default function SystemAuditPage() {
  const { data, error, loading, reload } = useSystemData<{ logs: Log[] }>("/api/system/audit");
  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-extrabold text-gray-900">Nhật ký quản trị</h1>
      <Panel className="!p-0 overflow-hidden">
        {!data ? <StateBox loading={loading} error={error} onRetry={reload} /> : data.logs.length === 0 ? <StateBox empty="Chưa có thao tác nào." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500"><tr><th className="px-4 py-2.5">Thời gian</th><th className="px-3 py-2.5">Thao tác</th><th className="px-3 py-2.5">Đối tượng</th><th className="px-3 py-2.5">Chi tiết</th><th className="px-3 py-2.5">Người làm</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.logs.map((log) => {
                  const detail = Object.entries(log.detail).filter(([, value]) => value !== "" && value !== null && value !== undefined).map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
                  return (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-gray-600">{fmtDateTime(log.atMillis)}</td>
                      <td className="px-3 py-2.5 font-semibold text-gray-900">{ACTIONS[log.action] ?? log.action}</td>
                      <td className="max-w-[260px] truncate px-3 py-2.5 text-gray-600">{log.targetLabel || log.targetId}</td>
                      <td className="max-w-[260px] truncate px-3 py-2.5 text-xs text-gray-500">{detail || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{log.adminEmail}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
