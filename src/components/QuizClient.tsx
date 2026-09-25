"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { ParsedQuestion } from "@/utils/latexParser";
import { processLatexText } from "@/utils/textProcessor";
import TikzRenderer from "@/components/TikzRenderer";
import ReviewMode from "@/components/ReviewMode";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { useStudentMode } from "@/lib/StudentModeContext";
import {
  ScoringConfig,
  TimingConfig,
  ScoreResult,
  ExamActivityEvent,
  ExamActivitySummary,
  QuestionTimingStat,
  P2_TABLE,
  normalizeAnswer,
  formatCountdown,
  formatDateTime,
} from "@/utils/examTypes";
import { saveDraft, loadDraft, clearDraft } from "@/utils/examDraft";
import { useExamSession } from "@/hooks/useExamSession";

// ── WakeLock type (may not be present in all TS lib configurations) ────────────

interface WakeLockSentinel {
  release(): Promise<void>;
}
type WakeLockNav = Navigator & {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinel> };
};

// ── Section metadata ──────────────────────────────────────────────────────────

export const SECTION_META: Record<string, { roman: string; label: string; note: string; colors: string }> = {
  multiple_choice: {
    roman: "I",
    label: "Câu hỏi trắc nghiệm nhiều phương án lựa chọn",
    note: "Mỗi câu trả lời đúng được 0,25 điểm",
    colors: "border-blue-200 bg-blue-50 text-blue-800",
  },
  true_false: {
    roman: "II",
    label: "Câu hỏi trắc nghiệm Đúng – Sai",
    note: "Điểm tối đa mỗi câu là 1,0 điểm theo quy chế",
    colors: "border-violet-200 bg-violet-50 text-violet-800",
  },
  short_answer: {
    roman: "III",
    label: "Câu hỏi trắc nghiệm trả lời ngắn",
    note: "Mỗi câu trả lời đúng được 0,25 hoặc 0,5 điểm tùy cấu hình",
    colors: "border-cyan-200 bg-cyan-50 text-cyan-800",
  },
};

// ── CountdownTimer ─────────────────────────────────────────────────────────────
//
// TASK 2 — Isolated timer component.
//
// KEY INSIGHT: The timer's `timeLeft` state was previously stored in the parent
// `QuizClient`. Every second `setTimeLeft` caused QuizClient (and all its
// children including KaTeX/TikZJax content) to re-render — this is what
// exhausted iOS Safari's memory and caused spontaneous reloads.
//
// By moving `timeLeft` into this isolated component, the parent only re-renders
// when the student actually interacts (navigation, answer selection).
// KaTeX and TikZ content are completely unaffected by the ticking clock.

interface CountdownTimerProps {
  totalSeconds: number;
  onExpire: () => void;
}

