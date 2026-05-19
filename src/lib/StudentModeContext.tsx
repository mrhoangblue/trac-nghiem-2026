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
 * State is persisted to sessionStorage so it survives client-side navigation
 * within the same tab, but resets automatically when the browser is closed.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudentModeContextValue {
  isStudentMode: boolean;
  toggleStudentMode: () => void;
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
      value={{ isStudentMode, toggleStudentMode, disableStudentMode }}
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
