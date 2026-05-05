"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { useState } from "react";

// ── Shared constants (used in create/edit forms and home page filtering) ──────

export const GRADE_LEVELS = [
  "Lớp 10",
  "Lớp 11",
  "Lớp 12",
  "Thi Thử TN THPT",
] as const;

export const EXAM_TYPES = [
  "Đề kiểm tra thường xuyên",
  "Kiểm tra giữa HK1",
  "Kiểm tra cuối HK1",
  "Kiểm tra giữa HK2",
  "Kiểm tra cuối HK2",
] as const;

export type GradeLevel = (typeof GRADE_LEVELS)[number];
export type ExamType = (typeof EXAM_TYPES)[number];

// ── Sub-components ─────────────────────────────────────────────────────────────

function SideLink({
  href,
  icon,
  children,
  active,
}: {
  href: string;
  icon?: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
        active
          ? "bg-blue-50 text-blue-700"
          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      }`}
    >
      {icon && <span className="text-base shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest px-3 pt-5 pb-1.5">
      {children}
    </p>
  );
}

// ── Main Sidebar ───────────────────────────────────────────────────────────────

export default function Sidebar() {
  const { user, userProfile, isMod, isAdmin, loading } = useAuth();
  const pathname = usePathname();
  const [expandedGrade, setExpandedGrade] = useState<string | null>(null);

  // No sidebar on quiz pages — keep focus on the exam
  if (pathname.startsWith("/quiz/")) return null;

  // No sidebar while auth is resolving or not logged in
  if (loading || !user || !userProfile) return null;

  // ── Admin / Mod sidebar ──────────────────────────────────────────────────────
  if (isMod) {
    return (
      <aside className="hidden md:block w-56 shrink-0 bg-white border-r border-gray-100 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
        <nav className="p-3">
          <SectionLabel>Quản lý</SectionLabel>
          <SideLink
            href="/admin/dashboard"
            icon="📊"
            active={pathname === "/admin/dashboard"}
          >
            Dashboard
          </SideLink>
          <SideLink
            href="/admin/create-exam"
            icon="➕"
            active={pathname === "/admin/create-exam"}
          >
            Tạo đề mới
          </SideLink>

          <SectionLabel>Kho đề thi</SectionLabel>
          <SideLink href="/admin/exam-list?tab=mine" icon="📁">
            Đề của tôi
          </SideLink>
          <SideLink href="/admin/exam-list?tab=shared" icon="🌐">
            Đề được chia sẻ
          </SideLink>

          {isAdmin && (
            <>
              <SectionLabel>Admin</SectionLabel>
              <SideLink
                href="/admin/exam-list"
                icon="📋"
                active={pathname === "/admin/exam-list"}
              >
                Tất cả đề thi
              </SideLink>
              <SideLink
                href="/admin/users"
                icon="👥"
                active={pathname === "/admin/users"}
              >
                Người dùng
              </SideLink>
            </>
          )}

          <SectionLabel>Lớp học</SectionLabel>
          <SideLink
            href="/teacher/classes"
            icon="🏫"
            active={pathname.startsWith("/teacher/classes")}
          >
            Quản lý lớp học
          </SideLink>

          <SectionLabel>Cá nhân</SectionLabel>
          <SideLink
            href="/teacher/profile"
            icon="👤"
            active={pathname === "/teacher/profile"}
          >
            Hồ sơ giáo viên
          </SideLink>
          <SideLink
            href="/student/history"
            icon="📜"
            active={pathname === "/student/history"}
          >
            Lịch sử làm bài
          </SideLink>
        </nav>
      </aside>
    );
  }

  // ── Student sidebar: exam category tree ──────────────────────────────────────
  return (
    <aside className="hidden md:block w-56 shrink-0 bg-white border-r border-gray-100 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
      <nav className="p-3">
        <SideLink href="/" icon="🏠" active={pathname === "/"}>
          Tất cả đề thi
        </SideLink>

        <SectionLabel>Danh mục đề</SectionLabel>

        {GRADE_LEVELS.map((grade) => {
          const isExpanded = expandedGrade === grade;
          const isThiThu = grade === "Thi Thử TN THPT";

          if (isThiThu) {
            return (
              <SideLink
                key={grade}
                href={`/?grade=${encodeURIComponent(grade)}`}
                icon="🎯"
              >
                {grade}
              </SideLink>
            );
          }

          return (
            <div key={grade}>
              <button
                onClick={() =>
                  setExpandedGrade(isExpanded ? null : grade)
                }
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all"
              >
                <span className="flex items-center gap-2.5">
                  <span className="text-base">📚</span>
                  {grade}
                </span>
                <span
                  className={`text-gray-400 text-xs transition-transform duration-200 ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                >
                  ›
                </span>
              </button>

              {isExpanded && (
                <div className="ml-5 mt-0.5 mb-1 space-y-0.5 border-l-2 border-gray-100 pl-2">
                  <Link
                    href={`/?grade=${encodeURIComponent(grade)}`}
                    className="block px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-blue-50 hover:text-blue-700 transition-all"
                  >
                    — Tất cả
                  </Link>
                  {EXAM_TYPES.map((type) => (
                    <Link
                      key={type}
                      href={`/?grade=${encodeURIComponent(grade)}&type=${encodeURIComponent(type)}`}
                      className="block px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-blue-50 hover:text-blue-700 transition-all"
                    >
                      {type}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="pt-2 space-y-0.5">
          <SideLink
            href="/student/classes"
            icon="🏫"
            active={pathname.startsWith("/student/classes")}
          >
            Lớp học của tôi
          </SideLink>
          <SideLink
            href="/student/history"
            icon="📜"
            active={pathname === "/student/history"}
          >
            Lịch sử làm bài
          </SideLink>
        </div>
      </nav>
    </aside>
  );
}
