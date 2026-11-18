"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Coins, FileSearch, Gauge, Home, LogOut, ScrollText, ShieldCheck, UsersRound } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { systemRequest } from "@/components/system/ui";

const NAV = [
  { href: "/system", label: "Tổng quan", icon: Gauge },
  { href: "/system/users", label: "Người dùng", icon: UsersRound },
  { href: "/system/exams", label: "Đề thi", icon: FileSearch },
  { href: "/system/costs", label: "Chi phí", icon: Coins },
  { href: "/system/audit", label: "Nhật ký", icon: ScrollText },
] as const;

/** Khung riêng của khu quản trị hệ thống. Quyền được máy chủ xác nhận, không dựa vào vai trò giáo viên. */
export default function SystemShell({ children }: { children: React.ReactNode }) {
  const { user, loading, login, logout } = useAuth();
  const pathname = usePathname();
  const [checked, setChecked] = useState<{ uid: string; ok: boolean } | null>(null);
  const access: "checking" | "ok" | "denied" = user && checked?.uid === user.uid ? (checked.ok ? "ok" : "denied") : "checking";

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    systemRequest("/api/system/me").then(() => { if (!cancelled) setChecked({ uid: user.uid, ok: true }); }).catch(() => { if (!cancelled) setChecked({ uid: user.uid, ok: false }); });
    return () => { cancelled = true; };
  }, [loading, user]);

  if (access !== "ok") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F7F8FC] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-[var(--shadow-soft)]">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><ShieldCheck size={22} aria-hidden="true" /></span>
          <h1 className="mt-3 font-display text-lg font-extrabold text-gray-900">Quản trị hệ thống</h1>
          {loading || (user && access === "checking") ? <p role="status" className="mt-3 text-sm text-gray-400">Đang kiểm tra quyền…</p> : !user ? (
            <button type="button" onClick={() => void login()} className="edu-btn mt-4 h-11 w-full rounded-xl text-sm font-semibold text-white">Đăng nhập tài khoản quản trị</button>
          ) : (
            <>
              <p className="mt-3 text-sm text-gray-500">Tài khoản {user.email} không có quyền quản trị hệ thống.</p>
              <div className="mt-4 flex gap-2">
                <Link href="/" className="flex h-11 flex-1 items-center justify-center rounded-xl border border-gray-200 text-sm font-semibold text-gray-700">Về trang chủ</Link>
                <button type="button" onClick={logout} className="h-11 flex-1 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700">Đăng xuất</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const isActive = (href: string) => (href === "/system" ? pathname === "/system" : pathname.startsWith(href));
  return (
    <div className="min-h-dvh bg-[#F7F8FC] lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden border-r border-gray-200 bg-white lg:flex lg:flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-gray-100 px-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white"><ShieldCheck size={17} aria-hidden="true" /></span>
          <span className="font-display text-sm font-extrabold text-gray-900">Quản trị hệ thống</span>
        </div>
        <nav aria-label="Menu quản trị" className="flex-1 space-y-0.5 p-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
              className={`flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold transition ${isActive(href) ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}>
              <Icon size={17} aria-hidden="true" />{label}
            </Link>
          ))}
        </nav>
        <div className="space-y-1 border-t border-gray-100 p-3">
          <p className="truncate px-3 text-xs text-gray-400">{user?.email}</p>
          <Link href="/" className="flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-gray-600 hover:bg-gray-50"><Home size={17} aria-hidden="true" />Về trang người học</Link>
          <button type="button" onClick={logout} className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-gray-600 hover:bg-gray-50"><LogOut size={17} aria-hidden="true" />Đăng xuất</button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex h-12 items-center justify-between px-3">
            <span className="flex items-center gap-2 font-display text-sm font-extrabold text-gray-900"><ShieldCheck size={17} className="text-indigo-600" aria-hidden="true" />Quản trị hệ thống</span>
            <button type="button" onClick={logout} aria-label="Đăng xuất" className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500"><LogOut size={17} aria-hidden="true" /></button>
          </div>
          <nav aria-label="Menu quản trị" className="grid grid-cols-5 border-t border-gray-100">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${isActive(href) ? "text-indigo-700" : "text-gray-500"}`}>
                <Icon size={17} aria-hidden="true" />{label}
              </Link>
            ))}
          </nav>
        </header>
        <main id="system-main" className="mx-auto w-full max-w-[1400px] p-3 sm:p-5">{children}</main>
      </div>
    </div>
  );
}
