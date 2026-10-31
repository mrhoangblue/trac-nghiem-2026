"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Eye, GraduationCap, LogIn, LogOut, Menu, Presentation, X } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useStudentMode, useSwitchStudentMode } from "@/lib/StudentModeContext";
import MobileDrawer from "@/components/MobileDrawer";

// ── StudentModeSwitch ─────────────────────────────────────────────────────────
// Công tắc hai vị trí Giáo viên / Học sinh (chỉ cho giáo viên, admin). Khi đổi
// chế độ, chuyển sang trang tương ứng để giáo viên ở lại đúng lớp đang xem.

function StudentModeSwitch() {
  const { isStudentMode } = useStudentMode();
  const switchMode = useSwitchStudentMode();
  const options = [
    { student: false, label: "Giáo viên", icon: Presentation },
    { student: true, label: "Học sinh", icon: GraduationCap },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Chế độ xem"
      className="relative grid grid-cols-2 rounded-full border border-gray-200 bg-white/80 p-1 shadow-sm"
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full shadow-md transition-all duration-300 ease-out ${
          isStudentMode
            ? "translate-x-full bg-gradient-to-r from-sky-500 to-cyan-500 shadow-sky-500/30"
            : "translate-x-0 bg-gradient-to-r from-indigo-600 to-violet-600 shadow-indigo-500/30"
        }`}
      />
      {options.map(({ student, label, icon: Icon }) => {
        const active = isStudentMode === student;
        return (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`Xem như ${label.toLowerCase()}`}
            title={student ? "Xem và thử website như học sinh" : "Quay lại giao diện giáo viên"}
            onClick={() => switchMode(student)}
            className={`relative z-10 inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors sm:px-3 ${
              active ? "text-white" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <Icon size={15} aria-hidden="true" />
            <span className="hidden lg:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── StudentPreviewBar ─────────────────────────────────────────────────────────

function StudentPreviewBar() {
  const switchMode = useSwitchStudentMode();
  return (
    <div className="sticky top-16 z-20 border-b border-sky-200 bg-gradient-to-r from-sky-50 via-cyan-50 to-sky-50">
      <div className="flex items-center gap-3 px-4 py-2 text-sm sm:px-6">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 text-white">
          <Eye size={15} aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1 text-sky-900">
          <b className="font-semibold">Đang xem như học sinh.</b>
          <span className="hidden text-sky-800/80 sm:inline"> Bài làm được đánh dấu &quot;Xem trước&quot;, tiến độ khóa học chỉ lưu tạm, không ảnh hưởng dữ liệu học sinh.</span>
        </p>
        <button
          type="button"
          onClick={() => switchMode(false)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-sky-800 shadow-sm ring-1 ring-sky-200 transition hover:bg-sky-100"
        >
          <X size={14} aria-hidden="true" />Thoát
        </button>
      </div>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

export default function Header() {
  const { user, userProfile, loading, login, logout, isMod } = useAuth();
  const { isStudentMode } = useStudentMode();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // When a teacher is in student mode, show a "Học sinh" badge instead of their real role
  const roleBadge = isStudentMode && isMod
    ? { label: "Học sinh", cls: "bg-sky-50 text-sky-700 ring-sky-200" }
    : userProfile?.role === "pending_teacher"
    ? { label: "Chờ duyệt", cls: "bg-amber-50 text-amber-700 ring-amber-200" }
    : userProfile?.role === "mod"
    ? { label: "Giáo viên", cls: "bg-violet-50 text-violet-700 ring-violet-200" }
    : userProfile?.role === "admin"
    ? { label: "Admin", cls: "bg-brand-50 text-brand-700 ring-brand-200" }
    : null;

  // Toggle is only available to teachers (mod) and admins
  const showStudentModeToggle = isMod && !loading;
  const displayName = userProfile?.fullName ?? user?.displayName ?? "";
  const avatarUrl = userProfile?.avatarUrl || user?.photoURL || "";

  return (
    <>
      <header className="site-header sticky top-0 z-30 flex h-16 shrink-0 items-center">
        <div className="flex w-full items-center justify-between gap-4 px-4 sm:px-6">

          {/* Left: Hamburger (mobile) + Branding */}
          <div className="flex min-w-0 items-center gap-2">
            {user && (
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Mở menu"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-brand-50 hover:text-brand-700 md:hidden"
              >
                <Menu size={22} />
              </button>
            )}

            <Link href="/" className="group flex min-w-0 shrink-0 items-center gap-3">
              <span className="relative h-10 w-10 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-sky-400 p-[2px] shadow-md shadow-indigo-500/25 transition-transform duration-300 group-hover:rotate-[-4deg] group-hover:scale-105">
                <span className="relative block h-full w-full overflow-hidden rounded-[14px] bg-white">
                  <Image
                    src="/thay-hoang-blue-avatar.png"
                    alt="Chân dung Thầy Hoàng Blue"
                    fill
                    sizes="40px"
                    className="translate-y-1.5 scale-[1.45] object-contain"
                    priority
                  />
                </span>
              </span>
              <div className="min-w-0 leading-none">
                <p className="whitespace-nowrap font-display text-sm font-extrabold tracking-tight text-gray-900 sm:text-base">
                  Học Toán <span className="edu-gradient-text">THPT</span>
                </p>
                <p className="mt-1 whitespace-nowrap text-[11px] font-medium text-gray-500">
                  cùng Thầy Hoàng Blue
                </p>
              </div>
            </Link>
          </div>

          {/* Right: Student-mode toggle (teachers only) + Auth section */}
          <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
            {showStudentModeToggle && <StudentModeSwitch />}

            {loading ? (
              <div className="h-10 w-32 animate-pulse rounded-full bg-gray-100" />
            ) : user ? (
              <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white/80 py-1 pl-1 pr-1 shadow-sm sm:pr-1.5">
                <Link href="/tai-khoan" title="Tài khoản & cài đặt" className="flex items-center gap-2 rounded-full transition hover:opacity-80">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Ảnh đại diện"
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full object-cover ring-2 ring-brand-100"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white">{displayName.charAt(0).toUpperCase() || "?"}</span>
                  )}
                  <span className="hidden max-w-[140px] truncate text-sm font-semibold text-gray-800 sm:block">
                    {displayName}
                  </span>
                </Link>
                {roleBadge && (
                  <span className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 sm:inline-flex ${roleBadge.cls}`}>
                    {roleBadge.label}
                  </span>
                )}
                <button
                  onClick={logout}
                  title="Đăng xuất"
                  aria-label="Đăng xuất"
                  className="hidden h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-danger-50 hover:text-danger-600 md:flex"
                >
                  <LogOut size={16} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                onClick={login}
                className="edu-btn flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white"
              >
                <LogIn size={18} aria-hidden="true" />
                <span className="hidden sm:inline">Đăng nhập bằng Google</span>
                <span className="sm:hidden">Đăng nhập</span>
              </button>
            )}
          </div>
        </div>
      </header>
      {showStudentModeToggle && isStudentMode && <StudentPreviewBar />}

      {/* Mobile slide-in drawer */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
