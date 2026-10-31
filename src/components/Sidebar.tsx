"use client";

import { gradeHref } from "@/lib/seo";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ChevronRight, CirclePlus, FileStack, Gauge,
  GraduationCap, History, Home, LibraryBig, School, Settings2, ShieldCheck, Sparkles,
  Target, UserRound, UsersRound, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useStudentMode } from "@/lib/StudentModeContext";
import { useEffect, useState } from "react";

export const GRADE_LEVELS = ["Lớp 10", "Lớp 11", "Lớp 12", "Thi Thử TN THPT"] as const;
export const EXAM_TYPES = [
  "Đề kiểm tra thường xuyên",
  "Kiểm tra giữa HK1",
  "Kiểm tra cuối HK1",
  "Kiểm tra giữa HK2",
  "Kiểm tra cuối HK2",
] as const;
export type GradeLevel = (typeof GRADE_LEVELS)[number];
export type ExamType = (typeof EXAM_TYPES)[number];

export type NavTone = "indigo" | "violet" | "sky" | "emerald" | "amber" | "rose" | "fuchsia" | "slate";

// Mỗi mục một tông màu: ô biểu tượng nhạt khi thường, chuyển gradient khi đang mở.
export const NAV_TONES: Record<NavTone, { soft: string; active: string }> = {
  indigo: { soft: "bg-indigo-50 text-indigo-600", active: "from-indigo-500 to-violet-500 shadow-indigo-500/35" },
  violet: { soft: "bg-violet-50 text-violet-600", active: "from-violet-500 to-fuchsia-500 shadow-violet-500/35" },
  sky: { soft: "bg-sky-50 text-sky-600", active: "from-sky-400 to-indigo-500 shadow-sky-500/35" },
  emerald: { soft: "bg-emerald-50 text-emerald-600", active: "from-emerald-400 to-teal-500 shadow-emerald-500/35" },
  amber: { soft: "bg-amber-50 text-amber-600", active: "from-amber-400 to-orange-500 shadow-amber-500/35" },
  rose: { soft: "bg-rose-50 text-rose-600", active: "from-rose-400 to-pink-500 shadow-rose-500/35" },
  fuchsia: { soft: "bg-fuchsia-50 text-fuchsia-600", active: "from-fuchsia-500 to-violet-500 shadow-fuchsia-500/35" },
  slate: { soft: "bg-slate-100 text-slate-600", active: "from-slate-500 to-slate-700 shadow-slate-500/35" },
};

export const GRADE_TONES: Record<string, NavTone> = { "Lớp 10": "sky", "Lớp 11": "emerald", "Lớp 12": "violet", "Thi Thử TN THPT": "amber" };

