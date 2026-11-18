"use client";

import Link from "next/link";
import { Activity, BookOpenCheck, FileText, GraduationCap, RefreshCw, School, ShieldAlert, UserCheck, UserPlus, UsersRound } from "lucide-react";
import { BarChart, CohortTable, Delta, Funnel, Kpi, Panel, RankList, StateBox, fmtNum, useSystemData } from "@/components/system/ui";

interface Overview {
  totals: { users: number; students: number; teachers: number; pendingTeachers: number; disabled: number; exams: number; hiddenExams: number; submissions: number; classes: number; activeClasses: number; classMembers: number; assignments: number; courses: number };
  activity: { active7: number; active30: number; activeTeachers30: number; usersLast7: number; usersPrev7: number; submissionsLast7: number; submissionsPrev7: number; avgScore30: number | null; announcements30: number };
  attention: { pendingTeachers: number; oldestPendingTeacherDays: number; pendingJoins: number; pendingGrading: number; staleGrading: number; suspicious30: number; unusedExams: number; hiddenExams: number; disabled: number };
  series: Array<{ day: string; users: number; submissions: number; exams: number; active: number }>;
  teacherFunnel: Array<{ label: string; value: number }>;
  studentFunnel: Array<{ label: string; value: number }>;
  cohorts: Array<{ label: string; size: number; retained: Array<number | null> }>;
  byGrade: Array<{ label: string; exams: number; attempts: number }>;
  hours: Array<{ label: string; value: number }>;
  weekdays: Array<{ label: string; value: number }>;
  topExams: Array<{ id: string; title: string; attempts: number; avg: number | null }>;
  topTeachers: Array<{ email: string; name: string; attempts: number }>;
}

