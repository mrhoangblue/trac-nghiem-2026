"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { BookOpen, ChevronRight, CirclePlus, FileStack, Gauge, GraduationCap, History, Home, LibraryBig, LogOut, School, ShieldCheck, Target, UserRound, UsersRound, X } from "lucide-react";
import Image from "next/image";
import { gradeHref } from "@/lib/seo";
import { useAuth } from "@/lib/AuthContext";
import { useStudentMode, useSwitchStudentMode } from "@/lib/StudentModeContext";
import { GRADE_LEVELS, EXAM_TYPES } from "@/components/Sidebar";

// ── Sub-components ─────────────────────────────────────────────────────────────

function DrawerLink({
  href,
  icon: Icon,
  children,
  active,
  onClose,
}: {
  href: string;
  icon: LucideIcon;
  children: React.ReactNode;
  active?: boolean;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      aria-current={active ? "page" : undefined}
      className={`mb-0.5 flex min-h-11 items-center gap-3 rounded-xl px-2.5 text-sm font-semibold transition-all ${
        active
          ? "bg-gradient-to-r from-brand-50 to-violet-50 text-brand-700"
          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      }`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/30" : "bg-gray-100 text-gray-500"}`}><Icon size={17} aria-hidden="true" /></span>
      <span className="truncate">{children}</span>
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
      {children}
    </p>
  );
}

// ── Main MobileDrawer ──────────────────────────────────────────────────────────

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const { user, userProfile, isMod, isAdmin, logout } = useAuth();
  const { isStudentMode } = useStudentMode();
  const switchStudentMode = useSwitchStudentMode();
  const pathname = usePathname();
  const [expandedGrade, setExpandedGrade] = useState<string | null>(null);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on route change
  useEffect(() => {
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const roleBadge =
    userProfile?.role === "pending_teacher"
      ? { label: "Chờ duyệt", cls: "bg-amber-100 text-amber-700" }
      : userProfile?.role === "mod"
      ? { label: "Giáo viên", cls: "bg-violet-50 text-violet-700" }
      : userProfile?.role === "admin"
      ? { label: "Admin", cls: "bg-brand-100 text-brand-700" }
      : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-indigo-950/40 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        inert={!open}
        aria-hidden={!open}
        className={`fixed top-0 left-0 z-50 h-full w-80 max-w-[85vw] bg-white flex rounded-r-3xl flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full shadow-none"
        }`}
      >
        {/* Header: branding + close button */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0">
          <Link href="/" onClick={onClose} className="flex items-center gap-2.5">
            <span className="relative h-10 w-10 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-sky-400 p-[2px] shadow-md shadow-indigo-500/25">
              <span className="relative block h-full w-full overflow-hidden rounded-[14px] bg-white">
                <Image src="/thay-hoang-blue-avatar.png" alt="" fill sizes="40px" className="translate-y-1.5 scale-[1.45] object-contain" />
              </span>
            </span>
            <div className="leading-none">
              <p className="font-display text-base font-extrabold tracking-tight text-gray-900">
                Học Toán <span className="edu-gradient-text">THPT</span>
              </p>
              <p className="mt-1 text-[11px] font-medium text-gray-500">
                cùng Thầy Hoàng Blue
              </p>
            </div>
          </Link>
          <button
            onClick={onClose}
            aria-label="Đóng menu"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* User info strip */}
        {user && (
          <div className="relative mx-3 mt-3 flex shrink-0 items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 px-4 py-3 text-white shadow-lg shadow-indigo-500/25">
            {(userProfile?.avatarUrl || user.photoURL) && (
              <img
                src={userProfile?.avatarUrl || user.photoURL || ""}
                alt={user.displayName ?? "Avatar"}
                width={36}
                height={36}
                className="w-10 h-10 rounded-full object-cover ring-2 ring-white/40 shrink-0"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">
                {userProfile?.fullName ?? user.displayName}
              </p>
              {roleBadge && (
                <span className={`mt-1 inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${roleBadge.cls}`}>
                  {roleBadge.label}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Nav links — scrollable */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {isMod && !isStudentMode ? (
            <>
              <SectionLabel>Quản lý</SectionLabel>
              <DrawerLink
                href="/admin/dashboard"
                icon={Gauge}
                active={pathname === "/admin/dashboard"}
                onClose={onClose}
              >
                Dashboard
              </DrawerLink>
              <DrawerLink
                href="/admin/create-exam"
                icon={CirclePlus}
                active={pathname === "/admin/create-exam"}
                onClose={onClose}
              >
                Tạo đề mới
              </DrawerLink>

              <SectionLabel>Kho đề thi</SectionLabel>
              <DrawerLink href="/admin/exam-list?tab=mine" icon={FileStack} onClose={onClose}>
                Đề của tôi
              </DrawerLink>
              <DrawerLink href="/admin/exam-list?tab=shared" icon={LibraryBig} onClose={onClose}>
                Đề được chia sẻ
              </DrawerLink>

              {isAdmin && (
                <>
                  <SectionLabel>Admin</SectionLabel>
                  <DrawerLink
                    href="/admin/exam-list"
                    icon={ShieldCheck}
                    active={pathname === "/admin/exam-list"}
                    onClose={onClose}
                  >
                    Tất cả đề thi
                  </DrawerLink>
                  <DrawerLink
                    href="/admin/users"
                    icon={UsersRound}
                    active={pathname.startsWith("/admin/users")}
                    onClose={onClose}
                  >
                    Người dùng
                  </DrawerLink>
                </>
              )}

              <SectionLabel>Lớp học</SectionLabel>
              <DrawerLink
                href="/teacher/classes"
                icon={School}
                active={pathname.startsWith("/teacher/classes")}
                onClose={onClose}
              >
                Quản lý lớp học
              </DrawerLink>

              <SectionLabel>Cá nhân</SectionLabel>
              <DrawerLink
                href="/tai-khoan"
                icon={UserRound}
                active={pathname === "/tai-khoan"}
                onClose={onClose}
              >
                Tài khoản & cài đặt
              </DrawerLink>
              <DrawerLink
                href="/student/history"
                icon={History}
                active={pathname === "/student/history"}
                onClose={onClose}
              >
                Lịch sử làm bài
              </DrawerLink>
            </>
          ) : (
            /* Student nav */
            <>
              <DrawerLink href="/" icon={Home} active={pathname === "/"} onClose={onClose}>
                Tất cả đề thi
              </DrawerLink>

              <SectionLabel>Danh mục đề</SectionLabel>

              {GRADE_LEVELS.map((grade) => {
                const isExpanded = expandedGrade === grade;
                const isThiThu = grade === "Thi Thử TN THPT";

                if (isThiThu) {
                  return (
                    <DrawerLink
                      key={grade}
                      href={gradeHref(grade)}
                      icon={Target}
                      onClose={onClose}
                    >
                      {grade}
                    </DrawerLink>
                  );
                }

                return (
                  <div key={grade}>
                    <button
                      onClick={() => setExpandedGrade(isExpanded ? null : grade)}
                      aria-expanded={isExpanded}
                      className="mb-0.5 flex min-h-11 w-full items-center justify-between rounded-xl px-2.5 text-sm font-semibold text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900"
                    >
                      <span className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500"><BookOpen size={17} aria-hidden="true" /></span>
                        {grade}
                      </span>
                      <ChevronRight size={16} aria-hidden="true" className={`text-gray-400 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                    </button>

                    {isExpanded && (
                      <div className="ml-6 mt-0.5 mb-1 space-y-0.5 border-l-2 border-brand-100 pl-3">
                        <Link
                          href={gradeHref(grade)}
                          onClick={onClose}
                          className="block px-3 py-2 rounded-lg text-xs font-medium text-gray-500 hover:bg-brand-50 hover:text-brand-700 transition-all"
                        >
                          Tất cả đề
                        </Link>
                        {EXAM_TYPES.map((type) => (
                          <Link
                            key={type}
                            href={`${gradeHref(grade)}?type=${encodeURIComponent(type)}`}
                            onClick={onClose}
                            className="block px-3 py-2 rounded-lg text-xs font-medium text-gray-500 hover:bg-brand-50 hover:text-brand-700 transition-all"
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
                <DrawerLink
                  href="/student/classes"
                  icon={GraduationCap}
                  active={pathname.startsWith("/student/classes")}
                  onClose={onClose}
                >
                  Lớp học của tôi
                </DrawerLink>
                <DrawerLink
                  href="/student/history"
                  icon={History}
                  active={pathname === "/student/history"}
                  onClose={onClose}
                >
                  Lịch sử làm bài
                </DrawerLink>
                <DrawerLink
                  href="/tai-khoan"
                  icon={UserRound}
                  active={pathname === "/tai-khoan"}
                  onClose={onClose}
                >
                  Tài khoản & cài đặt
                </DrawerLink>
              </div>
            </>
          )}
        </nav>

        {/* Footer: student-mode exit OR logout */}
        {user && (
          <div className="shrink-0 p-3 border-t border-gray-100 space-y-1">
            {/* Return-to-teacher button — only when mod/admin is in student mode */}
            {isMod && isStudentMode && (
              <button
                onClick={() => {
                  switchStudentMode(false);
                  onClose();
                }}
                className="w-full flex min-h-11 items-center gap-3 px-4 rounded-xl text-sm font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition-all"
              >
                <School size={16} className="shrink-0" aria-hidden="true" />
                Quay lại chế độ Giáo viên
              </button>
            )}
            <button
              onClick={() => {
                onClose();
                logout();
              }}
              className="w-full flex min-h-11 items-center gap-3 px-4 rounded-xl text-sm font-semibold text-danger-600 hover:bg-danger-50 transition-all"
            >
              <LogOut size={16} className="shrink-0" />
              Đăng xuất
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
