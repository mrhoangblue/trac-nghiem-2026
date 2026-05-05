"use client";

/**
 * useExamSession — Manages in-progress exam session state using sessionStorage.
 *
 * WHY sessionStorage (not Firestore):
 *   Firestore requires security rules for the new collection. Without explicit
 *   rules, setDoc/getDoc fail silently/throw, so no session is ever persisted.
 *   sessionStorage is synchronous, needs no network, no rules, and survives
 *   F5 reload within the same browser tab — exactly what an exam needs.
 *
 * Storage key: `session_exam_{examId}_{uid}`
 * Payload:     { startMs: number }   ← client Date.now() when student clicked Start
 *
 * Lifecycle:
 *   startSession()  → write to sessionStorage
 *   clearSession()  → remove from sessionStorage  (called after successful submit)
 *   tab closed      → sessionStorage cleared automatically by the browser
 */

import { useCallback, useEffect, useState } from "react";

export type SessionStatus = "loading" | "none" | "in_progress" | "expired";

export interface UseExamSessionReturn {
  sessionStatus: SessionStatus;
  remainingSeconds: number;
  startSession: () => void;
  clearSession: () => void;
}

interface SessionPayload {
  startMs: number;
}

function sessionKey(examId: string, uid: string): string {
  return `session_exam_${examId}_${uid}`;
}

function readSession(examId: string, uid: string, durationMinutes: number) {
  try {
    const raw = sessionStorage.getItem(sessionKey(examId, uid));
    if (!raw) return null;
    const { startMs } = JSON.parse(raw) as SessionPayload;
    const remaining = Math.round(durationMinutes * 60 - (Date.now() - startMs) / 1000);
    return { startMs, remaining };
  } catch {
    return null;
  }
}

export function useExamSession(
  examId: string,
  uid: string | null,
  durationMinutes: number
): UseExamSessionReturn {
  // "loading" is the safe SSR-compatible initial value.
  // A useEffect immediately resolves it on the client before the first paint.
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("loading");
  const [remainingSeconds, setRemainingSeconds] = useState(durationMinutes * 60);

  // ── Read sessionStorage on mount (client-only, runs before first user interaction) ──
  useEffect(() => {
    if (!uid) {
      setSessionStatus("none");
      return;
    }

    const session = readSession(examId, uid, durationMinutes);

    if (!session) {
      setSessionStatus("none");
      return;
    }

    if (session.remaining <= 0) {
      setRemainingSeconds(0);
      setSessionStatus("expired");
    } else {
      setRemainingSeconds(session.remaining);
      setSessionStatus("in_progress");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // uid, examId, durationMinutes are stable for the lifetime of the component.

  // ── startSession: write start timestamp to sessionStorage ──────────────────
  const startSession = useCallback(() => {
    if (!uid) return;
    const payload: SessionPayload = { startMs: Date.now() };
    try {
      sessionStorage.setItem(sessionKey(examId, uid), JSON.stringify(payload));
    } catch {
      // sessionStorage unavailable (very rare) — exam still works, just no reload recovery
    }
  }, [examId, uid]);

  // ── clearSession: remove entry so next visit starts fresh ──────────────────
  const clearSession = useCallback(() => {
    if (!uid) return;
    try {
      sessionStorage.removeItem(sessionKey(examId, uid));
    } catch {
      // ignore
    }
  }, [examId, uid]);

  return { sessionStatus, remainingSeconds, startSession, clearSession };
}
