"use client";

import Link from "next/link";
import { BookOpenCheck, FileText, GraduationCap, ShieldAlert, UserCheck, UserPlus, UsersRound } from "lucide-react";
import { BarChart, Delta, Kpi, Panel, StateBox, fmtNum, useSystemData } from "@/components/system/ui";

interface Overview {
  totals: { users: number; students: number; teachers: number; pendingTeachers: number; disabled: number; exams: number; hiddenExams: number; submissions: number; classes: number; pendingGrading: number };
  activity: { activeStudents30: number; activeTeachers30: number; usersLast7: number; usersPrev7: number; submissionsLast7: number; submissionsPrev7: number };
  series: Array<{ day: string; users: number; submissions: number; exams: number }>;
}

export default function SystemOverviewPage() {
  const { data, error, loading, reload } = useSystemData<Overview>("/api/system/overview");
  if (!data) return <StateBox loading={loading} error={error} onRetry={reload} />;
  const { totals, activity, series } = data;
  const attention = [
    { show: totals.pendingTeachers > 0, label: "Giáo viên chờ duyệt", value: totals.pendingTeachers, href: "/system/users?filter=pending", icon: UserCheck },
    { show: totals.pendingGrading > 0, label: "Bài tự luận chờ chấm", value: totals.pendingGrading, href: "", icon: BookOpenCheck },
    { show: totals.hiddenExams > 0, label: "Đề đang bị ẩn", value: totals.hiddenExams, href: "/system/exams?filter=hidden", icon: ShieldAlert },
    { show: totals.disabled > 0, label: "Tài khoản bị khóa", value: totals.disabled, href: "/system/users?filter=disabled", icon: UsersRound },
  ].filter((item) => item.show);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-extrabold text-gray-900">Tổng quan</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Người dùng" value={fmtNum(totals.users)} icon={UsersRound} footer={<Delta current={activity.usersLast7} previous={activity.usersPrev7} />} />
        <Kpi label="Học sinh hoạt động · 30 ngày" value={fmtNum(activity.activeStudents30)} icon={GraduationCap} footer={<span className="text-xs text-gray-400">trên {fmtNum(totals.students)} học sinh</span>} />
        <Kpi label="Giáo viên hoạt động · 30 ngày" value={fmtNum(activity.activeTeachers30)} icon={UserPlus} footer={<span className="text-xs text-gray-400">trên {fmtNum(totals.teachers)} giáo viên</span>} />
        <Kpi label="Bài nộp · 7 ngày" value={fmtNum(activity.submissionsLast7)} icon={FileText} footer={<Delta current={activity.submissionsLast7} previous={activity.submissionsPrev7} />} />
      </div>

      {attention.length > 0 && (
        <Panel title="Cần xử lý">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {attention.map(({ label, value, href, icon: Icon }) => {
              const body = (
                <>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><Icon size={17} aria-hidden="true" /></span>
                  <span className="min-w-0"><span className="block font-display text-lg font-extrabold tabular-nums text-gray-900">{fmtNum(value)}</span><span className="block truncate text-xs text-gray-500">{label}</span></span>
                </>
              );
              return (
                <li key={label}>
                  {href ? <Link href={href} className="flex min-h-14 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/30 px-3 transition hover:bg-amber-50">{body}</Link>
                    : <div className="flex min-h-14 items-center gap-3 rounded-xl border border-gray-200 px-3">{body}</div>}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Người dùng mới · 30 ngày"><BarChart points={series.map((item) => ({ label: item.day, value: item.users }))} /></Panel>
        <Panel title="Bài nộp · 30 ngày"><BarChart points={series.map((item) => ({ label: item.day, value: item.submissions }))} color="#059669" /></Panel>
        <Panel title="Đề mới · 30 ngày"><BarChart points={series.map((item) => ({ label: item.day, value: item.exams }))} color="#7c3aed" /></Panel>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Đề thi" value={fmtNum(totals.exams)} />
        <Kpi label="Bài nộp (tổng)" value={fmtNum(totals.submissions)} />
        <Kpi label="Lớp học" value={fmtNum(totals.classes)} />
        <Kpi label="Tài khoản bị khóa" value={fmtNum(totals.disabled)} />
      </div>
    </div>
  );
}
