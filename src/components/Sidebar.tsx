"use client";

import { gradeHref } from "@/lib/seo";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen, ChevronRight, CirclePlus, FileStack, Gauge,
  GraduationCap, History, Home, LibraryBig, School, ShieldCheck, Sparkles,
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

function SideLink({ href, icon: Icon, children, active, badge, collapsed = false }: {
  href: string;
  icon: LucideIcon;
  children: React.ReactNode;
  active?: boolean;
  badge?: string;
  collapsed?: boolean;
}) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} title={collapsed ? String(children) : undefined} className={`group relative mb-0.5 flex items-center rounded-xl py-2 text-sm font-semibold transition-all duration-200 ${collapsed ? "justify-center px-1" : "gap-3 px-2.5"} ${active ? "bg-gradient-to-r from-brand-50 to-violet-50 text-brand-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
      {active && <span aria-hidden="true" className="absolute -left-3.5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-indigo-500 to-violet-500" />}
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${active ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/30" : "bg-gray-100 text-gray-500 group-hover:bg-white group-hover:text-brand-600 group-hover:shadow-sm"}`}><Icon className="h-[17px] w-[17px]" /></span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{children}</span>}
      {!collapsed && badge && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? "bg-white text-brand-700 shadow-sm" : "bg-brand-50 text-brand-700"}`}>{badge}</span>}
    </Link>
  );
}

function SectionLabel({ children, collapsed = false }: { children: React.ReactNode; collapsed?: boolean }) {
  if (collapsed) return <div className="mx-auto my-4 h-px w-8 bg-gray-200" />;
  return <p className="px-2.5 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{children}</p>;
}

function ProfileCard({ name, teacher, collapsed = false }: { name: string; teacher: boolean; collapsed?: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase() || (teacher ? "G" : "H");
  return (
    <div title={collapsed ? name : undefined} className={`relative mb-2 overflow-hidden rounded-2xl text-white shadow-lg ${collapsed ? "p-2" : "p-4"} ${teacher ? "bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-500 shadow-violet-500/25" : "bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 shadow-indigo-500/25"}`}>
      <div aria-hidden="true" className="edu-dots absolute inset-0 opacity-40 mix-blend-overlay" />
      <div aria-hidden="true" className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/15 blur-xl" />
      <div className="relative flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 font-display text-lg font-extrabold ring-1 ring-white/30 backdrop-blur">{initial}</div>
        {!collapsed && <div className="min-w-0">
          <p className="truncate text-sm font-bold">{name}</p>
          <p className="mt-0.5 text-xs text-white/75">{teacher ? "Không gian giáo viên" : "Không gian học sinh"}</p>
        </div>}
      </div>
    </div>
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
    <aside className={`site-sidebar sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 overflow-y-auto transition-[width] duration-300 md:block ${collapsed ? "w-[5rem]" : "w-[17rem]"}`}>
      <nav className={collapsed ? "p-2" : "p-3.5"}>
        <div className={`sticky top-0 z-20 -mx-1 mb-3 flex bg-white/80 py-1 backdrop-blur ${collapsed ? "justify-center" : "justify-end"}`}>
          <button type="button" onClick={toggleCollapsed} title={collapsed ? "Mở rộng menu" : "Thu gọn menu"} aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"} className={`flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white font-semibold text-gray-500 shadow-sm transition hover:border-brand-200 hover:text-brand-700 ${collapsed ? "w-10" : "px-3 text-xs"}`}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && <span>Thu gọn menu</span>}
          </button>
        </div>
        <ProfileCard name={userProfile.fullName || user.email || "Người dùng"} teacher={teacherView} collapsed={collapsed} />

        {teacherView ? (
          <>
            <SectionLabel collapsed={collapsed}>Tổng quan</SectionLabel>
            <SideLink collapsed={collapsed} href="/admin/dashboard" icon={Gauge} active={pathname === "/admin/dashboard"}>Bảng điều khiển</SideLink>

            <SectionLabel collapsed={collapsed}>Giảng dạy</SectionLabel>
            <SideLink collapsed={collapsed} href="/teacher/classes" icon={School} active={pathname.startsWith("/teacher/classes")}>Quản lý lớp học</SideLink>
            <SideLink collapsed={collapsed} href="/admin/create-exam" icon={CirclePlus} active={pathname === "/admin/create-exam"} badge="Tạo">Tạo bài thi mới</SideLink>

            <SectionLabel collapsed={collapsed}>Ngân hàng đề</SectionLabel>
            <SideLink collapsed={collapsed} href="/admin/exam-list?tab=mine" icon={FileStack} active={pathname === "/admin/exam-list"}>Đề của tôi</SideLink>
            <SideLink collapsed={collapsed} href="/admin/exam-list?tab=shared" icon={LibraryBig}>Đề được chia sẻ</SideLink>

            {isAdmin && (
              <>
                <SectionLabel collapsed={collapsed}>Quản trị hệ thống</SectionLabel>
                <SideLink collapsed={collapsed} href="/admin/users" icon={UsersRound} active={pathname.startsWith("/admin/users")}>Người dùng</SideLink>
                <SideLink collapsed={collapsed} href="/admin/exam-list" icon={ShieldCheck}>Toàn bộ đề thi</SideLink>
              </>
            )}

            <SectionLabel collapsed={collapsed}>Cá nhân</SectionLabel>
            <SideLink collapsed={collapsed} href="/tai-khoan" icon={UserRound} active={pathname === "/tai-khoan"}>Tài khoản & cài đặt</SideLink>
            <SideLink collapsed={collapsed} href="/student/history" icon={History} active={pathname === "/student/history"}>Lịch sử làm bài</SideLink>
          </>
        ) : (
          <>
            <SectionLabel collapsed={collapsed}>Học tập</SectionLabel>
            <SideLink collapsed={collapsed} href="/" icon={Home} active={pathname === "/"}>Trang chủ & kho đề</SideLink>
            <SideLink collapsed={collapsed} href="/student/classes" icon={GraduationCap} active={pathname.startsWith("/student/classes")} badge="Lớp">Lớp học của tôi</SideLink>
            <SideLink collapsed={collapsed} href="/student/history" icon={History} active={pathname === "/student/history"}>Lịch sử làm bài</SideLink>
            <SideLink collapsed={collapsed} href="/tai-khoan" icon={UserRound} active={pathname === "/tai-khoan"}>Tài khoản & cài đặt</SideLink>

            <SectionLabel collapsed={collapsed}>Ôn luyện theo khối</SectionLabel>
            {GRADE_LEVELS.map((grade) => {
              if (grade === "Thi Thử TN THPT") {
                return <SideLink collapsed={collapsed} key={grade} href={gradeHref(grade)} icon={Target}>{grade}</SideLink>;
              }
              const expanded = expandedGrade === grade;
              return (
                <div key={grade} className="mb-1">
                  <button title={collapsed ? grade : undefined} onClick={() => { if (collapsed) setCollapsed(false); setExpandedGrade(expanded ? null : grade); }} aria-expanded={expanded} className={`group mb-0.5 flex w-full items-center rounded-xl py-2 text-sm font-semibold transition ${collapsed ? "justify-center px-1" : "gap-3 px-2.5"} ${expanded ? "bg-gray-50 text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500 transition group-hover:bg-white group-hover:text-brand-600 group-hover:shadow-sm"><BookOpen className="h-[17px] w-[17px]" /></span>
                    {!collapsed && <span className="flex-1 text-left">{grade}</span>}
                    {!collapsed && <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />}
                  </button>
                  {expanded && !collapsed && (
                    <div className="mb-1 ml-6 mt-1 space-y-0.5 border-l-2 border-brand-100 pl-3">
                      <Link href={gradeHref(grade)} className="block rounded-lg px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">Tất cả đề</Link>
                      {EXAM_TYPES.map((type) => <Link key={type} href={`${gradeHref(grade)}?type=${encodeURIComponent(type)}`} className="block rounded-lg px-3 py-2 text-xs leading-4 text-gray-500 hover:bg-brand-50 hover:text-brand-700">{type}</Link>)}
                    </div>
                  )}
                </div>
              );
            })}

            {!collapsed && <div className="mt-5 relative overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-violet-50 to-white p-4">
              <Sparkles className="h-5 w-5 text-brand-600" />
              <p className="mt-2 text-sm font-bold text-gray-900">Học đều mỗi ngày</p>
              <p className="mt-1 text-xs leading-5 text-gray-600">Xem lịch sử để nhận biết phần kiến thức cần ôn lại.</p>
            </div>}
          </>
        )}
      </nav>
    </aside>
  );
}
