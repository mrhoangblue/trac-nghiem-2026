"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen, ChevronRight, CirclePlus, FileStack, Gauge,
  GraduationCap, History, Home, LibraryBig, School, ShieldCheck, Sparkles,
  Target, UserRound, UsersRound,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useStudentMode } from "@/lib/StudentModeContext";
import { useState } from "react";

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

function SideLink({ href, icon: Icon, children, active, badge }: {
  href: string;
  icon: LucideIcon;
  children: React.ReactNode;
  active?: boolean;
  badge?: string;
}) {
  return (
    <Link href={href} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-all ${active ? "bg-brand-600 text-white shadow-md shadow-brand-900/10" : "text-[#645a52] hover:bg-[#f5eee7] hover:text-[#6f351b]"}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${active ? "bg-white/15" : "bg-[#f4ece4] text-brand-700 group-hover:bg-white"}`}><Icon className="h-[17px] w-[17px]" /></span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge && <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${active ? "bg-white/20 text-white" : "bg-brand-100 text-brand-800"}`}>{badge}</span>}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-3 pb-2 pt-5 text-[10px] font-black uppercase tracking-[0.2em] text-[#a4978d]">{children}</p>;
}

function ProfileCard({ name, teacher }: { name: string; teacher: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase() || (teacher ? "G" : "H");
  return (
    <div className={`relative mb-3 overflow-hidden rounded-2xl p-4 text-white ${teacher ? "bg-gradient-to-br from-[#3a281f] to-[#81502f]" : "bg-gradient-to-br from-[#244f58] to-[#3d7d86]"}`}>
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full border-[16px] border-white/10" />
      <div className="relative flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-lg font-black ring-1 ring-white/20">{initial}</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold">{name}</p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-white/60">{teacher ? "Không gian giáo viên" : "Không gian học sinh"}</p>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { user, userProfile, isMod, isAdmin, loading } = useAuth();
  const { isStudentMode } = useStudentMode();
  const pathname = usePathname();
  const [expandedGrade, setExpandedGrade] = useState<string | null>(null);

  if (pathname.startsWith("/quiz/") || loading || !user || !userProfile) return null;
  const teacherView = isMod && !isStudentMode;

  return (
    <aside className="site-sidebar sticky top-16 hidden h-[calc(100vh-4rem)] w-[17rem] shrink-0 overflow-y-auto border-r border-[#eee6de] bg-[#fffdfb] md:block">
      <nav className="p-3.5">
        <ProfileCard name={userProfile.fullName || user.email || "Người dùng"} teacher={teacherView} />

        {teacherView ? (
          <>
            <SectionLabel>Tổng quan</SectionLabel>
            <SideLink href="/admin/dashboard" icon={Gauge} active={pathname === "/admin/dashboard"}>Bảng điều khiển</SideLink>

            <SectionLabel>Giảng dạy</SectionLabel>
            <SideLink href="/teacher/classes" icon={School} active={pathname.startsWith("/teacher/classes")}>Quản lý lớp học</SideLink>
            <SideLink href="/admin/create-exam" icon={CirclePlus} active={pathname === "/admin/create-exam"} badge="Tạo">Tạo bài thi mới</SideLink>

            <SectionLabel>Ngân hàng đề</SectionLabel>
            <SideLink href="/admin/exam-list?tab=mine" icon={FileStack} active={pathname === "/admin/exam-list"}>Đề của tôi</SideLink>
            <SideLink href="/admin/exam-list?tab=shared" icon={LibraryBig}>Đề được chia sẻ</SideLink>

            {isAdmin && (
              <>
                <SectionLabel>Quản trị hệ thống</SectionLabel>
                <SideLink href="/admin/users" icon={UsersRound} active={pathname === "/admin/users"}>Người dùng</SideLink>
                <SideLink href="/admin/exam-list" icon={ShieldCheck}>Toàn bộ đề thi</SideLink>
              </>
            )}

            <SectionLabel>Cá nhân</SectionLabel>
            <SideLink href="/teacher/profile" icon={UserRound} active={pathname === "/teacher/profile"}>Hồ sơ giáo viên</SideLink>
            <SideLink href="/student/history" icon={History} active={pathname === "/student/history"}>Lịch sử làm bài</SideLink>
          </>
        ) : (
          <>
            <SectionLabel>Học tập</SectionLabel>
            <SideLink href="/" icon={Home} active={pathname === "/"}>Trang chủ & kho đề</SideLink>
            <SideLink href="/student/classes" icon={GraduationCap} active={pathname.startsWith("/student/classes")} badge="Lớp">Lớp học của tôi</SideLink>
            <SideLink href="/student/history" icon={History} active={pathname === "/student/history"}>Lịch sử làm bài</SideLink>

            <SectionLabel>Ôn luyện theo khối</SectionLabel>
            {GRADE_LEVELS.map((grade) => {
              if (grade === "Thi Thử TN THPT") {
                return <SideLink key={grade} href={`/?grade=${encodeURIComponent(grade)}`} icon={Target}>{grade}</SideLink>;
              }
              const expanded = expandedGrade === grade;
              return (
                <div key={grade} className="mb-1">
                  <button onClick={() => setExpandedGrade(expanded ? null : grade)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${expanded ? "bg-[#f5eee7] text-brand-800" : "text-[#645a52] hover:bg-[#f8f3ee]"}`}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f4ece4] text-brand-700"><BookOpen className="h-[17px] w-[17px]" /></span>
                    <span className="flex-1 text-left">{grade}</span>
                    <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
                  </button>
                  {expanded && (
                    <div className="ml-7 mt-1 space-y-0.5 border-l border-[#e9ddd2] pl-3">
                      <Link href={`/?grade=${encodeURIComponent(grade)}`} className="block rounded-lg px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-50">Tất cả đề</Link>
                      {EXAM_TYPES.map((type) => <Link key={type} href={`/?grade=${encodeURIComponent(grade)}&type=${encodeURIComponent(type)}`} className="block rounded-lg px-3 py-2 text-xs leading-4 text-gray-500 hover:bg-brand-50 hover:text-brand-700">{type}</Link>)}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="mt-5 rounded-2xl border border-[#eadfd5] bg-gradient-to-br from-[#fff8f1] to-white p-4">
              <Sparkles className="h-5 w-5 text-brand-600" />
              <p className="mt-2 text-xs font-extrabold text-gray-800">Học đều mỗi ngày</p>
              <p className="mt-1 text-[11px] leading-4 text-gray-500">Xem lịch sử để nhận biết phần kiến thức cần ôn lại.</p>
            </div>
          </>
        )}
      </nav>
    </aside>
  );
}