/** Ô biểu tượng của mục menu; khối lớp hiện số lớp thay cho icon. */
export function NavGlyph({ icon: Icon, text, tone, active }: { icon?: LucideIcon; text?: string; tone: NavTone; active?: boolean }) {
  const palette = NAV_TONES[tone];
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] transition-all duration-200 ${active ? `bg-gradient-to-br text-white shadow-md ${palette.active}` : `${palette.soft} group-hover:scale-105 group-hover:shadow-sm`}`}>
      {Icon ? <Icon className="h-[17px] w-[17px]" aria-hidden="true" /> : <span className="font-display text-[12px] font-extrabold tabular-nums">{text}</span>}
    </span>
  );
}

function SideLink({ href, icon, tone = "indigo", children, active, badge, collapsed = false }: {
  href: string;
  icon: LucideIcon;
  tone?: NavTone;
  children: React.ReactNode;
  active?: boolean;
  badge?: string;
  collapsed?: boolean;
}) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} title={collapsed ? String(children) : undefined} className={`group relative mb-0.5 flex min-h-10 items-center rounded-xl py-1 text-[13.5px] font-semibold transition-all duration-200 ${collapsed ? "justify-center px-1" : "gap-3 px-2"} ${active ? "bg-white text-gray-900 shadow-[var(--shadow-soft)] ring-1 ring-indigo-100" : "text-gray-600 hover:bg-white/80 hover:text-gray-900"}`}>
      {active && <span aria-hidden="true" className={`absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-gradient-to-b from-indigo-500 to-fuchsia-500 ${collapsed ? "-left-2" : "-left-3"}`} />}
      <NavGlyph icon={icon} tone={tone} active={active} />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{children}</span>}
      {!collapsed && badge && <span className="rounded-md bg-gradient-to-r from-indigo-500 to-violet-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm shadow-indigo-500/30">{badge}</span>}
    </Link>
  );
}

function SectionLabel({ children, collapsed = false }: { children: React.ReactNode; collapsed?: boolean }) {
  if (collapsed) return <div aria-hidden="true" className="mx-auto my-3 h-px w-6 bg-gradient-to-r from-transparent via-gray-300 to-transparent" />;
  return (
    <p className="flex items-center gap-2 px-2 pb-1.5 pt-5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400">
      {children}
      <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent" />
    </p>
  );
}

function ProfileCard({ name, teacher, collapsed = false }: { name: string; teacher: boolean; collapsed?: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase() || (teacher ? "G" : "H");
  const avatar = <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-display text-base font-extrabold text-white shadow-md ${teacher ? "from-violet-500 to-fuchsia-500 shadow-violet-500/30" : "from-indigo-500 to-sky-500 shadow-indigo-500/30"}`}>
    {initial}
    <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white" />
  </span>;
  if (collapsed) return <Link href="/tai-khoan" title={name} aria-label={`Tài khoản: ${name}`} className="mx-auto mb-1 flex w-fit">{avatar}</Link>;
  return (
    <Link href="/tai-khoan" className="group relative mb-1 flex items-center gap-3 overflow-hidden rounded-2xl border border-white bg-white/90 p-2.5 shadow-[var(--shadow-soft)] ring-1 ring-gray-200/70 transition hover:ring-indigo-200">
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${teacher ? "from-violet-500 via-fuchsia-500 to-amber-400" : "from-indigo-500 via-sky-400 to-emerald-400"}`} />
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-gray-900">{name}</span>
        <span className={`mt-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[10.5px] font-bold ${teacher ? "bg-violet-50 text-violet-700" : "bg-indigo-50 text-indigo-700"}`}>
          {teacher ? <ShieldCheck size={11} aria-hidden="true" /> : <GraduationCap size={11} aria-hidden="true" />}
          {teacher ? "Giáo viên" : "Học sinh"}
        </span>
      </span>
      <Settings2 size={16} aria-hidden="true" className="shrink-0 text-gray-300 transition group-hover:rotate-45 group-hover:text-indigo-500" />
    </Link>
  );
}

export default function Sidebar() {
  const { user, userProfile, isMod, isAdmin, loading } = useAuth();
  const { isStudentMode } = useStudentMode();
  const pathname = usePathname();
  const [expandedGrade, setExpandedGrade] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setCollapsed(window.localStorage.getItem("site-sidebar-collapsed") === "1"));
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("site-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };

  if (pathname.startsWith("/quiz/") || loading || !user || !userProfile) return null;
  const teacherView = isMod && !isStudentMode;

  return (
    <aside className={`site-sidebar sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col transition-[width] duration-300 md:flex ${collapsed ? "w-[4.75rem]" : "w-[16.5rem]"}`}>
      <nav aria-label="Menu chính" className={`no-scrollbar min-h-0 flex-1 overflow-y-auto ${collapsed ? "px-2.5 pb-3 pt-4" : "px-3.5 pb-4 pt-4"}`}>
        <ProfileCard name={userProfile.fullName || user.email || "Người dùng"} teacher={teacherView} collapsed={collapsed} />

        {teacherView ? (
          <>
            <SectionLabel collapsed={collapsed}>Tổng quan</SectionLabel>
            <SideLink collapsed={collapsed} href="/admin/dashboard" icon={Gauge} tone="indigo" active={pathname === "/admin/dashboard"}>Bảng điều khiển</SideLink>

            <SectionLabel collapsed={collapsed}>Giảng dạy</SectionLabel>
            <SideLink collapsed={collapsed} href="/teacher/classes" icon={School} tone="sky" active={pathname.startsWith("/teacher/classes")}>Quản lý lớp học</SideLink>
            <SideLink collapsed={collapsed} href="/admin/create-exam" icon={CirclePlus} tone="emerald" active={pathname === "/admin/create-exam"} badge="Mới">Tạo bài thi mới</SideLink>

            <SectionLabel collapsed={collapsed}>Ngân hàng đề</SectionLabel>
            <SideLink collapsed={collapsed} href="/admin/exam-list?tab=mine" icon={FileStack} tone="violet" active={pathname === "/admin/exam-list"}>Đề của tôi</SideLink>
            <SideLink collapsed={collapsed} href="/admin/exam-list?tab=shared" icon={LibraryBig} tone="fuchsia">Đề được chia sẻ</SideLink>

            {isAdmin && (
              <>
                <SectionLabel collapsed={collapsed}>Quản trị hệ thống</SectionLabel>
                <SideLink collapsed={collapsed} href="/admin/users" icon={UsersRound} tone="rose" active={pathname.startsWith("/admin/users")}>Người dùng</SideLink>
                <SideLink collapsed={collapsed} href="/admin/exam-list" icon={ShieldCheck} tone="slate">Toàn bộ đề thi</SideLink>
              </>
            )}

            <SectionLabel collapsed={collapsed}>Cá nhân</SectionLabel>
            <SideLink collapsed={collapsed} href="/tai-khoan" icon={UserRound} tone="amber" active={pathname === "/tai-khoan"}>Tài khoản & cài đặt</SideLink>
            <SideLink collapsed={collapsed} href="/student/history" icon={History} tone="slate" active={pathname === "/student/history"}>Lịch sử làm bài</SideLink>

            {!collapsed && <TipCard href="/admin/create-exam" title="Trộn nhiều mã đề" text="Bật “Trộn mã đề” khi tạo đề để mỗi học sinh nhận một mã khác nhau." cta="Tạo đề ngay" />}
          </>
        ) : (
          <>
            <SectionLabel collapsed={collapsed}>Học tập</SectionLabel>
            <SideLink collapsed={collapsed} href="/" icon={Home} tone="indigo" active={pathname === "/"}>Trang chủ & kho đề</SideLink>
            <SideLink collapsed={collapsed} href="/student/classes" icon={GraduationCap} tone="sky" active={pathname.startsWith("/student/classes")}>Lớp học của tôi</SideLink>
            <SideLink collapsed={collapsed} href="/student/history" icon={History} tone="violet" active={pathname === "/student/history"}>Lịch sử làm bài</SideLink>
            <SideLink collapsed={collapsed} href="/tai-khoan" icon={UserRound} tone="amber" active={pathname === "/tai-khoan"}>Tài khoản & cài đặt</SideLink>

            <SectionLabel collapsed={collapsed}>Ôn luyện theo khối</SectionLabel>
            {GRADE_LEVELS.map((grade) => {
              const tone = GRADE_TONES[grade];
              if (grade === "Thi Thử TN THPT") {
                return <SideLink collapsed={collapsed} key={grade} href={gradeHref(grade)} icon={Target} tone={tone}>{grade}</SideLink>;
              }
              const expanded = expandedGrade === grade;
              return (
                <div key={grade} className="mb-0.5">
                  <button type="button" title={collapsed ? grade : undefined} onClick={() => { if (collapsed) setCollapsed(false); setExpandedGrade(expanded ? null : grade); }} aria-expanded={expanded} className={`group flex min-h-10 w-full items-center rounded-xl py-1 text-[13.5px] font-semibold transition ${collapsed ? "justify-center px-1" : "gap-3 px-2"} ${expanded ? "bg-white/80 text-gray-900" : "text-gray-600 hover:bg-white/80 hover:text-gray-900"}`}>
                    <NavGlyph text={grade.replace("Lớp ", "")} tone={tone} active={expanded} />
                    {!collapsed && <span className="flex-1 text-left">{grade}</span>}
                    {!collapsed && <ChevronRight aria-hidden="true" className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />}
                  </button>
                  {expanded && !collapsed && (
                    <div className="mb-1 ml-[1.625rem] mt-0.5 space-y-px border-l-2 border-indigo-100 py-0.5 pl-2.5">
                      <Link href={gradeHref(grade)} className="block rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-50">Tất cả đề</Link>
                      {EXAM_TYPES.map((type) => <Link key={type} href={`${gradeHref(grade)}?type=${encodeURIComponent(type)}`} className="block rounded-lg px-2.5 py-1.5 text-xs leading-4 text-gray-500 hover:bg-brand-50 hover:text-brand-700">{type}</Link>)}
                    </div>
                  )}
                </div>
              );
            })}

            {!collapsed && <TipCard href="/student/history" title="Học đều mỗi ngày" text="Xem lịch sử để nhận ra phần kiến thức cần ôn lại." cta="Xem lịch sử" />}
          </>
        )}
      </nav>
      <div className={`border-t border-gray-200/70 bg-white/60 backdrop-blur ${collapsed ? "p-2.5" : "px-3.5 py-2.5"}`}>
        <button type="button" onClick={toggleCollapsed} title={collapsed ? "Mở rộng menu" : "Thu gọn menu"} aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"} aria-expanded={!collapsed} className={`group flex min-h-10 w-full items-center rounded-xl text-xs font-semibold text-gray-500 transition hover:bg-white hover:text-brand-700 hover:shadow-sm ${collapsed ? "justify-center" : "gap-3 px-2"}`}>
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gray-100 text-gray-500 transition group-hover:bg-indigo-50 group-hover:text-indigo-600">
            {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
          </span>
          {!collapsed && <span>Thu gọn menu</span>}
        </button>
      </div>
    </aside>
  );
}

function TipCard({ href, title, text, cta }: { href: string; title: string; text: string; cta: string }) {
  return (
    <div className="relative mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 p-4 text-white shadow-[var(--shadow-lift)]">
      <div aria-hidden="true" className="edu-dots absolute inset-0 opacity-40 mix-blend-overlay" />
      <div aria-hidden="true" className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/20 blur-2xl" />
      <span aria-hidden="true" className="absolute -bottom-5 right-2 font-display text-6xl font-extrabold text-white/10">π</span>
      <div className="relative">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 ring-1 ring-white/30"><Sparkles className="h-4 w-4" aria-hidden="true" /></span>
        <p className="mt-2.5 text-sm font-bold">{title}</p>
        <p className="mt-1 text-xs leading-5 text-white/80">{text}</p>
        <Link href={href} className="mt-3 inline-flex min-h-8 items-center gap-1 rounded-lg bg-white px-3 text-xs font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-50">{cta}<ChevronRight size={13} aria-hidden="true" /></Link>
      </div>
    </div>
  );
}
