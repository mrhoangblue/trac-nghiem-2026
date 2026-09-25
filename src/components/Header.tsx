"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, LogIn } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useStudentMode } from "@/lib/StudentModeContext";
import MobileDrawer from "@/components/MobileDrawer";

// ── StudentModeToggle ─────────────────────────────────────────────────────────
// Rendered only for mod / admin roles.
// A pill-shaped toggle with an animated thumb, matching the existing header style.

function StudentModeToggle() {
  const { isStudentMode, toggleStudentMode } = useStudentMode();

  // ── Active: student mode ON → prominent amber exit button ─────────────────
  if (isStudentMode) {
    return (
      <button
        onClick={toggleStudentMode}
        title="Nhấn để quay lại chế độ Giáo viên"
        className="
          hidden sm:flex items-center gap-2 px-3 py-1.5
          rounded-full border text-xs font-bold transition-all duration-200
          bg-amber-500 border-amber-400 text-white
          hover:bg-amber-600 hover:border-amber-500
          shadow-md shadow-amber-200
          focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1
          animate-pulse-once
        "
      >
        <span className="text-sm leading-none">🎓</span>
        <span className="whitespace-nowrap leading-none">Chế độ học sinh</span>
        <span className="opacity-80 leading-none">· Thoát →</span>
      </button>
    );
  }

  // ── Inactive: teacher mode → subtle pill to enter student mode ─────────────
  return (
    <button
      onClick={toggleStudentMode}
      aria-pressed={false}
      aria-label="Bật chế độ học sinh"
      title="Xem đề thi như học sinh"
      className="
        group relative hidden sm:flex items-center gap-2 px-3 py-1.5
        rounded-full border text-xs font-bold transition-all duration-200
        bg-white border-gray-200 text-gray-500
        hover:border-brand-300 hover:text-brand-600
        focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1
      "
    >
      {/* Toggle track + thumb */}
      <span className="relative inline-flex w-8 h-4 rounded-full transition-colors duration-200 shrink-0 bg-gray-200 group-hover:bg-brand-200">
        <span className="absolute top-0.5 w-3 h-3 rounded-full shadow transition-all duration-200 translate-x-0.5 bg-white group-hover:bg-brand-400" />
      </span>
      <span className="whitespace-nowrap leading-none">Chế độ học sinh</span>
    </button>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

export default function Header() {
  const { user, userProfile, loading, login, logout, isMod } = useAuth();
  const { isStudentMode } = useStudentMode();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // When a teacher is in student mode, show a "Học sinh" badge instead of their real role
  const roleBadge = isStudentMode && isMod
    ? { label: "Học sinh", cls: "bg-amber-100 text-amber-700" }
    : userProfile?.role === "pending_teacher"
    ? { label: "Chờ duyệt", cls: "bg-amber-100 text-amber-700" }
    : userProfile?.role === "mod"
    ? { label: "Giáo viên", cls: "bg-success-100 text-success-700" }
    : userProfile?.role === "admin"
    ? { label: "Admin", cls: "bg-brand-100 text-brand-700" }
    : null;

  // Toggle is only available to teachers (mod) and admins
  const showStudentModeToggle = isMod && !loading;

  return (
    <>
      <header className="site-header sticky top-0 z-30 h-16 flex items-center shrink-0">
        <div className="w-full px-4 sm:px-6 flex items-center justify-between gap-4">

          {/* Left: Hamburger (mobile) + Branding */}
          <div className="flex items-center gap-2 min-w-0">
            {user && (
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Mở menu"
                className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
              >
                <Menu size={22} />
              </button>
            )}

            <Link href="/" className="flex items-center gap-3 shrink-0 min-w-0">
              <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-2xl border-2 border-white bg-brand-50 shadow-soft ring-1 ring-brand-200">
                <Image
                  src="/thay-hoang-blue-avatar.png"
                  alt="Chân dung Thầy Hoàng Blue"
                  fill
                  sizes="40px"
                  className="scale-[1.45] translate-y-1.5 object-contain"
                  priority
                />
              </span>
              <div className="leading-none min-w-0">
                <p className="text-[10px] sm:text-xs font-extrabold text-brand-600 uppercase tracking-widest whitespace-nowrap">
                  TOÁN THPT
                </p>
                <p className="text-[10px] sm:text-xs font-medium text-gray-500 whitespace-nowrap">
                  Cùng Thầy Hoàng Blue
                </p>
              </div>
            </Link>
          </div>

          {/* Right: Student-mode toggle (teachers only) + Auth section */}
          <div className="flex items-center gap-3 shrink-0">
            {/* ── Student-mode pill toggle — only for mod / admin ── */}
            {showStudentModeToggle && <StudentModeToggle />}

            {loading ? (
              <div className="w-28 h-9 bg-gray-100 rounded-full animate-pulse" />
            ) : user ? (
              <>
                {roleBadge && (
                  <span
                    className={`hidden sm:inline-flex text-xs font-bold px-2.5 py-0.5 rounded-full ${roleBadge.cls}`}
                  >
                    {roleBadge.label}
                  </span>
                )}
                {user.photoURL && (
                  <img
                    src={user.photoURL}
                    alt={user.displayName ?? "Avatar"}
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-full object-cover border-2 border-brand-200"
                    referrerPolicy="no-referrer"
                  />
                )}
                <span className="text-sm font-medium text-gray-700 hidden sm:block max-w-[120px] truncate">
                  {userProfile?.fullName ?? user.displayName}
                </span>
                <button
                  onClick={logout}
                  className="hidden md:block text-sm font-medium text-gray-500 hover:text-danger-500 border border-gray-200 hover:border-danger-300 py-1.5 px-3 rounded-full transition-all"
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <button
                onClick={login}
                className="flex items-center gap-2 bg-earth hover:bg-brand-900 text-white text-sm font-semibold py-2.5 px-4 rounded-xl shadow-soft transition-all"
              >
                <LogIn size={18} aria-hidden="true" />
                <span className="hidden sm:inline">Đăng nhập bằng Google</span>
                <span className="sm:hidden">Đăng nhập</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile slide-in drawer */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