export default function SystemOverviewPage() {
  const { data, error, loading, reload } = useSystemData<Overview>("/api/system/overview");
  if (!data) return <StateBox loading={loading} error={error} onRetry={reload} />;
  const { totals, activity, attention, series } = data;
  const todo = [
    { label: "Giáo viên chờ duyệt", value: attention.pendingTeachers, sub: attention.oldestPendingTeacherDays > 0 ? `chờ lâu nhất ${attention.oldestPendingTeacherDays} ngày` : "", href: "/system/users?filter=pending", icon: UserCheck },
    { label: "Bài tự luận chờ quá 48 giờ", value: attention.staleGrading, sub: `${fmtNum(attention.pendingGrading)} bài đang chờ`, href: "/system/risks", icon: BookOpenCheck },
    { label: "Bài nộp đáng ngờ · 30 ngày", value: attention.suspicious30, sub: "rời tab, nộp quá nhanh", href: "/system/risks", icon: ShieldAlert },
    { label: "Yêu cầu vào lớp đang chờ", value: attention.pendingJoins, sub: "giáo viên duyệt", href: "/system/classes", icon: School },
    { label: "Đề 14 ngày chưa ai làm", value: attention.unusedExams, sub: "", href: "/system/risks", icon: FileText },
    { label: "Đề đang bị ẩn", value: attention.hiddenExams, sub: "", href: "/system/exams?filter=hidden", icon: ShieldAlert },
    { label: "Tài khoản bị khóa", value: attention.disabled, sub: "", href: "/system/users?filter=disabled", icon: UsersRound },
  ].filter((item) => item.value > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-extrabold text-gray-900">Tổng quan</h1>
        <button type="button" onClick={reload} aria-label="Tải lại số liệu" className="flex h-10 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600"><RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />Làm mới</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Người dùng" value={fmtNum(totals.users)} icon={UsersRound} footer={<Delta current={activity.usersLast7} previous={activity.usersPrev7} />} />
        <Kpi label="Học sinh hoạt động · 7 ngày" value={fmtNum(activity.active7)} icon={GraduationCap} footer={<span className="text-xs text-gray-400">{fmtNum(activity.active30)} trong 30 ngày · {fmtNum(totals.students)} tài khoản</span>} />
        <Kpi label="Giáo viên hoạt động · 30 ngày" value={fmtNum(activity.activeTeachers30)} icon={UserPlus} footer={<span className="text-xs text-gray-400">trên {fmtNum(totals.teachers)} giáo viên đã duyệt</span>} />
        <Kpi label="Bài nộp · 7 ngày" value={fmtNum(activity.submissionsLast7)} icon={FileText} footer={<Delta current={activity.submissionsLast7} previous={activity.submissionsPrev7} />} />
        <Kpi label="Điểm trung bình · 30 ngày" value={activity.avgScore30 === null ? "—" : activity.avgScore30.toLocaleString("vi-VN")} icon={Activity} footer={<span className="text-xs text-gray-400">bài đã chấm xong</span>} />
        <Kpi label="Lớp học đang mở" value={fmtNum(totals.activeClasses)} icon={School} footer={<span className="text-xs text-gray-400">{fmtNum(totals.classMembers)} học sinh · {fmtNum(totals.assignments)} bài tập · {fmtNum(totals.courses)} khóa</span>} />
        <Kpi label="Đề thi" value={fmtNum(totals.exams)} icon={FileText} footer={<span className="text-xs text-gray-400">{fmtNum(totals.submissions)} lượt làm tổng</span>} />
        <Kpi label="Bài tự luận chờ chấm" value={fmtNum(attention.pendingGrading)} icon={BookOpenCheck} tone={attention.staleGrading > 0 ? "warn" : "default"} footer={attention.staleGrading > 0 ? <span className="text-xs font-semibold text-amber-700">{fmtNum(attention.staleGrading)} bài quá 48 giờ</span> : <span className="text-xs text-gray-400">không có bài quá hạn</span>} />
      </div>

      <Panel title="Cần xử lý">
        {todo.length === 0 ? <p className="py-3 text-center text-sm text-gray-400">Không có việc nào cần xử lý.</p> : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {todo.map(({ label, value, sub, href, icon: Icon }) => (
              <li key={label}>
                <Link href={href} className="flex min-h-14 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/30 px-3 transition hover:bg-amber-50">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><Icon size={17} aria-hidden="true" /></span>
                  <span className="min-w-0"><span className="block font-display text-lg font-extrabold tabular-nums text-gray-900">{fmtNum(value)}</span><span className="block truncate text-xs text-gray-500">{label}</span>{sub && <span className="block truncate text-[11px] text-gray-400">{sub}</span>}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Panel title="Học sinh hoạt động mỗi ngày"><BarChart points={series.map((i) => ({ label: i.day, value: i.active }))} color="#4f46e5" /></Panel>
        <Panel title="Bài nộp mỗi ngày"><BarChart points={series.map((i) => ({ label: i.day, value: i.submissions }))} color="#059669" /></Panel>
        <Panel title="Người dùng mới"><BarChart points={series.map((i) => ({ label: i.day, value: i.users }))} color="#0ea5e9" /></Panel>
        <Panel title="Đề mới"><BarChart points={series.map((i) => ({ label: i.day, value: i.exams }))} color="#7c3aed" /></Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Hành trình giáo viên"><Funnel steps={data.teacherFunnel} color="bg-violet-500" /></Panel>
        <Panel title="Hành trình học sinh"><Funnel steps={data.studentFunnel} color="bg-indigo-500" /></Panel>
      </div>

      <Panel title="Giữ chân học sinh theo tuần đăng ký"><CohortTable cohorts={data.cohorts} /></Panel>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Giờ nộp bài trong ngày · 30 ngày"><BarChart rawLabels points={data.hours} color="#4f46e5" /></Panel>
        <Panel title="Thứ trong tuần · 30 ngày"><BarChart rawLabels points={data.weekdays} color="#059669" /></Panel>
        <Panel title="Theo khối lớp"><RankList items={data.byGrade.map((g) => ({ label: g.label, value: g.attempts, sub: `${fmtNum(g.exams)} đề` }))} /></Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Đề được làm nhiều nhất · 30 ngày"><RankList items={data.topExams.map((e) => ({ label: e.title, value: e.attempts, sub: e.avg === null ? "" : `TB ${e.avg.toLocaleString("vi-VN")}` }))} /></Panel>
        <Panel title="Giáo viên có nhiều lượt làm nhất · 30 ngày"><RankList items={data.topTeachers.map((t) => ({ label: t.name, value: t.attempts }))} /></Panel>
      </div>
    </div>
  );
}
