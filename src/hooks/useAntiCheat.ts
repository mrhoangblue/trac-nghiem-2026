"use client";

/**
 * useAntiCheat — Tracks tab visibility, window focus/blur, answer changes,
 * copy/paste attempts, and accumulates active time on the exam tab.
 *
 * Produces:
 *  - logAnswerChange(questionId, detail?)  — call in answer-change handlers
 *  - tabSwitchCount                        — live counter for UI warnings
 *  - getAntiCheatPayload()                 — snapshot to pass to enrichSubmission()
 *
 * Integration:
 *   1. Add the hook inside QuizClient (or a wrapper component).
 *   2. Call logAnswerChange() inside each setP1Ans / setP2Ans / setP3Ans handler.
 *   3. After the existing addDoc() in handleSubmit, call enrichSubmission().
 *
 * CRITICAL: This hook is self-contained. It does NOT import from QuizClient
 * and does NOT touch any grading state (p1Ans, p2Ans, p3Ans, scores).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityAction, ActivityLogEntry } from "@/utils/classroomTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UseAntiCheatOptions {
  /** Set to true once the student has pressed "Bắt đầu làm bài". */
  started: boolean;
  /** Set to true once the submission has been saved. Stops all listeners. */
  isSubmitted: boolean;
  /**
   * Pass Date.now() captured at the moment the student clicked "Bắt đầu".
   * If omitted the hook records its own start time on the first render where
   * `started` becomes true.
   */
  examStartTimeMs?: number;
}

export interface UseAntiCheatReturn {
  /**
   * Call this whenever a student changes an answer (P1/P2/P3).
   * Typically placed inside the setP1Ans / setP2Ans / setP3Ans callbacks.
   *
   * @param questionId  The question's original id field (number)
   * @param detail      Optional string — e.g. "A→C" for option changes
   */
  logAnswerChange: (questionId: number, detail?: string) => void;

  /** Current number of times the document became hidden while exam was active. */
  tabSwitchCount: number;

  /**
   * Returns a frozen snapshot of all collected data.
   * Call this synchronously inside handleSubmit before awaiting addDoc,
   * then pass the snapshot to enrichSubmission() after the doc is saved.
   */
  getAntiCheatPayload: () => {
    activityLogs: ActivityLogEntry[];
    actualTimeSpent: number;
    examStartTime: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useAntiCheat({
  started,
  isSubmitted,
  examStartTimeMs,
}: UseAntiCheatOptions): UseAntiCheatReturn {
  // Refs so event handlers always see fresh values without re-registering
  const logsRef = useRef<ActivityLogEntry[]>([]);
  const activeSecondsRef = useRef(0);
  const tabSwitchRef = useRef(0);
  const lastVisibleRef = useRef<number | null>(null);
  const startMsRef = useRef<number>(examStartTimeMs ?? Date.now());

  // State only for the UI counter — keep it minimal
  const [tabSwitchCount, setTabSwitchCount] = useState(0);

  // ── Internal log appender ─────────────────────────────────────────────────

  const addLog = useCallback(
    (action: ActivityAction, questionId?: number, detail?: string) => {
      const entry: ActivityLogEntry = { timestamp: Date.now(), action };
      if (questionId !== undefined) entry.questionId = questionId;
      if (detail !== undefined) entry.detail = detail;
      logsRef.current.push(entry);
    },
    []
  );

  // ── Record exam start ─────────────────────────────────────────────────────
  // Runs once when `started` first becomes true.

  const startedRef = useRef(false);
  useEffect(() => {
    if (!started || startedRef.current) return;
    startedRef.current = true;
    startMsRef.current = examStartTimeMs ?? Date.now();
    lastVisibleRef.current = document.hidden ? null : Date.now();
    addLog("EXAM_START");
  }, [started, examStartTimeMs, addLog]);

  // ── Active-seconds accumulator (1 Hz tick) ────────────────────────────────
  // Only counts while the tab is visible and the exam is active.

  useEffect(() => {
    if (!started || isSubmitted) return;
    const tick = setInterval(() => {
      if (!document.hidden && lastVisibleRef.current !== null) {
        activeSecondsRef.current += 1;
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [started, isSubmitted]);

  // ── visibilitychange — tab switch detection ───────────────────────────────

  useEffect(() => {
    if (!started || isSubmitted) return;

    const handleVisibility = () => {
      if (document.hidden) {
        lastVisibleRef.current = null;
        tabSwitchRef.current += 1;
        setTabSwitchCount(tabSwitchRef.current);
        addLog("TAB_BLUR");
      } else {
        lastVisibleRef.current = Date.now();
        addLog("TAB_FOCUS");
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [started, isSubmitted, addLog]);

  // ── window blur / focus — OS-level window switch ──────────────────────────

  useEffect(() => {
    if (!started || isSubmitted) return;

    const onBlur = () => addLog("WINDOW_BLUR");
    const onFocus = () => addLog("WINDOW_FOCUS");

    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [started, isSubmitted, addLog]);

  // ── Copy / Paste detection ────────────────────────────────────────────────
  // Logged but NOT blocked — paste is needed for P3 short-answer input.

  useEffect(() => {
    if (!started || isSubmitted) return;

    const onCopy = () => addLog("COPY_ATTEMPT");
    const onPaste = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      addLog("PASTE_ATTEMPT", undefined, tag);
    };

    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [started, isSubmitted, addLog]);

  // ── Public API ────────────────────────────────────────────────────────────

  const logAnswerChange = useCallback(
    (questionId: number, detail?: string) => {
      if (!started || isSubmitted) return;
      addLog("ANSWER_CHANGED", questionId, detail);
    },
    [started, isSubmitted, addLog]
  );

  const getAntiCheatPayload = useCallback(
    () => ({
      activityLogs: [...logsRef.current], // snapshot — caller owns this copy
      actualTimeSpent: activeSecondsRef.current,
      examStartTime: startMsRef.current,
    }),
    []
  );

  return { logAnswerChange, tabSwitchCount, getAntiCheatPayload };
}