const CountdownTimer = memo(function CountdownTimer({
  totalSeconds,
  onExpire,
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(totalSeconds);
  // Always call the latest version of onExpire even if it was re-created
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  // Single stable interval — mounts once, never re-created
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // ← empty: mount once only, never recreated

  // Fire expiry callback when timer hits 0
  useEffect(() => {
    if (timeLeft === 0) onExpireRef.current();
  }, [timeLeft]);

  const isWarning = timeLeft <= 300 && timeLeft > 0;
  const isDanger  = timeLeft <= 60  && timeLeft > 0;

  return (
    <div className="sticky top-20 z-40 flex justify-end pointer-events-none lg:justify-stretch">
      <div
        className={`pointer-events-auto flex items-center justify-center gap-2 rounded-2xl px-4 py-3 font-mono text-lg font-extrabold shadow-lg transition-colors lg:w-full ${
          isDanger
            ? "bg-rose-600 text-white animate-pulse"
            : isWarning
            ? "bg-amber-500 text-white"
            : "border border-slate-200 bg-white text-slate-800"
        }`}
      >
        <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth={2} />
          <path strokeLinecap="round" d="M12 6v6l4 2" strokeWidth={2} />
        </svg>
        {formatCountdown(timeLeft)}
      </div>
    </div>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

export interface QuizClientProps {
  examId: string;
  title: string;
  questions: ParsedQuestion[];
  scoringConfig: ScoringConfig;
  timing: TimingConfig;
  maxRetries?: number;
}

export default function QuizClient({
  examId,
  title,
  questions,
  scoringConfig,
  timing,
  maxRetries = 1,
}: QuizClientProps) {
  const { user, userProfile, login } = useAuth();
  const { isStudentMode } = useStudentMode();
  const router = useRouter();

  // ── Screen state ──────────────────────────────────────────────────────────
  const [manuallyStarted, setManuallyStarted] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Blocks ALL UI until the Firestore IN_PROGRESS check resolves on mount.
  // Prevents the Start screen from flashing before we know a session exists.
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  // Remaining seconds derived from server-side examStartTime on page reload.
  // null on a fresh start → timer uses the full exam duration.
  const [remainingSecondsOverride, setRemainingSecondsOverride] = useState<number | null>(null);
  // Tracks the IN_PROGRESS submission doc ID so handleSubmit can UPDATE it
  // (rather than creating a duplicate completed record).
  const inProgressDocIdRef = useRef<string | null>(null);

  // NOTE: `timeLeft` state has been REMOVED from this component.
  // It now lives inside <CountdownTimer> to isolate per-second re-renders.

  // ── Exam session persistence ───────────────────────────────────────────────
  // startSession/clearSession write a backup timestamp to sessionStorage.
  // Primary session detection is done via Firestore in the mount useEffect.
  const { startSession, clearSession } =
    useExamSession(examId, user?.uid ?? null, timing.duration);

  // `started` is true once the student clicks "Bắt đầu" OR when a Firestore
  // IN_PROGRESS session is found on reload (both paths set manuallyStarted=true).
  const started = manuallyStarted;

  // ── Student answers ───────────────────────────────────────────────────────
  const [p1Ans, setP1Ans] = useState<Record<number, number>>({});
  const [p2Ans, setP2Ans] = useState<Record<number, (boolean | null)[]>>({});
  const [p3Ans, setP3Ans] = useState<Record<number, string>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const activityLogRef = useRef<ExamActivityEvent[]>([]);
  const questionTimingsRef = useRef<Map<number, QuestionTimingStat>>(new Map());
  const attemptStartedAtRef = useRef<number | null>(null);
  const questionEnteredAtRef = useRef<number | null>(null);
  const currentIdxRef = useRef(0);
  const lastInteractionAtSecondsRef = useRef(0);

  // ── Mount effect: check Firestore for an existing IN_PROGRESS session ────
  //
  // STATE MACHINE:
  //   isCheckingSession=true (initial) → query Firestore → isCheckingSession=false
  //
  // While isCheckingSession is true the component returns a loading spinner
  // (see guard below), so the Start screen never flashes on reload.
  //
  // IF an IN_PROGRESS doc is found:
  //   1. Store its ID so handleSubmit can UPDATE instead of creating a duplicate.
  //   2. Hydrate answers from localStorage.
  //   3. Calculate remaining seconds from the server-issued examStartTime.
  //   4. Set manuallyStarted=true → bypass the Start screen entirely.
  //
  // IF no IN_PROGRESS doc is found → reveal the Start screen normally.
  useEffect(() => {
    if (!user?.uid || !user?.email) return;

    const checkAndRestoreSession = async () => {
      try {
        const sessionQuery = query(
          collection(db, "submissions"),
          where("examId", "==", examId),
          where("studentEmail", "==", user.email),
          where("status", "==", "IN_PROGRESS")
        );
        const snap = await getDocs(sessionQuery);

        if (!snap.empty) {
          const sessionDoc = snap.docs[0];
          inProgressDocIdRef.current = sessionDoc.id;

          // Hydrate saved answers from localStorage draft
          const draft = loadDraft(examId, user.uid);
          if (draft) {
            if (Object.keys(draft.p1Ans).length) setP1Ans(draft.p1Ans);
            if (Object.keys(draft.p2Ans).length) setP2Ans(draft.p2Ans);
            if (Object.keys(draft.p3Ans).length) setP3Ans(draft.p3Ans);
          } else if (typeof sessionDoc.data().answersJson === "string") {
            try {
              const stored = JSON.parse(sessionDoc.data().answersJson);
              setP1Ans(stored.p1Ans ?? {});
              setP2Ans(stored.p2Ans ?? {});
              setP3Ans(stored.p3Ans ?? {});
            } catch {
              // Bài cũ hoặc dữ liệu nháp lỗi: tiếp tục với đáp án rỗng.
            }
          }

          // Calculate remaining seconds from the authoritative server timestamp
          const data = sessionDoc.data();
          const startTs = data.examStartTime as { toDate?: () => Date } | null;
          const startDate = startTs?.toDate?.();
          if (startDate) {
            attemptStartedAtRef.current = startDate.getTime();
            const elapsed = (Date.now() - startDate.getTime()) / 1000;
            const durationRemaining = timing.duration * 60 - Math.floor(elapsed);
            const closeRemaining = timing.endTime
              ? Math.floor((new Date(timing.endTime).getTime() - Date.now()) / 1000)
              : Number.POSITIVE_INFINITY;
            const remaining = Math.max(0, Math.min(durationRemaining, closeRemaining));
            setRemainingSecondsOverride(remaining);
          }

          activityLogRef.current = Array.isArray(data.activityLog) ? data.activityLog : [];
          const storedTimings = Array.isArray(data.questionTimings)
            ? (data.questionTimings as QuestionTimingStat[])
            : [];
          questionTimingsRef.current = new Map(storedTimings.map((item) => [item.questionId, item]));
          lastInteractionAtSecondsRef.current = Number(data.lastInteractionAtSeconds ?? 0);
          const restoredIndex = Math.min(
            Math.max(0, Number(data.currentQuestionIndex ?? 0)),
            Math.max(0, questions.length - 1)
          );
          currentIdxRef.current = restoredIndex;
          setCurrentIdx(restoredIndex);
          questionEnteredAtRef.current = Date.now();

          // Skip the Start screen — student is already mid-exam
          setManuallyStarted(true);
        }
      } catch (err) {
        console.error("Session restore failed:", err);
        // Non-fatal: fall through to reveal the Start screen
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkAndRestoreSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // user, examId, timing.duration are stable for the lifetime of this mount.

  // ── Stable refs so answer callbacks can write drafts without re-creation ──
  // Each ref always holds the latest answer map; read inside the functional updater.
  const p1AnsRef = useRef(p1Ans);
  const p2AnsRef = useRef(p2Ans);
  const p3AnsRef = useRef(p3Ans);
  useEffect(() => { p1AnsRef.current = p1Ans; }, [p1Ans]);
  useEffect(() => { p2AnsRef.current = p2Ans; }, [p2Ans]);
  useEffect(() => { p3AnsRef.current = p3Ans; }, [p3Ans]);

  const elapsedSeconds = useCallback(() => {
    if (!attemptStartedAtRef.current) return 0;
    return Math.max(0, Math.round((Date.now() - attemptStartedAtRef.current) / 1000));
  }, []);

  const answerSummary = useCallback((question: ParsedQuestion): string => {
    if (question.type === "multiple_choice") {
      const selected = p1AnsRef.current[question.id];
      return selected === undefined ? "Chưa trả lời" : String.fromCharCode(65 + selected);
    }
    if (question.type === "true_false") {
      const answers = p2AnsRef.current[question.id] ?? [];
      return answers
        .map((value, index) => `${String.fromCharCode(97 + index)}:${value == null ? "—" : value ? "Đ" : "S"}`)
        .join(", ");
    }
    return p3AnsRef.current[question.id]?.trim() || "Chưa trả lời";
  }, []);

  const recordAnswer = useCallback((questionId: number, answer: string) => {
    const questionIndex = questions.findIndex((question) => question.id === questionId);
    const atSeconds = elapsedSeconds();
    lastInteractionAtSecondsRef.current = atSeconds;
    const previous = questionTimingsRef.current.get(questionId);
    if (previous) {
      questionTimingsRef.current.set(questionId, { ...previous, lastAnsweredAtSeconds: atSeconds });
    }
    activityLogRef.current.push({
      atSeconds,
      questionId,
      questionNumber: questionIndex + 1,
      action: "answer",
      answer,
    });
    if (activityLogRef.current.length > 500) activityLogRef.current.shift();
  }, [elapsedSeconds, questions]);

  const enterQuestion = useCallback((index: number) => {
    const question = questions[index];
    if (!question) return;
    const atSeconds = elapsedSeconds();
    const previous = questionTimingsRef.current.get(question.id);
    questionTimingsRef.current.set(question.id, {
      questionId: question.id,
      questionNumber: index + 1,
      totalSeconds: previous?.totalSeconds ?? 0,
      visits: (previous?.visits ?? 0) + 1,
      firstVisitedAtSeconds: previous?.firstVisitedAtSeconds ?? atSeconds,
      ...(previous?.lastAnsweredAtSeconds !== undefined
        ? { lastAnsweredAtSeconds: previous.lastAnsweredAtSeconds }
        : {}),
    });
    currentIdxRef.current = index;
    questionEnteredAtRef.current = Date.now();
    lastInteractionAtSecondsRef.current = atSeconds;
    activityLogRef.current.push({
      atSeconds,
      questionId: question.id,
      questionNumber: index + 1,
      action: "enter",
    });
    if (activityLogRef.current.length > 500) activityLogRef.current.shift();
  }, [elapsedSeconds, questions]);

  const finalizeCurrentQuestion = useCallback((action: "leave" | "submit") => {
    const question = questions[currentIdxRef.current];
    const enteredAt = questionEnteredAtRef.current;
    if (!question || enteredAt === null) return;
    const atSeconds = elapsedSeconds();
    const spentSeconds = Math.max(0, Math.round((Date.now() - enteredAt) / 1000));
    const previous = questionTimingsRef.current.get(question.id);
    questionTimingsRef.current.set(question.id, {
      questionId: question.id,
      questionNumber: currentIdxRef.current + 1,
      totalSeconds: (previous?.totalSeconds ?? 0) + spentSeconds,
      visits: previous?.visits ?? 1,
      firstVisitedAtSeconds: previous?.firstVisitedAtSeconds ?? 0,
      ...(previous?.lastAnsweredAtSeconds !== undefined
        ? { lastAnsweredAtSeconds: previous.lastAnsweredAtSeconds }
        : {}),
    });
    activityLogRef.current.push({
      atSeconds,
      questionId: question.id,
      questionNumber: currentIdxRef.current + 1,
      action,
      answer: answerSummary(question),
      spentSeconds,
    });
    if (activityLogRef.current.length > 500) activityLogRef.current.shift();
    questionEnteredAtRef.current = null;
  }, [answerSummary, elapsedSeconds, questions]);

  const getActivitySummary = useCallback((): ExamActivitySummary => {
    const totalElapsedSeconds = elapsedSeconds();
    const lastInteractionAtSeconds = lastInteractionAtSecondsRef.current;
    return {
      activityLog: activityLogRef.current.slice(-500),
      questionTimings: Array.from(questionTimingsRef.current.values())
        .sort((a, b) => a.questionNumber - b.questionNumber),
      totalElapsedSeconds,
      lastInteractionAtSeconds,
      idleBeforeSubmitSeconds: Math.max(0, totalElapsedSeconds - lastInteractionAtSeconds),
    };
  }, [elapsedSeconds]);

  const persistActivitySnapshot = useCallback((currentQuestionIndex: number) => {
    if (!inProgressDocIdRef.current) return;
    const summary = getActivitySummary();
    void updateDoc(doc(db, "submissions", inProgressDocIdRef.current), {
      ...summary,
      currentQuestionIndex,
      answersJson: JSON.stringify({
        p1Ans: p1AnsRef.current,
        p2Ans: p2AnsRef.current,
        p3Ans: p3AnsRef.current,
      }),
      lastActivityAt: serverTimestamp(),
    }).catch((error) => console.warn("Không thể lưu nhật ký làm bài:", error));
  }, [getActivitySummary]);

  // saveDraftRef stays stable (empty-dep callbacks read it via ref).
  const saveDraftRef = useRef<(
    p1: Record<number, number>,
    p2: Record<number, (boolean | null)[]>,
    p3: Record<number, string>
  ) => void>(() => {});
  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;
    saveDraftRef.current = (p1, p2, p3) =>
      saveDraft(examId, uid, { p1Ans: p1, p2Ans: p2, p3Ans: p3 });
  }, [user?.uid, examId]);

  // ── handleStartExam: called when student clicks "Bắt đầu" ─────────────────
  // 1. Creates an IN_PROGRESS record in Firestore so a reload can find it.
  // 2. Writes a backup timestamp to sessionStorage via startSession().
  // 3. Transitions to the active quiz UI.
  const handleStartExam = useCallback(async () => {
    if (!user?.email || !user?.uid) return;
    const now = Date.now();
    attemptStartedAtRef.current = now;
    activityLogRef.current = [];
    questionTimingsRef.current = new Map();
    lastInteractionAtSecondsRef.current = 0;
    enterQuestion(0);
    const closeRemaining = timing.endTime
      ? Math.floor((new Date(timing.endTime).getTime() - now) / 1000)
      : Number.POSITIVE_INFINITY;
    setRemainingSecondsOverride(Math.max(0, Math.min(timing.duration * 60, closeRemaining)));
    // Always create an IN_PROGRESS record in Firestore.
    // If the teacher is in student-preview mode, tag the doc with isTeacherPreview: true
    // so it can be identified and filtered out of real statistics later.
    try {
      const docRef = await addDoc(collection(db, "submissions"), {
        examId,
        examTitle: title,
        studentName: userProfile?.fullName ?? user.displayName ?? "Khách",
        studentEmail: user.email,
        studentAvatar: user.photoURL ?? "",
        status: "IN_PROGRESS",
        examStartTime: serverTimestamp(),
        activityLog: activityLogRef.current,
        questionTimings: Array.from(questionTimingsRef.current.values()),
        lastInteractionAtSeconds: 0,
        ...(isStudentMode ? { isTeacherPreview: true } : {}),
      });
      inProgressDocIdRef.current = docRef.id;
    } catch (err) {
      console.error("Failed to write IN_PROGRESS record:", err);
      // Non-fatal — exam still runs; reload won't restore (Firestore unavailable)
    }
    startSession(); // sessionStorage fallback for timer reference
    setManuallyStarted(true);
  }, [isStudentMode, examId, title, user, userProfile, startSession, enterQuestion, timing]);

  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);

  // ── TASK 1: Wake Lock ─────────────────────────────────────────────────────
  //
  // Prevents the screen from dimming/locking while the student is mid-exam.
  // The OS automatically releases the lock when the user switches apps or hides
  // the browser — we re-request it when the tab becomes visible again.

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    const nav = navigator as WakeLockNav;
    if (!nav.wakeLock) return; // API not supported (older browsers/iOS < 16.4)
    try {
      // Release any stale sentinel before acquiring a new one
      if (wakeLockRef.current) {
        await wakeLockRef.current.release().catch(() => {});
      }
      wakeLockRef.current = await nav.wakeLock.request("screen");
    } catch {
      // User/OS denied — not a critical error, exam still works
    }
  }, []);

  // Acquire wake lock when quiz starts; release on unmount / submission
  useEffect(() => {
    if (!started || isSubmitted) return;
    requestWakeLock();
    return () => {
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [started, isSubmitted, requestWakeLock, isStudentMode]);

  // ── Retry limit ───────────────────────────────────────────────────────────
  // In student-preview mode the teacher is not a real student — bypass the
  // retry limit entirely so the toggle never blocks the teacher from previewing.
  const [submissionCount, setSubmissionCount] = useState<number | null>(null);
  const userEmail = user?.email ?? null; // stable string dep (not object ref)

  useEffect(() => {
    if (!userEmail || isStudentMode) return; // skip when previewing
    let cancelled = false;
    const countPrev = async () => {
      try {
        const q = query(
          collection(db, "submissions"),
          where("examId", "==", examId),
          where("studentEmail", "==", userEmail),
          where("status", "==", "COMPLETED")
        );
        const snap = await getDocs(q);
        if (!cancelled) setSubmissionCount(snap.size);
      } catch {
        if (!cancelled) setSubmissionCount(0);
      }
    };
    countPrev();
    return () => { cancelled = true; };
  }, [userEmail, examId, isStudentMode]);

  // ── Anti-cheat + Wake Lock re-acquire (merged visibility handler) ─────────
  // Anti-cheat is disabled in student-preview mode — the teacher is deliberately
  // navigating away to test the experience and should not be penalised.
  const [cheatCount, setCheatCount] = useState(0);
  const [showCheatWarning, setShowCheatWarning] = useState(false);
  const cheatCountRef = useRef(0);

  useEffect(() => {
    if (!started || isSubmitted) return;
    const handleVisibility = () => {
      if (document.hidden) {
        // Student left the exam tab — only count when NOT in preview mode
        if (!isStudentMode) {
          cheatCountRef.current += 1;
          setCheatCount(cheatCountRef.current);
          setShowCheatWarning(true);
        }
      } else {
        // TASK 1 edge case: tab became visible again.
        // The OS always releases wake lock when the page is hidden — re-request it.
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [started, isSubmitted, requestWakeLock]);

  // ── Exit-navigation guard ─────────────────────────────────────────────────
  // While the student is mid-exam (started, not yet submitted), intercept ALL
  // navigation attempts (link clicks, back button, tab close) and show a
  // confirmation modal. On confirm: save progress then navigate.
  const [exitConfirmHref, setExitConfirmHref] = useState<string | null>(null);
  const [isSavingExit, setIsSavingExit] = useState(false);
  // Ref to bypass guard during the actual save-and-navigate phase
  const isExitingRef = useRef(false);

  // 1. Intercept in-app link clicks (capture phase fires before Next.js router)
  useEffect(() => {
    if (!started || isSubmitted) return;
    const handleClick = (e: MouseEvent) => {
      if (isExitingRef.current) return;
      const anchor = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      // Allow hash anchors, external URLs, and same-page navigation
      if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto")) return;
      if (href === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setExitConfirmHref(href);
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [started, isSubmitted]);

  // 2. Intercept browser back / forward button
  useEffect(() => {
    if (!started || isSubmitted) return;
    // Push a guard state so the first back-press can be caught
    window.history.pushState({ examGuard: true }, "", window.location.href);
    const handlePopState = () => {
      if (isExitingRef.current) return;
      // Re-push to keep us on the quiz URL while showing the modal
      window.history.pushState({ examGuard: true }, "", window.location.href);
      setExitConfirmHref("__back__");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [started, isSubmitted]);

  // 3. Intercept tab close / page refresh (browser native dialog)
  useEffect(() => {
    if (!started || isSubmitted) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [started, isSubmitted]);

  // ── Question partitioning — memoized to avoid array churn ─────────────────
  const p1Qs = useMemo(() => questions.filter((q) => q.type === "multiple_choice"), [questions]);
  const p2Qs = useMemo(() => questions.filter((q) => q.type === "true_false"), [questions]);
  const p3Qs = useMemo(() => questions.filter((q) => q.type === "short_answer"), [questions]);

  const p2AnsweredCount = Object.values(p2Ans).filter((arr) =>
    arr.some((v) => v !== null && v !== undefined)
  ).length;

  const totalAnswered =
    Object.keys(p1Ans).length +
    p2AnsweredCount +
    Object.keys(p3Ans).filter((k) => (p3Ans[Number(k)] ?? "").trim() !== "").length;
  const totalQuestions = questions.length;
  const progress = totalQuestions > 0 ? (totalAnswered / totalQuestions) * 100 : 0;

  // ── Score calculation ─────────────────────────────────────────────────────
  const calculateScore = useCallback((): ScoreResult => {
    let p1 = 0;
    let p1Correct = 0;
    if (p1Qs.length > 0) {
      const perQ = scoringConfig.part1TotalScore / p1Qs.length;
      p1Qs.forEach((q) => {
        if (p1Ans[q.id] === (q.correctAnswer as number)) { p1 += perQ; p1Correct++; }
      });
    }

    let p2 = 0;
    const p2Details: ScoreResult["part2"]["details"] = [];
    p2Qs.forEach((q) => {
      const correct = q.correctAnswer as boolean[];
      const student = p2Ans[q.id] ?? new Array(correct.length).fill(null);
      const hits = correct.filter((c, i) => c === student[i]).length;
      const qScore = P2_TABLE[hits] ?? 0;
      p2 += qScore;
      p2Details.push({ match: hits, maxMatch: correct.length, score: qScore });
    });

    let p3 = 0;
    let p3Correct = 0;
    const totalP3 = scoringConfig.part3TotalScore ?? 1;
    if (p3Qs.length > 0) {
      const perQ = totalP3 / p3Qs.length;
      p3Qs.forEach((q) => {
        const ns = normalizeAnswer(p3Ans[q.id] ?? "");
        const nc = normalizeAnswer(String(q.correctAnswer ?? ""));
        if (ns !== "" && ns === nc) { p3 += perQ; p3Correct++; }
      });
    }

    const r = (n: number) => Math.round(n * 100) / 100;
    return {
      p1: r(p1), p2: r(p2), p3: r(p3),
      total: r(p1 + p2 + p3),
      part1: { correct: p1Correct, total: p1Qs.length, score: r(p1) },
      part2: { details: p2Details, totalScore: r(p2) },
      part3: { correct: p3Correct, total: p3Qs.length, score: r(p3) },
    };
  }, [p1Ans, p2Ans, p3Ans, p1Qs, p2Qs, p3Qs, scoringConfig]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (force = false) => {
      if (isSubmitted || submitting) return;

      if (!force && totalAnswered < totalQuestions) {
        const ok = window.confirm(
          `Bạn chưa hoàn thành tất cả câu hỏi (${totalAnswered}/${totalQuestions}). Vẫn nộp bài?`
        );
        if (!ok) return;
      }

      setSubmitting(true);
      finalizeCurrentQuestion("submit");
      const activitySummary = getActivitySummary();
      const result = calculateScore();

      const part1Results = p1Qs.map((q) => p1Ans[q.id] === (q.correctAnswer as number));
      const part2Results = p2Qs.map((q) => {
        const correct = q.correctAnswer as boolean[];
        const student = p2Ans[q.id] ?? new Array(correct.length).fill(null);
        return correct.filter((c, i) => c === student[i]).length;
      });
      const part3Results = p3Qs.map((q) => {
        const s = normalizeAnswer(p3Ans[q.id] ?? "");
        const c = normalizeAnswer(String(q.correctAnswer ?? ""));
        return !!s && s === c;
      });

      let savedSubmissionId: string | undefined;

      // ── Always write to Firestore ─────────────────────────────────────────────
      // In student-preview mode (teacher testing), tag the doc with isTeacherPreview: true.
      // This lets gradebook queries filter it out while still recording the teacher's work.
      try {
        const submissionPayload = {
          examId,
          examTitle: title,
          studentName: userProfile?.fullName ?? user?.displayName ?? "Khách",
          studentEmail: user?.email ?? "—",
          studentAvatar: user?.photoURL ?? "",
          status: "COMPLETED",
          submittedAt: serverTimestamp(),
          part1Results,
          part2Results,
          part3Results,
          scores: result,
          answersJson: JSON.stringify({ p1Ans, p2Ans, p3Ans }),
          cheatCount: cheatCountRef.current,
          ...activitySummary,
          ...(isStudentMode ? { isTeacherPreview: true } : {}),
        };

        if (inProgressDocIdRef.current) {
          // UPDATE the existing IN_PROGRESS doc → avoids creating a duplicate
          await updateDoc(doc(db, "submissions", inProgressDocIdRef.current), submissionPayload);
          savedSubmissionId = inProgressDocIdRef.current;
        } else {
          // Fallback: no IN_PROGRESS doc (Firestore was unavailable at start)
          const docRef = await addDoc(collection(db, "submissions"), submissionPayload);
          savedSubmissionId = docRef.id;
        }

        // Clear persistence artifacts — draft and sessionStorage backup
        if (user?.uid) clearDraft(examId, user.uid);
        clearSession();
      } catch (err) {
        console.error("Lỗi lưu bài nộp:", err);
      }

      // Send result email — skip for teacher preview mode
      if (!isStudentMode && user?.email && user.email !== "—") {
        const toP2EmailAnswer = (answers: (boolean | null)[]) => ({
          a: answers[0],
          b: answers[1],
          c: answers[2],
          d: answers[3],
        });

        const detailedResults = [
          ...p1Qs.map((q, i) => ({
            number: i + 1,
            part: "P1" as const,
            isCorrect: part1Results[i] ?? false,
            studentAnswer: p1Ans[q.id] !== undefined ? String.fromCharCode(65 + p1Ans[q.id]) : "—",
            correctAnswer: String.fromCharCode(65 + (q.correctAnswer as number)),
          })),
          ...p2Qs.map((q, i) => ({
            number: p1Qs.length + i + 1,
            part: "P2" as const,
            isCorrect: part2Results[i] === (q.correctAnswer as boolean[]).length,
            partialHits: part2Results[i],
            studentAnswer: toP2EmailAnswer(
              p2Ans[q.id] ?? new Array((q.correctAnswer as boolean[]).length).fill(null),
            ),
            correctAnswer: toP2EmailAnswer(q.correctAnswer as boolean[]),
          })),
          ...p3Qs.map((q, i) => ({
            number: p1Qs.length + p2Qs.length + i + 1,
            part: "P3" as const,
            isCorrect: part3Results[i] ?? false,
            studentAnswer: p3Ans[q.id] || "—",
            correctAnswer: String(q.correctAnswer ?? ""),
          })),
        ];

        const token = await user.getIdToken();
        fetch("/api/send-result", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            studentEmail: user.email,
            studentName: userProfile?.fullName ?? user.displayName ?? "Học sinh",
            examName: title,
            submissionId: savedSubmissionId,
            scores: { p1: result.p1, p2: result.p2, p3: result.p3, total: result.total },
            detailedResults,
          }),
        }).catch((err) => console.warn("Gửi email thất bại (non-critical):", err));
      }

      setScoreResult(result);
      setIsSubmitted(true);
      setSubmitting(false);
    },
    [
      isStudentMode, isSubmitted, submitting, totalAnswered, totalQuestions,
      calculateScore, p1Qs, p2Qs, p3Qs,
      p1Ans, p2Ans, p3Ans, examId, title, user, userProfile,
      clearSession, finalizeCurrentQuestion, getActivitySummary,
      // cheatCount intentionally OMITTED — read via cheatCountRef.current inside
    ]
  );

  // ── handleExitWithSave: save progress then navigate away ─────────────────────
  // Called from the exit-confirmation modal. Calculates score from whatever
  // answers the student has entered so far, writes a COMPLETED doc tagged with
  // exitedEarly:true, then navigates to the requested href.
  const handleExitWithSave = useCallback(async () => {
    if (!exitConfirmHref || isSavingExit) return;
    isExitingRef.current = true;
    setIsSavingExit(true);

    finalizeCurrentQuestion("submit");
    const activitySummary = getActivitySummary();

    const result = calculateScore();
    const part1Results = p1Qs.map((q) => p1Ans[q.id] === (q.correctAnswer as number));
    const part2Results = p2Qs.map((q) => {
      const correct = q.correctAnswer as boolean[];
      const student = p2Ans[q.id] ?? new Array(correct.length).fill(null);
      return correct.filter((c, i) => c === student[i]).length;
    });
    const part3Results = p3Qs.map((q) => {
      const s = normalizeAnswer(p3Ans[q.id] ?? "");
      const c = normalizeAnswer(String(q.correctAnswer ?? ""));
      return !!s && s === c;
    });

    try {
      const submissionPayload = {
        examId,
        examTitle: title,
        studentName: userProfile?.fullName ?? user?.displayName ?? "Khách",
        studentEmail: user?.email ?? "—",
        studentAvatar: user?.photoURL ?? "",
        status: "COMPLETED",
        submittedAt: serverTimestamp(),
        part1Results,
        part2Results,
        part3Results,
        scores: result,
        answersJson: JSON.stringify({ p1Ans, p2Ans, p3Ans }),
        cheatCount: cheatCountRef.current,
        ...activitySummary,
        exitedEarly: true, // flag: student left before finishing all questions
        ...(isStudentMode ? { isTeacherPreview: true } : {}),
      };
      if (inProgressDocIdRef.current) {
        await updateDoc(doc(db, "submissions", inProgressDocIdRef.current), submissionPayload);
      } else {
        await addDoc(collection(db, "submissions"), submissionPayload);
      }
      if (user?.uid) clearDraft(examId, user.uid);
      clearSession();
    } catch (err) {
      console.error("Lỗi lưu bài khi thoát:", err);
      // Non-fatal: navigate anyway so the student isn't stuck
    }

    const href = exitConfirmHref;
    setExitConfirmHref(null);
    // Navigate: back-button exits go to home, link clicks go to the target href
    router.push(href === "__back__" ? "/" : href);
  }, [
    exitConfirmHref, isSavingExit, calculateScore,
    p1Qs, p2Qs, p3Qs, p1Ans, p2Ans, p3Ans,
    examId, title, user, userProfile,
    clearSession, isStudentMode, router, finalizeCurrentQuestion, getActivitySummary,
  ]);

  // Keep a ref so CountdownTimer.onExpire always calls the latest handleSubmit
  const handleSubmitRef = useRef(handleSubmit);
  useEffect(() => { handleSubmitRef.current = handleSubmit; }, [handleSubmit]);

  // Stable callback passed to CountdownTimer — empty deps because it reads
  // handleSubmit through the ref, never needs to be recreated.
  const onExpire = useCallback(() => handleSubmitRef.current(true), []);

  // ── Stable answer handlers (useCallback with empty deps) ───────────────────
  // Using functional updater form (setX(prev => ...)) means no external deps.
  // Stable refs ensure React.memo on QuestionCard is not bypassed by handler
  // identity changes on every parent render.
  const onP1 = useCallback(
    (qId: number, optIdx: number) => {
      const next = { ...p1AnsRef.current, [qId]: optIdx };
      p1AnsRef.current = next;
      setP1Ans(next);
      saveDraftRef.current(next, p2AnsRef.current, p3AnsRef.current);
      recordAnswer(qId, String.fromCharCode(65 + optIdx));
    },
    [recordAnswer]
  );
  const onP2 = useCallback(
    (qId: number, stmtIdx: number, value: boolean) => {
      const current = p2AnsRef.current[qId] ?? new Array(4).fill(null);
      const row = [...current];
      row[stmtIdx] = value;
      const next = { ...p2AnsRef.current, [qId]: row };
      p2AnsRef.current = next;
      setP2Ans(next);
      saveDraftRef.current(p1AnsRef.current, next, p3AnsRef.current);
      recordAnswer(qId, `${String.fromCharCode(97 + stmtIdx)}:${value ? "Đ" : "S"}`);
    },
    [recordAnswer]
  );
  const onP3 = useCallback(
    (qId: number, val: string) => {
      const next = { ...p3AnsRef.current, [qId]: val };
      p3AnsRef.current = next;
      setP3Ans(next);
      saveDraftRef.current(p1AnsRef.current, p2AnsRef.current, next);
      lastInteractionAtSecondsRef.current = elapsedSeconds();
      const previousTiming = questionTimingsRef.current.get(qId);
      if (previousTiming) {
        questionTimingsRef.current.set(qId, {
          ...previousTiming,
          lastAnsweredAtSeconds: lastInteractionAtSecondsRef.current,
        });
      }
    },
    [elapsedSeconds]
  );

  const onNavigate = useCallback((index: number) => {
    if (index === currentIdxRef.current || index < 0 || index >= questions.length) return;
    finalizeCurrentQuestion("leave");
    setCurrentIdx(index);
    enterQuestion(index);
    persistActivitySnapshot(index);
  }, [enterQuestion, finalizeCurrentQuestion, persistActivitySnapshot, questions.length, setCurrentIdx]);

  // ── Auth guard ────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-brand-50 to-brand-50">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 max-w-md w-full overflow-hidden">
          <div className="bg-gradient-to-r from-brand-600 to-brand-600 px-8 py-8 text-center">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-3">🔐</div>
            <h2 className="text-xl font-extrabold text-white">{title}</h2>
          </div>
          <div className="px-8 py-8 text-center">
            <h3 className="text-xl font-extrabold text-gray-900 mb-2">Vui lòng đăng nhập</h3>
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              Đăng nhập bằng Gmail để tham gia làm bài thi và lưu kết quả của bạn.
            </p>
            <button
              onClick={login}
              className="w-full flex items-center justify-center gap-3 bg-brand-600 hover:bg-brand-700 text-white font-bold py-3.5 rounded-xl transition-all hover:-translate-y-0.5"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" />
                <path d="M1 1h22v22H1z" fill="none" />
              </svg>
              Đăng nhập ngay
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Review mode ───────────────────────────────────────────────────────────
  if (isSubmitted && scoreResult) {
    return (
      <ReviewMode
        title={title}
        questions={questions}
        p1Ans={p1Ans}
        p2Ans={p2Ans}
        p3Ans={p3Ans}
        scoreResult={scoreResult}
      />
    );
  }

  // ── Session check guard ───────────────────────────────────────────────────
  // Blocks ALL rendering until the Firestore IN_PROGRESS query resolves.
  // Without this, the Start screen renders first (manuallyStarted=false),
  // then the effect fires and the component jumps to quiz mode — the student
  // would see a flash of the Start screen and could accidentally reset their exam.
  if (isCheckingSession) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-8 h-8 rounded-full border-4 border-brand-100 border-t-brand-500 animate-spin" />
          <p className="text-sm">Đang khôi phục bài làm…</p>
        </div>
      </div>
    );
  }

  // ── Intro screen ──────────────────────────────────────────────────────────
  if (!started) {
    // In student-preview mode the teacher is never blocked by the retry limit
    const retryLimitReached =
      !isStudentMode &&
      maxRetries > 0 &&
      submissionCount !== null &&
      submissionCount >= maxRetries;

    return (
      <IntroScreen
        title={title}
        questions={questions}
        timing={timing}
        maxRetries={maxRetries}
        submissionCount={submissionCount}
        retryLimitReached={retryLimitReached}
        isPreviewMode={isStudentMode}
        onStart={handleStartExam}
      />
    );
  }

  // ── Quiz UI ───────────────────────────────────────────────────────────────
  const currentQ = questions[currentIdx];

  // Section banner: show when this is the first question of a new section
  const prevType = currentIdx > 0 ? questions[currentIdx - 1].type : null;
  const isFirstOfSection = currentIdx === 0 || prevType !== currentQ.type;
  const sectionMeta = SECTION_META[currentQ.type];

  // Anti-cheat warning modal
  const CheatWarningModal = showCheatWarning ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-danger-950/80 backdrop-blur-sm">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border-2 border-danger-200">
        <div className="w-16 h-16 bg-danger-100 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4">⚠️</div>
        <h2 className="text-2xl font-extrabold text-danger-600 mb-2">Cảnh báo gian lận!</h2>
        <p className="text-gray-700 text-sm leading-relaxed mb-1">
          Bạn đã <strong>rời khỏi màn hình bài thi</strong>.
        </p>
        <p className="text-gray-500 text-sm mb-6">
          Số lần vi phạm: <strong className="text-danger-600 text-lg">{cheatCount}</strong>
        </p>
        <button
          onClick={() => setShowCheatWarning(false)}
          className="w-full bg-danger-600 hover:bg-danger-700 text-white font-bold py-3 rounded-xl transition-colors"
        >
          Tôi hiểu, quay lại làm bài
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 lg:py-10">
      {CheatWarningModal}

      {/* ── Exit-confirmation modal ───────────────────────────────────────────── */}
      {exitConfirmHref && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4">
              🚪
            </div>
            <h2 className="text-xl font-extrabold text-gray-900 mb-2">Thoát khỏi bài thi?</h2>
            <p className="text-gray-600 text-sm leading-relaxed mb-1">
              Bài làm của bạn đến thời điểm này sẽ được{" "}
              <strong className="font-extrabold text-amber-700">ghi nhận và lưu lại</strong>.
            </p>
            <p className="text-gray-400 text-xs mb-6">
              Đã trả lời:{" "}
              <span className="font-bold text-gray-700">{totalAnswered}/{totalQuestions}</span> câu
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setExitConfirmHref(null)}
                disabled={isSavingExit}
                className="flex-1 py-3 rounded-xl font-bold text-sm border-2 border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                ← Tiếp tục làm bài
              </button>
              <button
                onClick={handleExitWithSave}
                disabled={isSavingExit}
                className="flex-1 py-3 rounded-xl font-bold text-sm bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isSavingExit ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                    Đang lưu…
                  </>
                ) : (
                  "Lưu và thoát"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Student-preview mode banner ─────────────────────────────────────── */}
      {isStudentMode && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold">
          <span className="text-lg shrink-0">🎓</span>
          <span>
            Đang ở{" "}
            <strong className="font-extrabold">Chế độ học sinh</strong>.
            Bài làm được lưu và chỉ hiển thị cho{" "}
            <strong className="font-extrabold">giáo viên và admin</strong>.
          </span>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-7">
        <div className="min-w-0">
          {isFirstOfSection && sectionMeta && (
            <div className={`mb-4 rounded-2xl border px-5 py-3.5 ${sectionMeta.colors}`}>
              <p className="text-sm font-extrabold">
                PHẦN {sectionMeta.roman}: {sectionMeta.label}
              </p>
              <p className="mt-1 text-xs opacity-75">{sectionMeta.note}</p>
            </div>
          )}

          <div className="mb-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-blue-600">Bài làm đang diễn ra</p>
                <h1 className="truncate text-xl font-extrabold leading-tight text-slate-900">{title}</h1>
                <p className="mt-2 text-sm text-slate-500">Câu {currentIdx + 1}/{totalQuestions} · Đã trả lời <span className="font-bold text-blue-700">{totalAnswered}/{totalQuestions}</span></p>
              </div>
              <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-extrabold text-blue-700">{Math.round(progress)}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="flex-1 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_45px_-28px_rgba(30,64,175,.35)] sm:p-7 md:p-8">
            <QuestionCard
              key={currentQ.id}
              question={currentQ}
              questionNumber={currentIdx + 1}
              p1Ans={p1Ans}
              p2Ans={p2Ans}
              p3Ans={p3Ans}
              onP1={onP1}
              onP2={onP2}
              onP3={onP3}
            />
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
            <button
              onClick={() => onNavigate(Math.max(0, currentIdx - 1))}
              disabled={currentIdx === 0}
              className={`rounded-xl px-4 py-3 text-sm font-bold transition-all sm:px-5 ${currentIdx === 0 ? "cursor-not-allowed bg-slate-100 text-slate-400" : "border border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700"}`}
            >
              ← Câu trước
            </button>

            {currentIdx < questions.length - 1 ? (
              <button onClick={() => onNavigate(Math.min(questions.length - 1, currentIdx + 1))} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700">
                Câu tiếp →
              </button>
            ) : (
              <button onClick={() => handleSubmit(false)} disabled={submitting} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60">
                {submitting && <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                Nộp bài
              </button>
            )}
          </div>
        </div>

        <aside className="order-first space-y-4 lg:order-last lg:sticky lg:top-20">
          <CountdownTimer totalSeconds={remainingSecondsOverride ?? timing.duration * 60} onExpire={onExpire} />
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-extrabold text-slate-900">Danh sách câu</p>
              <span className="text-xs font-semibold text-slate-400">{totalAnswered}/{totalQuestions}</span>
            </div>
            <QuestionPalette questions={questions} currentIdx={currentIdx} p1Ans={p1Ans} p2Ans={p2Ans} p3Ans={p3Ans} onNavigate={onNavigate} />
            <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-blue-600" />Đang xem</span>
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-emerald-100 ring-1 ring-emerald-300" />Đã trả lời</span>
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-slate-100 ring-1 ring-slate-200" />Chưa làm</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── IntroScreen ───────────────────────────────────────────────────────────────

function IntroScreen({
  title,
  questions,
  timing,
  maxRetries,
  submissionCount,
  retryLimitReached,
  isPreviewMode,
  onStart,
}: {
  title: string;
  questions: ParsedQuestion[];
  timing: TimingConfig;
  maxRetries: number;
  submissionCount: number | null;
  retryLimitReached: boolean;
  isPreviewMode: boolean;
  onStart: () => void;
}) {
  const now = new Date();
  const notYetOpen    = !!(timing.startTime && now < new Date(timing.startTime));
  const alreadyClosed = !!(timing.endTime   && now > new Date(timing.endTime));
  const canStart = !notYetOpen && !alreadyClosed && !retryLimitReached;

  const p1Count = questions.filter((q) => q.type === "multiple_choice").length;
  const p2Count = questions.filter((q) => q.type === "true_false").length;
  const p3Count = questions.filter((q) => q.type === "short_answer").length;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16">
      {/* Preview mode notice — shown above the card */}
      {isPreviewMode && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold">
          <span className="text-lg shrink-0">🎓</span>
          <span>
            <strong className="font-extrabold">Chế độ học sinh</strong> — Bài làm được lưu và
            chỉ hiển thị cho giáo viên và admin (không tính vào thống kê học sinh).
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_70px_-38px_rgba(30,64,175,.5)]">
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-indigo-700 to-violet-700 px-6 py-9 text-white sm:px-9 sm:py-11">
          <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full border-[28px] border-white/10" />
          <div className="relative">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-3xl shadow-inner">📝</div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-blue-100">Sẵn sàng làm bài</p>
            <h1 className="max-w-xl text-2xl font-extrabold leading-tight sm:text-3xl">{title}</h1>
            <p className="mt-3 text-sm text-white/70">{questions.length} câu hỏi · Hoàn thành trong một phiên tập trung</p>
          </div>
        </div>

        <div className="space-y-5 px-5 py-6 sm:px-8 sm:py-8">
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            {[
              { label: "Trắc nghiệm",   count: p1Count, color: "bg-blue-50 border-blue-100 text-blue-700" },
              { label: "Đúng/Sai",      count: p2Count, color: "bg-violet-50 border-violet-100 text-violet-700" },
              { label: "Trả lời ngắn",  count: p3Count, color: "bg-cyan-50 border-cyan-100 text-cyan-700" },
            ].map(({ label, count, color }) => (
              <div key={label} className={`rounded-xl border p-3 ${color}`}>
                <p className="text-2xl font-extrabold">{count}</p>
                <p className="text-xs font-medium opacity-80 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Thời gian làm bài</span>
              <span className="font-bold text-blue-700">{timing.duration} phút</span>
            </div>
            {timing.startTime && (
              <div className="flex justify-between">
                <span className="text-gray-500">Mở đề từ</span>
                <span className="font-semibold text-gray-800">{formatDateTime(timing.startTime)}</span>
              </div>
            )}
            {timing.endTime && (
              <div className="flex justify-between">
                <span className="text-gray-500">Đóng đề lúc</span>
                <span className="font-semibold text-gray-800">{formatDateTime(timing.endTime)}</span>
              </div>
            )}
          </div>

          {notYetOpen && (
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800">
              <span className="text-2xl">🕐</span>
              <div>
                <p className="font-bold text-sm">Đề thi chưa mở</p>
                <p className="text-xs opacity-70 mt-0.5">Mở lúc {formatDateTime(timing.startTime)}</p>
              </div>
            </div>
          )}
          {alreadyClosed && (
            <div className="flex items-center gap-3 p-4 bg-danger-50 border border-danger-200 rounded-2xl text-danger-800">
              <span className="text-2xl">🔒</span>
              <div>
                <p className="font-bold text-sm">Đề thi đã đóng</p>
                <p className="text-xs opacity-70 mt-0.5">Đã đóng lúc {formatDateTime(timing.endTime)}</p>
              </div>
            </div>
          )}
          {retryLimitReached && (
            <div className="flex items-center gap-3 p-4 bg-danger-50 border border-danger-200 rounded-2xl text-danger-800">
              <span className="text-2xl">🚫</span>
              <div>
                <p className="font-bold text-sm">Hết lượt làm bài</p>
                <p className="text-xs opacity-70 mt-0.5">
                  Bạn đã hết số lượt làm bài cho phép (Đã làm {submissionCount}/{maxRetries} lần).
                </p>
              </div>
            </div>
          )}

          <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
            <li>Đồng hồ bắt đầu đếm ngay khi bạn nhấn Bắt đầu.</li>
            <li>Khi hết giờ bài sẽ tự động được nộp.</li>
            <li>Không thể quay lại làm bài sau khi nộp.</li>
            {maxRetries > 0 && (
              <li>Số lượt làm bài: {submissionCount ?? "…"}/{maxRetries}.</li>
            )}
          </ul>

          <button
            onClick={onStart}
            disabled={!canStart}
            className={`w-full py-4 rounded-2xl font-bold text-lg transition-all ${
              canStart
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200 hover:-translate-y-0.5"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            }`}
          >
            {retryLimitReached
              ? `Đã làm ${submissionCount}/${maxRetries} lần (hết lượt)`
              : notYetOpen
              ? "Chưa đến giờ mở đề"
              : alreadyClosed
              ? "Đề thi đã đóng"
              : "Bắt đầu làm bài →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── QuestionCard ──────────────────────────────────────────────────────────────
//
// TASK 2 — Wrapped with React.memo + custom comparator.
//
// The custom comparator checks ONLY whether the currently-displayed question or
// its specific answer changed. This means:
//   • Navigating to a different question → re-render (question.id changed)
//   • Student selects/changes their answer → re-render (answer changed)
//   • Timer ticks (no longer a parent re-render) → NO re-render
//   • Progress bar or palette updates → NO re-render for the card itself
//
// Together with CountdownTimer isolation this eliminates the ~60 unnecessary
// KaTeX/TikZ re-renders per minute that were crashing iOS Safari.

interface CardProps {
  question: ParsedQuestion;
  questionNumber: number;
  p1Ans: Record<number, number>;
  p2Ans: Record<number, (boolean | null)[]>;
  p3Ans: Record<number, string>;
  onP1: (qId: number, optIdx: number) => void;
  onP2: (qId: number, stmtIdx: number, value: boolean) => void;
  onP3: (qId: number, val: string) => void;
}

const QuestionCard = memo(
  function QuestionCard({ question, questionNumber, p1Ans, p2Ans, p3Ans, onP1, onP2, onP3 }: CardProps) {
    const { id, type, questionText, options, tikzCode, tikzImageUrl } = question;

    // ── Memoize ALL LaTeX rendering — only recompute when the question changes ──
    // Without useMemo, every answer click re-runs the full KaTeX pipeline for
    // the question stem AND all options/statements (5 KaTeX calls per click).
    // With useMemo, KaTeX runs exactly ONCE per question, never on answer clicks.
    const renderedQuestion = useMemo(
      () => processLatexText(questionText),
      [questionText]   // question text is stable for the same question
    );
    const renderedOptions = useMemo(
      () => options?.map((opt) => processLatexText(opt)) ?? [],
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [id]             // options are immutably tied to the question id
    );

    const typeBadge =
      type === "multiple_choice"
        ? { label: "Trắc nghiệm",   cls: "bg-blue-50 text-blue-700 ring-1 ring-blue-200" }
        : type === "true_false"
        ? { label: "Đúng / Sai",    cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" }
        : { label: "Trả lời ngắn", cls: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200" };

    return (
      <div>
        <div className="mb-5 flex items-center gap-2">
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">
            Câu {questionNumber}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${typeBadge.cls}`}>
            {typeBadge.label}
          </span>
        </div>

        {tikzCode || tikzImageUrl ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 items-start">
            <div className="text-gray-900 leading-relaxed font-medium">
              {renderedQuestion}
            </div>
            {/* TikzRenderer is React.memo — never re-renders on answer clicks.    */}
            {/* key={currentQ.id} on QuestionCard (parent) ensures a fresh iframe  */}
            {/* is mounted when navigating, so TikZJax WebAssembly is fully freed. */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[150px]">
              {tikzImageUrl ? (
                <img
                  src={tikzImageUrl}
                  alt="Hình vẽ Toán học"
                  className="max-w-full h-auto"
                  loading="lazy"
                />
              ) : (
                <TikzRenderer code={tikzCode as string} />
              )}
            </div>
          </div>
        ) : (
          <div className="text-gray-900 leading-relaxed font-medium mb-6">
            {renderedQuestion}
          </div>
        )}

        {/* P1 — Multiple choice */}
        {type === "multiple_choice" && options && (
          <div className="grid gap-3">
            {options.map((opt, i) => {
              const selected = p1Ans[id] === i;
              return (
                <button
                  key={i}
                  onClick={() => onP1(id, i)}
                  className={`flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
                    selected ? "border-blue-500 bg-blue-50 shadow-sm ring-2 ring-blue-100" : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
                  }`}
                >
                  <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"}`}>
                    {selected && <div className="h-2.5 w-2.5 rounded-full bg-white" />}
                  </div>
                  <span className={`shrink-0 font-extrabold ${selected ? "text-blue-700" : "text-slate-400"}`}>{String.fromCharCode(65 + i)}.</span>
                  <span className={`leading-relaxed ${selected ? "font-medium text-blue-950" : "text-slate-700"}`}>
                    {renderedOptions[i]}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* P2 — True / False table */}
        {type === "true_false" && options && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="w-10 border-r border-slate-200 px-3 py-3 text-center font-bold text-violet-700">Ý</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Phát biểu</th>
                  <th className="w-20 border-l border-slate-200 px-4 py-3 text-center font-bold text-emerald-700">ĐÚNG</th>
                  <th className="w-20 border-l border-slate-200 px-4 py-3 text-center font-bold text-rose-600">SAI</th>
                </tr>
              </thead>
              <tbody>
                {options.map((stmt, i) => {
                  const selected = (p2Ans[id] ?? [])[i];
                  const isDung = selected === true;
                  const isSai  = selected === false;
                  return (
                    <tr key={i} className={`border-t border-slate-100 ${i % 2 === 1 ? "bg-slate-50/70" : "bg-white"}`}>
                      <td className="border-r border-slate-100 px-3 py-3 text-center font-extrabold text-violet-600">
                        {String.fromCharCode(97 + i)}
                      </td>
                      <td className="px-4 py-3 text-gray-800 leading-relaxed">{renderedOptions[i]}</td>
                      <td className="border-l border-slate-100 px-3 py-2 text-center">
                        <button
                          onClick={() => onP2(id, i, true)}
                          className={`w-full rounded-xl py-2 text-sm font-bold transition-all ${isDung ? "bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-200" : "bg-slate-100 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700"}`}
                        >Đúng</button>
                      </td>
                      <td className="border-l border-slate-100 px-3 py-2 text-center">
                        <button
                          onClick={() => onP2(id, i, false)}
                          className={`w-full rounded-xl py-2 text-sm font-bold transition-all ${isSai ? "bg-rose-600 text-white shadow-sm ring-2 ring-rose-200" : "bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-700"}`}
                        >Sai</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* P3 — Short answer */}
        {type === "short_answer" && (
          <ShortAnswerInput key={id} value={p3Ans[id] ?? ""} onChange={(v) => onP3(id, v)} />
        )}
      </div>
    );
  },
  // Custom comparator — re-render ONLY when question or its specific answer changes
  (prev, next) => {
    const id = prev.question.id;
    return (
      prev.question.id      === next.question.id &&
      prev.questionNumber   === next.questionNumber &&
      prev.p1Ans[id]        === next.p1Ans[id] &&
      // Array comparison via JSON (P2 arrays are small: max 4 booleans)
      JSON.stringify(prev.p2Ans[id]) === JSON.stringify(next.p2Ans[id]) &&
      prev.p3Ans[id]        === next.p3Ans[id]
      // onP1/onP2/onP3 are stable useCallback refs — always equal, no need to check
    );
  }
);

// ── QuestionPalette ───────────────────────────────────────────────────────────
//
// Memoized palette of numbered buttons. Custom comparator ensures it only
// re-renders when:
//   • The current active question changes (currentIdx)
//   • An answer for any question changes (affects button colour)
// This prevents 28 buttons from re-rendering on every keystroke / click when
// none of the palette-relevant state actually changed.

interface PaletteProps {
  questions: ParsedQuestion[];
  currentIdx: number;
  p1Ans: Record<number, number>;
  p2Ans: Record<number, (boolean | null)[]>;
  p3Ans: Record<number, string>;
  onNavigate: (i: number) => void;
}

const QuestionPalette = memo(
  function QuestionPalette({ questions, currentIdx, p1Ans, p2Ans, p3Ans, onNavigate }: PaletteProps) {
    return (
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
        {questions.map((q, i) => {
          const answered =
            q.type === "multiple_choice"
              ? p1Ans[q.id] !== undefined
              : q.type === "true_false"
              ? (p2Ans[q.id]?.some((v) => v !== null && v !== undefined) ?? false)
              : (p3Ans[q.id] ?? "").trim() !== "";
          return (
            <button
              key={q.id}
              onClick={() => onNavigate(i)}
              title={`Câu ${i + 1}`}
              className={`h-9 w-9 rounded-xl text-xs font-bold transition-all ${
                i === currentIdx
                  ? "bg-blue-600 text-white shadow-md shadow-blue-200 ring-2 ring-blue-100"
                  : answered
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                  : "bg-slate-100 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-200"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    );
  },
  (prev, next) => {
    // Re-render if active question changed
    if (prev.currentIdx !== next.currentIdx) return false;
    // Re-render if any answer state changed (affects button colour)
    for (const q of prev.questions) {
      const id = q.id;
      if (prev.p1Ans[id] !== next.p1Ans[id]) return false;
      if (JSON.stringify(prev.p2Ans[id]) !== JSON.stringify(next.p2Ans[id])) return false;
      if (prev.p3Ans[id] !== next.p3Ans[id]) return false;
    }
    return true; // nothing changed — skip render
  }
);

// ── ShortAnswerInput ──────────────────────────────────────────────────────────

const NUM_CELLS = 4;
const ALLOWED_RE = /^[0-9,]$/;

function ShortAnswerInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [isNegative, setIsNegative] = useState(() => value.startsWith("-"));
  const [cells, setCells] = useState<string[]>(() => {
    const chars = value.replace(/^-/, "").split("").slice(0, NUM_CELLS);
    return Array.from({ length: NUM_CELLS }, (_, i) => chars[i] ?? "");
  });
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const commit = (next: string[], negative = isNegative) => {
    setCells(next);
    const answer = next.filter(Boolean).join("");
    onChange(answer ? `${negative ? "-" : ""}${answer}` : "");
  };

  const toggleMinus = () => {
    const nextNegative = !isNegative;
    setIsNegative(nextNegative);
    commit(cells, nextNegative);
    refs.current[0]?.focus();
  };

  // Tầng 1: chặn tại nguồn trước khi ký tự vào DOM (iOS Safari)
  const handleBeforeInput = (e: React.FormEvent<HTMLInputElement> & { data?: string }) => {
    const raw = e.data ?? "";
    if (!raw) return;
    // Dấu chấm → cho qua để xử lý thành phẩy ở bước tiếp theo
    if (raw === ".") return;
    if (raw === "-") {
      e.preventDefault();
      toggleMinus();
      return;
    }
    // Mọi ký tự không hợp lệ → chặn hoàn toàn
    if (!ALLOWED_RE.test(raw)) e.preventDefault();
  };

  // Tầng 2: chặn phím vật lý trên desktop + Backspace
  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (cells[idx] !== "") { const next = [...cells]; next[idx] = ""; commit(next); }
      else if (idx > 0) refs.current[idx - 1]?.focus();
      return;
    }
    if (e.key === "-") {
      e.preventDefault();
      toggleMinus();
      return;
    }
    // Cho phép phím điều hướng và phím hệ thống đi qua
    if (e.key.length > 1) return;
    const mapped = e.key === "." ? "," : e.key;
    if (!ALLOWED_RE.test(mapped)) e.preventDefault();
  };

  // Tầng 3: safety net — đổi dấu chấm thành phẩy, lọc ký tự lạ còn sót
  const handleChange = (idx: number, raw: string) => {
    const char = raw.replace(/\./g, ",").replace(/[^0-9,]/g, "").slice(-1);
    const next = [...cells]; next[idx] = char; commit(next);
    if (char && idx < NUM_CELLS - 1) refs.current[idx + 1]?.focus();
  };

  const digits = cells.filter(Boolean).join("");
  const joined = `${isNegative ? "-" : ""}${digits}`;

  return (
    <div className="mt-3 rounded-3xl border border-cyan-100 bg-cyan-50/45 p-4 sm:p-5">
      <p className="mb-3 text-sm font-semibold text-slate-700">Nhập đáp án của bạn</p>

      <button
        type="button"
        onClick={toggleMinus}
        aria-pressed={isNegative}
        className={`mb-4 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${isNegative ? "border-rose-300 bg-rose-50 text-rose-700 ring-2 ring-rose-100" : "border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:text-rose-700"}`}
      >
        <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-lg leading-none ${isNegative ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600"}`}>−</span>
        {isNegative ? "Đang dùng dấu âm" : "Thêm dấu âm"}
      </button>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {cells.map((cell, i) => (
            <input
              key={i}
              ref={(el) => { refs.current[i] = el; }}
              type="text"
              inputMode="decimal"
              pattern="[0-9,]*"
              aria-label={`Ô đáp số ${i + 1}`}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={1}
              value={cell}
              onBeforeInput={(e) => handleBeforeInput(e as React.FormEvent<HTMLInputElement> & { data?: string })}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={`h-14 w-12 rounded-xl border-2 text-center text-xl font-extrabold outline-none transition-all sm:w-14 ${cell ? "border-blue-500 bg-white text-blue-950 ring-2 ring-blue-100" : "border-slate-300 bg-white text-slate-800 hover:border-blue-300"} focus:border-blue-500 focus:ring-4 focus:ring-blue-100`}
            />
          ))}
        </div>
        {digits && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <span className="text-xs font-medium text-emerald-700">Đáp án</span>
            <span className="text-lg font-extrabold leading-none text-emerald-900">{joined}</span>
          </div>
        )}
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Mỗi ô nhập một chữ số hoặc dấu phẩy thập phân.</p>
    </div>
  );
}
