"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { X, LogOut } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { GRADE_LEVELS, EXAM_TYPES } from "@/components/Sidebar";

// ── Sub-components ─────────────────────────────────────────────────────────────

function DrawerLink({
  href,
  icon,
  children,
  active,
  onClose,
}: {
  href: string;
  icon?: string;
  children: React.ReactNode;
  active?: boolean;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
        active
          ? "bg-blue-50 text-blue-700"
          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      {icon && <span className="text-base shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest px-4 pt-5 pb-1.5">
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
      ? { label: "Giáo viên", cls: "bg-emerald-100 text-emerald-700" }
      : userProfile?.role === "admin"
      ? { label: "Admin", cls: "bg-blue-100 text-blue-700" }
      : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header: branding + close button */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0">
          <Link href="/" onClick={onClose} className="flex items-center gap-2.5">
            <span className="bg-blue-600 text-white w-8 h-8 rounded-xl flex items-center justify-center text-lg font-extrabold shadow-sm shrink-0">
              ∑
            </span>
            <div className="leading-none">
              <p className="text-[9px] font-extrabold text-blue-600 uppercase tracking-widest">
                HỆ THỐNG THI TRẮC NGHIỆM
              </p>
              <p className="text-[11px] font-extrabold text-gray-900 uppercase tracking-wide">
                DÀNH CHO CẤP THPT
              </p>
            </div>
          </Link>
          <button
            onClick={onClose}
            aria-label="Đóng menu"
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* User info strip */}
        {user && (
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100 shrink-0">
            {user.photoURL && (
              <img
                src={user.photoURL}
                alt={user.displayName ?? "Avatar"}
                width={36}
                height={36}
                className="w-9 h-9 rounded-full object-cover border-2 border-blue-200 shrink-0"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800 truncate">
                {userProfile?.fullName ?? user.displayName}
              </p>
              {roleBadge && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleBadge.cls}`}>
                  {roleBadge.label}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Nav links — scrollable */}
        <nav className="flex-1 overflow-y-auto p-2">
          {isMod ? (
            <>
              <SectionLabel>Quản lý</SectionLabel>
              <DrawerLink
                href="/admin/dashboard"
                icon="📊"
                active={pathname === "/admin/dashboard"}
                onClose={onClose}
              >
                Dashboard
              </DrawerLink>
              <DrawerLink
                href="/admin/create-exam"
                icon="➕"
                active={pathname === "/admin/create-exam"}
                onClose={onClose}
              >
                Tạo đề mới
              </DrawerLink>

              <SectionLabel>Kho đề thi</SectionLabel>
              <DrawerLink href="/admin/exam-list?tab=mine" icon="📁" onClose={onClose}>
                Đề của tôi
              </DrawerLink>
              <DrawerLink href="/admin/exam-list?tab=shared" icon="🌐" onClose={onClose}>
                Đề được chia sẻ
              </DrawerLink>

              {isAdmin && (
                <>
                  <SectionLabel>Admin</SectionLabel>
                  <DrawerLink
                    href="/admin/exam-list"
                    icon="📋"
                    active={pathname === "/admin/exam-list"}
                    onClose={onClose}
                  >
                    Tất cả đề thi
                  </DrawerLink>
                  <DrawerLink
                    href="/admin/users"
                    icon="👥"
                    active={pathname === "/admin/users"}
                    onClose={onClose}
                  >
                    Người dùng
                  </DrawerLink>
                </>
              )}

              <SectionLabel>Cá nhân</SectionLabel>
              <DrawerLink
                href="/student/history"
                icon="📜"
                active={pathname === "/student/history"}
                onClose={onClose}
              >
                Lịch sử làm bài
              </DrawerLink>
            </>
          ) : (
            /* Student nav */
            <>
              <DrawerLink href="/" icon="🏠" active={pathname === "/"} onClose={onClose}>
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
                      href={`/?grade=${encodeURIComponent(grade)}`}
                      icon="🎯"
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
                      className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-all"
                    >
                      <span className="flex items-center gap-3">
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
                      <div className="ml-6 mt-0.5 mb-1 space-y-0.5 border-l-2 border-gray-100 pl-2">
                        <Link
                          href={`/?grade=${encodeURIComponent(grade)}`}
                          onClick={onClose}
                          className="block px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-blue-50 hover:text-blue-700 transition-all"
                        >
                          — Tất cả
                        </Link>
                        {EXAM_TYPES.map((type) => (
                          <Link
                            key={type}
                            href={`/?grade=${encodeURIComponent(grade)}&type=${encodeURIComponent(type)}`}
                            onClick={onClose}
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

              <div className="pt-2">
                <DrawerLink
                  href="/student/history"
                  icon="📜"
                  active={pathname === "/student/history"}
                  onClose={onClose}
                >
                  Lịch sử làm bài
                </DrawerLink>
              </div>
            </>
          )}
        </nav>

        {/* Footer: logout */}
        {user && (
          <div className="shrink-0 p-3 border-t border-gray-100">
            <button
              onClick={() => {
                onClose();
                logout();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-all"
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
