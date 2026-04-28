"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import MobileDrawer from "@/components/MobileDrawer";

export default function Header() {
  const { user, userProfile, loading, login, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const roleBadge =
    userProfile?.role === "pending_teacher"
      ? { label: "Chờ duyệt", cls: "bg-amber-100 text-amber-700" }
      : userProfile?.role === "mod"
      ? { label: "Giáo viên", cls: "bg-emerald-100 text-emerald-700" }
      : userProfile?.role === "admin"
      ? { label: "Admin", cls: "bg-blue-100 text-blue-700" }
      : null;

  return (
    <>
      <header className="bg-white shadow-sm border-b border-blue-100 sticky top-0 z-30 h-16 flex items-center shrink-0">
        <div className="w-full px-4 sm:px-6 flex items-center justify-between gap-4">

          {/* Left: Hamburger (mobile) + Branding */}
          <div className="flex items-center gap-2 min-w-0">
            {/* Hamburger — mobile only */}
            {user && (
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Mở menu"
                className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
              >
                <Menu size={22} />
              </button>
            )}

            {/* Branding */}
            <Link href="/" className="flex items-center gap-3 shrink-0 min-w-0">
              <span className="bg-blue-600 text-white w-9 h-9 rounded-xl items-center justify-center text-xl font-extrabold shadow-sm shrink-0 hidden md:flex">
                ∑
              </span>
              <div className="leading-none min-w-0">
                <p className="text-[10px] sm:text-xs font-extrabold text-blue-600 uppercase tracking-widest whitespace-nowrap">
                  HỆ THỐNG THI TRẮC NGHIỆM
                </p>
                <p className="text-xs sm:text-sm font-extrabold text-gray-900 uppercase tracking-wide whitespace-nowrap">
                  DÀNH CHO CẤP THPT
                </p>
              </div>
            </Link>
          </div>

          {/* Right: Auth section */}
          <div className="flex items-center gap-3 shrink-0">
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
                    className="w-8 h-8 rounded-full object-cover border-2 border-blue-200"
                    referrerPolicy="no-referrer"
                  />
                )}
                <span className="text-sm font-medium text-gray-700 hidden sm:block max-w-[120px] truncate">
                  {userProfile?.fullName ?? user.displayName}
                </span>
                {/* Logout — desktop only (mobile uses drawer footer) */}
                <button
                  onClick={logout}
                  className="hidden md:block text-sm font-medium text-gray-500 hover:text-red-500 border border-gray-200 hover:border-red-300 py-1.5 px-3 rounded-full transition-all"
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <button
                onClick={login}
                className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-full shadow-sm transition-all hover:shadow hover:-translate-y-0.5 active:translate-y-0"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  <path d="M1 1h22v22H1z" fill="none" />
                </svg>
                <span className="hidden sm:inline">Đăng nhập bằng Google</span>
                <span className="sm:hidden">Đăng nhập</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile slide-in drawer — rendered outside header so it can overlay everything */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
