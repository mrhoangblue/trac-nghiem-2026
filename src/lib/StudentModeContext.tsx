"use client";

/**
 * StudentModeContext
 * ─────────────────────────────────────────────────────────────────────────────
 * Global toggle that lets a teacher (role=mod/admin) experience the exam
 * exactly like a student — without changing accounts or polluting Firestore
 * with real submissions.
 *
 * When isStudentMode === true:
 *   • A preview banner is shown at the top of the quiz page
 *   • Firestore writes are skipped (no IN_PROGRESS / COMPLETED docs created)
 *   • Retry-limit check is bypassed
 *   • Anti-cheat detection is disabled
 *
 * Ngoài trang làm bài, chế độ này còn:
 *   • Ẩn menu và chặn các trang quản trị (AdminGuard)
 *   • Cho giáo viên xem lớp/khóa học như học sinh, tiến độ chỉ giữ tạm
 *   • Liệt kê các lớp giáo viên đang dạy ở trang "Lớp học của tôi"
 *
 * State is persisted to localStorage so it survives reloads and tab restores.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudentModeContextValue {
  isStudentMode: boolean;
  toggleStudentMode: () => void;
  setStudentMode: (next: boolean) => void;
  /** Imperatively disable student mode (e.g. on logout) */
  disableStudentMode: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const StudentModeContext = createContext<StudentModeContextValue | null>(null);

const SESSION_KEY = "studentModeActive";

// ── Provider ──────────────────────────────────────────────────────────────────

export function StudentModeProvider({ children }: { children: React.ReactNode }) {
  // Initialise from localStorage so the toggle survives page reloads and tab restores
  const [isStudentMode, setIsStudentMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SESSION_KEY) === "true";
  });

  // Keep localStorage in sync whenever state changes
  useEffect(() => {
    localStorage.setItem(SESSION_KEY, String(isStudentMode));
  }, [isStudentMode]);

  const toggleStudentMode = useCallback(() => {
    setIsStudentMode((v) => !v);
  }, []);

  const disableStudentMode = useCallback(() => {
    setIsStudentMode(false);
  }, []);

  return (
    <StudentModeContext.Provider
      value={{ isStudentMode, toggleStudentMode, setStudentMode: setIsStudentMode, disableStudentMode }}
    >
      {children}
    </StudentModeContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useStudentMode(): StudentModeContextValue {
  const ctx = useContext(StudentModeContext);
  if (!ctx) {
    throw new Error("useStudentMode phải được dùng bên trong <StudentModeProvider>");
  }
  return ctx;
}

/**
 * Trang tương ứng khi đổi chế độ, để giáo viên ở lại đúng lớp/khóa học thay
 * vì kẹt ở một trang quản trị bị chặn.
 */
export function counterpartPath(pathname: string, toStudent: boolean): string | null {
  if (toStudent) {
    const classPage = /^\/teacher\/classes\/([^/]+)(\/courses\/[^/]+)?\/?$/.exec(pathname);
    if (classPage) return `/student/classes/${classPage[1]}${classPage[2] ?? ""}`;
    if (pathname === "/teacher/classes") return "/student/classes";
    if (pathname.startsWith("/admin") || pathname.startsWith("/teacher")) return "/";
    return null;
  }
  const classPage = /^\/student\/classes\/([^/]+)(\/courses\/[^/]+)?\/?$/.exec(pathname);
  if (classPage) return `/teacher/classes/${classPage[1]}${classPage[2] ?? ""}`;
  if (pathname === "/student/classes") return "/teacher/classes";
  return null;
}

/** Đổi chế độ và chuyển sang trang tương ứng (nếu có). */
export function useSwitchStudentMode() {
  const { isStudentMode, setStudentMode } = useStudentMode();
  const router = useRouter();
  const pathname = usePathname();
  return (next: boolean) => {
    if (next === isStudentMode) return;
    setStudentMode(next);
    const target = counterpartPath(pathname, next);
    if (target) router.push(target);
  };
}
