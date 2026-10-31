"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AlertTriangle, ArrowLeft, ArrowRight, Ban, CalendarClock, Check, Clock3, DoorOpen, GraduationCap, Info, Lock, LogIn, Send, Sparkles, Timer } from "lucide-react";
import { ParsedQuestion } from "@/utils/latexParser";
import { processLatexText } from "@/utils/textProcessor";
import TikzRenderer from "@/components/TikzRenderer";
import ReviewMode from "@/components/ReviewMode";
import EssayUploadPanel from "@/components/essay/EssayUploadPanel";
import EssayUploadStage from "@/components/essay/EssayUploadStage";
import { FitCard, FitStage } from "@/components/QuizFit";
import type { ExamStructure } from "@/utils/examStructure";
import { answersToDisplay, answersToOriginal, buildExamVersion } from "@/utils/examVersions";
import { db } from "@/lib/firebase";
import {
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { useStudentMode } from "@/lib/StudentModeContext";
import { resolveUserSettings } from "@/utils/userSettings";
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

interface StudentSubmissionState {
  completedCount: number;
  essayUpload: { id: string; uploadDeadlineMillis: number | null } | null;
  inProgress: {
    id: string;
    answersJson: string;
    examStartTimeMillis: number | null;
    activityLog: ExamActivityEvent[];
    questionTimings: QuestionTimingStat[];
    lastInteractionAtSeconds: number;
    currentQuestionIndex: number;
    examCode: string | null;
  } | null;
}

async function fetchStudentSubmissionState(
  user: { getIdToken: (forceRefresh?: boolean) => Promise<string> },
  examId: string,
): Promise<StudentSubmissionState> {
  const send = async (forceRefresh: boolean) => fetch(
    `/api/submissions?examId=${encodeURIComponent(examId)}`,
    {
      cache: "no-store",
      headers: { Authorization: `Bearer ${await user.getIdToken(forceRefresh)}` },
    },
  );
  let response = await send(false);
  if (response.status === 401) response = await send(true);
  const payload = await response.json().catch(() => null) as (StudentSubmissionState & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error ?? "SUBMISSION_STATE_LOAD_FAILED");
  return payload;
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
    colors: "from-sky-400 to-indigo-500",
  },
  true_false: {
    roman: "II",
    label: "Câu hỏi trắc nghiệm Đúng – Sai",
    note: "Điểm tối đa mỗi câu là 1,0 điểm theo quy chế",
    colors: "from-violet-500 to-fuchsia-500",
  },
  short_answer: {
    roman: "III",
    label: "Câu hỏi trắc nghiệm trả lời ngắn",
    note: "Mỗi câu trả lời đúng được 0,25 hoặc 0,5 điểm tùy cấu hình",
    colors: "from-emerald-400 to-teal-500",
  },
  essay: {
    roman: "IV",
    label: "Tự luận",
    note: "Làm ra giấy, chụp ảnh hoặc tải PDF vào khung bên dưới. Sau khi nộp bài có thêm 5 phút để nộp ảnh.",
    colors: "from-fuchsia-400 to-violet-500",
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
    <div className="flex shrink-0 lg:block">
      <div
        role="timer"
        aria-live={isDanger ? "assertive" : "off"}
        className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 shadow-[var(--shadow-soft)] lg:gap-3 transition-all duration-500 lg:w-full lg:px-4 lg:py-4 ${
          isDanger
            ? "animate-pulse bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-rose-500/30"
            : isWarning
            ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-orange-500/30"
            : "border border-gray-200 bg-white/90 text-gray-900 backdrop-blur-xl"
        }`}
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl lg:h-11 lg:w-11 ${isWarning || isDanger ? "bg-white/20" : "bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/30"}`}>
          <Timer className="h-[18px] w-[18px] lg:h-5 lg:w-5" aria-hidden="true" />
        </span>
        <div className="leading-none">
          <p className={`hidden text-xs font-medium lg:block ${isWarning || isDanger ? "text-white/85" : "text-gray-500"}`}>{isDanger ? "Sắp hết giờ!" : isWarning ? "Còn ít thời gian" : "Thời gian còn lại"}</p>
          <p className="font-mono text-lg font-bold tabular-nums lg:mt-1.5 lg:text-2xl">{formatCountdown(timeLeft)}</p>
        </div>
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
  /** Đề 4 phần: Phần IV tự luận, học sinh nộp ảnh/PDF. */
  structure?: ExamStructure;
  timing: TimingConfig;
  maxRetries?: number;
  /** Cấu hình trộn đề nhiều mã (exam.versioning). */
  versioning?: unknown;
}

export default function QuizClient({
  examId,
  title,
  questions: baseQuestions,
  scoringConfig,
  structure = "p123",
  timing,
  maxRetries = 1,
  versioning,
}: QuizClientProps) {
  const { user, userProfile, login } = useAuth();
  const getIdToken = useCallback(async () => {
    if (!user) throw new Error("UNAUTHENTICATED");
    return user.getIdToken();
  }, [user]);
  const { isStudentMode } = useStudentMode();
  const router = useRouter();

  // ── Mã đề ──────────────────────────────────────────────────────────────────
  // Máy chủ giao mã khi bắt đầu. Mọi state đáp án trong component theo thứ tự
  // của bản đề này; chỉ đổi về thứ tự gốc khi gửi lên máy chủ.
  const [examCode, setExamCode] = useState<string | null>(null);
  const version = useMemo(() => buildExamVersion(baseQuestions, versioning, examCode, examId), [baseQuestions, versioning, examCode, examId]);
  const questions = version.questions;
  const versionOrders = version.orders;
  // Nháp trên máy tách theo mã để không lẫn thứ tự giữa hai lượt làm.
  const draftId = version.code ? `${examId}~${version.code}` : examId;

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
  // Bản state của id bài làm để khung nộp tự luận render được (ref không đọc trong render).
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  // Đã nộp Phần I–III của đề tự luận: chuyển sang bước nộp ảnh, không hiện điểm.
  const [essayStage, setEssayStage] = useState<{ submissionId: string; deadlineMillis: number | null } | null>(null);
  const [essayFileCount, setEssayFileCount] = useState(0);

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
  const [submissionCount, setSubmissionCount] = useState<number | null>(null);
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
        const state = await fetchStudentSubmissionState(user, examId);
        setSubmissionCount(state.completedCount);
        if (state.essayUpload) {
          setEssayStage({ submissionId: state.essayUpload.id, deadlineMillis: state.essayUpload.uploadDeadlineMillis });
          return;
        }
        const session = state.inProgress;

        if (session) {
          inProgressDocIdRef.current = session.id;
          setSubmissionId(session.id);
          setExamCode(session.examCode ?? null);
          const sessionVersion = buildExamVersion(baseQuestions, versioning, session.examCode, examId);

          // Hydrate saved answers from localStorage draft
          const draft = loadDraft(sessionVersion.code ? `${examId}~${sessionVersion.code}` : examId, user.uid);
          if (draft) {
            if (Object.keys(draft.p1Ans).length) setP1Ans(draft.p1Ans);
            if (Object.keys(draft.p2Ans).length) setP2Ans(draft.p2Ans);
            if (Object.keys(draft.p3Ans).length) setP3Ans(draft.p3Ans);
          } else if (typeof session.answersJson === "string") {
            try {
              const parsed = JSON.parse(session.answersJson);
              const stored = answersToDisplay({ p1Ans: parsed.p1Ans ?? {}, p2Ans: parsed.p2Ans ?? {}, p3Ans: parsed.p3Ans ?? {} }, sessionVersion.orders);
              setP1Ans(stored.p1Ans);
              setP2Ans(stored.p2Ans);
              setP3Ans(stored.p3Ans);
            } catch {
              // Bài cũ hoặc dữ liệu nháp lỗi: tiếp tục với đáp án rỗng.
            }
          }

          // Calculate remaining seconds from the authoritative server timestamp
          const startDate = session.examStartTimeMillis
            ? new Date(session.examStartTimeMillis)
            : null;
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

          activityLogRef.current = Array.isArray(session.activityLog) ? session.activityLog : [];
          const storedTimings = Array.isArray(session.questionTimings) ? session.questionTimings : [];
          questionTimingsRef.current = new Map(storedTimings.map((item) => [item.questionId, item]));
          lastInteractionAtSecondsRef.current = Number(session.lastInteractionAtSeconds ?? 0);
          const restoredIndex = Math.min(
            Math.max(0, Number(session.currentQuestionIndex ?? 0)),
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
        setSubmissionCount(0);
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
      answersJson: JSON.stringify(answersToOriginal({
        p1Ans: p1AnsRef.current,
        p2Ans: p2AnsRef.current,
        p3Ans: p3AnsRef.current,
      }, versionOrders)),
      lastActivityAt: serverTimestamp(),
    }).catch((error) => console.warn("Không thể lưu nhật ký làm bài:", error));
  }, [getActivitySummary, versionOrders]);

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
      saveDraft(draftId, uid, { p1Ans: p1, p2Ans: p2, p3Ans: p3 });
  }, [user?.uid, draftId]);

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
    // Create the IN_PROGRESS record through the authenticated server API so
    // session tracking does not depend on client Firestore indexes or rules.
    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          action: "start",
          examId,
          studentName: userProfile?.fullName ?? user.displayName ?? "Khách",
          studentAvatar: user.photoURL ?? "",
          isTeacherPreview: isStudentMode,
        }),
      });
      const payload = await response.json().catch(() => null) as { id?: string; error?: string; examCode?: string | null } | null;
      if (!response.ok || !payload?.id) throw new Error(payload?.error ?? "SESSION_START_FAILED");
      inProgressDocIdRef.current = payload.id;
      setSubmissionId(payload.id);
      setExamCode(payload.examCode ?? null);
    } catch (err) {
      console.error("Failed to write IN_PROGRESS record:", err);
      window.alert("Chưa thể tạo phiên làm bài trên máy chủ. Vui lòng kiểm tra mạng và thử lại.");
      return;
    }
    startSession(); // sessionStorage fallback for timer reference
    setManuallyStarted(true);
  }, [isStudentMode, examId, user, userProfile, startSession, enterQuestion, timing]);

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
  }, [started, isSubmitted, isStudentMode, requestWakeLock]);

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
  const hasEssay = structure === "p1234" && questions.some((q) => q.type === "essay");
  const essayCount = hasEssay ? questions.filter((q) => q.type === "essay").length : 0;

  const p2AnsweredCount = Object.values(p2Ans).filter((arr) =>
    arr.some((v) => v !== null && v !== undefined)
  ).length;

  const totalAnswered =
    Object.keys(p1Ans).length +
    p2AnsweredCount +
    Object.keys(p3Ans).filter((k) => (p3Ans[Number(k)] ?? "").trim() !== "").length +
    (essayFileCount > 0 ? essayCount : 0);
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
          answersJson: JSON.stringify(answersToOriginal({ p1Ans, p2Ans, p3Ans }, versionOrders)),
          cheatCount: cheatCountRef.current,
          ...activitySummary,
          ...(isStudentMode ? { isTeacherPreview: true } : {}),
        };

        const token = await user?.getIdToken();
        if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
        const response = await fetch("/api/submissions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            examId,
            submissionId: inProgressDocIdRef.current,
            studentName: submissionPayload.studentName,
            studentAvatar: submissionPayload.studentAvatar,
            answersJson: submissionPayload.answersJson,
            cheatCount: submissionPayload.cheatCount,
            activityLog: activitySummary.activityLog,
            questionTimings: activitySummary.questionTimings,
            totalElapsedSeconds: activitySummary.totalElapsedSeconds,
            idleBeforeSubmitSeconds: activitySummary.idleBeforeSubmitSeconds,
            lastInteractionAtSeconds: activitySummary.lastInteractionAtSeconds,
            isTeacherPreview: isStudentMode,
          }),
        });
        const saved = await response.json().catch(() => null) as { id?: string; error?: string; essayUpload?: { uploadDeadlineMillis: number | null } } | null;
        if (!response.ok || !saved?.id) {
          throw new Error(saved?.error ?? "Không thể lưu bài nộp.");
        }
        savedSubmissionId = saved.id;
        if (saved.essayUpload) {
          // Đề có tự luận: không gửi email, không hiện điểm; còn 5 phút nộp ảnh.
          if (user?.uid) clearDraft(draftId, user.uid);
          clearSession();
          setEssayStage({ submissionId: saved.id, deadlineMillis: saved.essayUpload.uploadDeadlineMillis });
          setIsSubmitted(true);
          setSubmitting(false);
          return;
        }

        // Clear persistence artifacts — draft and sessionStorage backup
        if (user?.uid) clearDraft(draftId, user.uid);
        clearSession();
      } catch (err) {
        console.error("Lỗi lưu bài nộp:", err);
        window.alert("Không thể lưu bài nộp lên máy chủ. Đáp án vẫn được giữ trên thiết bị; vui lòng kiểm tra mạng và bấm Nộp bài lại.");
        setSubmitting(false);
        return;
      }

      // Send result email — skip for teacher preview mode
      // Học sinh có thể tắt email kết quả ở trang Tài khoản.
      const wantsResultEmail = resolveUserSettings(userProfile?.settings).resultEmail;
      if (!isStudentMode && wantsResultEmail && user?.email && user.email !== "—") {
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
      draftId, versionOrders,
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
        answersJson: JSON.stringify(answersToOriginal({ p1Ans, p2Ans, p3Ans }, versionOrders)),
        cheatCount: cheatCountRef.current,
        ...activitySummary,
        exitedEarly: true, // flag: student left before finishing all questions
        ...(isStudentMode ? { isTeacherPreview: true } : {}),
      };
      const token = await user?.getIdToken();
      if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          examId,
          submissionId: inProgressDocIdRef.current,
          studentName: submissionPayload.studentName,
          studentAvatar: submissionPayload.studentAvatar,
          answersJson: submissionPayload.answersJson,
          cheatCount: submissionPayload.cheatCount,
          activityLog: activitySummary.activityLog,
          questionTimings: activitySummary.questionTimings,
          totalElapsedSeconds: activitySummary.totalElapsedSeconds,
          idleBeforeSubmitSeconds: activitySummary.idleBeforeSubmitSeconds,
          lastInteractionAtSeconds: activitySummary.lastInteractionAtSeconds,
          isTeacherPreview: isStudentMode,
          exitedEarly: true,
        }),
      });
      if (!response.ok) throw new Error("Không thể lưu bài nộp khi thoát.");
      if (user?.uid) clearDraft(draftId, user.uid);
      clearSession();
    } catch (err) {
      console.error("Lỗi lưu bài khi thoát:", err);
      window.alert("Chưa thể lưu bài lên máy chủ. Vui lòng kiểm tra mạng và thử lại trước khi rời trang.");
      isExitingRef.current = false;
      setIsSavingExit(false);
      return;
    }

    const href = exitConfirmHref;
    setExitConfirmHref(null);
    // Navigate: back-button exits go to home, link clicks go to the target href
    router.push(href === "__back__" ? "/" : href);
  }, [
    draftId, versionOrders,
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
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="result-pop w-full max-w-md overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-[var(--shadow-lift)]">
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 px-8 py-9 text-center text-white">
            <div aria-hidden="true" className="edu-dots absolute inset-0 opacity-50 mix-blend-overlay" />
            <span className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur"><Lock size={26} aria-hidden="true" /></span>
            <h2 className="relative font-display text-xl font-extrabold">{title}</h2>
          </div>
          <div className="px-8 py-8 text-center">
            <h3 className="mb-2 font-display text-xl font-bold text-gray-900">Vui lòng đăng nhập</h3>
            <p className="mb-6 text-sm leading-relaxed text-gray-500">
              Đăng nhập bằng Gmail để tham gia làm bài thi và lưu kết quả của bạn.
            </p>
            <button onClick={login} className="edu-btn flex min-h-12 w-full items-center justify-center gap-2.5 rounded-2xl font-semibold text-white">
              <LogIn size={18} aria-hidden="true" />
              Đăng nhập ngay
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Essay upload stage: Phần I–III đã khóa, chỉ còn nộp ảnh tự luận ──────
  if (essayStage) {
    return (
      <EssayUploadStage
        title={title}
        submissionId={essayStage.submissionId}
        deadlineMillis={essayStage.deadlineMillis}
        getToken={getIdToken}
      />
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
        <div role="status" className="flex flex-col items-center gap-4 text-gray-500">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-indigo-500 border-r-violet-500" />
          </div>
          <p className="text-sm font-medium">Đang khôi phục bài làm…</p>
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

  // Anti-cheat warning modal
  const CheatWarningModal = showCheatWarning ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-rose-950/70 p-4 backdrop-blur-md">
      <div role="alertdialog" aria-modal="true" aria-labelledby="cheat-title" className="result-pop w-full max-w-sm rounded-[2rem] border border-rose-100 bg-white p-8 text-center shadow-2xl">
        <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/30"><AlertTriangle size={30} aria-hidden="true" /></span>
        <h2 id="cheat-title" className="mb-2 font-display text-2xl font-extrabold text-gray-900">Bạn vừa rời màn hình</h2>
        <p className="mb-1 text-sm leading-relaxed text-gray-600">
          Hệ thống đã ghi nhận bạn <strong>rời khỏi màn hình bài thi</strong>.
        </p>
        <p className="mb-6 text-sm text-gray-500">
          Số lần vi phạm: <strong className="text-lg text-rose-600">{cheatCount}</strong>
        </p>
        <button
          onClick={() => setShowCheatWarning(false)}
          className="min-h-12 w-full rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:-translate-y-0.5"
        >
          Tôi hiểu, quay lại làm bài
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-3 py-3 sm:px-5 lg:py-4">
      {CheatWarningModal}

      {/* ── Exit-confirmation modal ───────────────────────────────────────────── */}
      {exitConfirmHref && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-indigo-950/50 p-4 backdrop-blur-md">
          <div role="alertdialog" aria-modal="true" aria-labelledby="exit-title" className="result-pop w-full max-w-sm rounded-[2rem] border border-gray-100 bg-white p-8 text-center shadow-2xl">
            <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-orange-500/30">
              <DoorOpen size={30} aria-hidden="true" />
            </span>
            <h2 id="exit-title" className="mb-2 font-display text-xl font-extrabold text-gray-900">Thoát khỏi bài thi?</h2>
            <p className="mb-1 text-sm leading-relaxed text-gray-600">
              Bài làm của bạn đến thời điểm này sẽ được{" "}
              <strong className="font-bold text-orange-600">ghi nhận và lưu lại</strong>.
            </p>
            <p className="mb-6 text-xs text-gray-400">
              Đã trả lời:{" "}
              <span className="font-bold text-gray-700">{totalAnswered}/{totalQuestions}</span> câu
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setExitConfirmHref(null)}
                disabled={isSavingExit}
                className="min-h-12 flex-1 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Tiếp tục làm bài
              </button>
              <button
                onClick={handleExitWithSave}
                disabled={isSavingExit}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition disabled:opacity-60"
              >
                {isSavingExit ? (
                  <>
                    <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent" />
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

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-7">
        <FitStage className="flex min-w-0 flex-col">
          <div className="mb-3 shrink-0 rounded-2xl border border-gray-200 bg-white/90 px-3.5 py-2.5 shadow-[var(--shadow-soft)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-display text-base font-bold leading-tight text-gray-900 sm:text-lg" title={title}>{title}</h1>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 sm:text-[13px]">
                  <span className="hidden items-center gap-1.5 font-semibold text-brand-600 sm:inline-flex"><span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500" /></span>Đang làm bài</span>
                  <span aria-hidden="true" className="hidden text-gray-300 sm:inline">·</span>
                  <span>Câu <span className="font-semibold text-gray-800">{currentIdx + 1}</span>/{totalQuestions}</span>
                  <span aria-hidden="true" className="text-gray-300">·</span>
                  <span>Đã trả lời <span className="font-semibold text-brand-700">{totalAnswered}/{totalQuestions}</span></span>
                  {version.code && <span className="inline-flex items-center rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-700 ring-1 ring-brand-100">Mã đề {version.code}</span>}
                  {isStudentMode && <span title="Bài làm được lưu và chỉ hiển thị cho giáo viên và admin." className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200"><GraduationCap size={12} aria-hidden="true" />Chế độ học sinh</span>}
                </p>
              </div>
              <div className="relative hidden h-11 w-11 shrink-0 sm:block" aria-label={`Hoàn thành ${Math.round(progress)}%`}>
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#EEF2FF" strokeWidth="4" />
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="url(#quiz-progress-g)" strokeWidth="4" strokeLinecap="round" strokeDasharray="97.4" strokeDashoffset={97.4 * (1 - progress / 100)} className="transition-[stroke-dashoffset] duration-700" />
                  <defs><linearGradient id="quiz-progress-g" x1="0" x2="1"><stop offset="0" stopColor="#4F46E5" /><stop offset="1" stopColor="#A855F7" /></linearGradient></defs>
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-800">{Math.round(progress)}%</span>
              </div>
            </div>
            <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-all duration-700" style={{ width: `${((currentIdx + 1) / Math.max(1, totalQuestions)) * 100}%` }} />
            </div>
          </div>

          <FitCard key={currentQ.id} className="quiz-question-shell quiz-option-enter min-h-0 flex-1 overflow-y-auto rounded-[1.75rem] border border-gray-200 bg-white p-4 shadow-[var(--shadow-soft)] sm:p-5 md:px-7 md:py-6">
            <QuestionCard
              key={currentQ.id}
              question={currentQ}
              questionNumber={currentIdx + 1}
              showPartNote={isFirstOfSection}
              p1Ans={p1Ans}
              p2Ans={p2Ans}
              p3Ans={p3Ans}
              onP1={onP1}
              onP2={onP2}
              onP3={onP3}
            />
            {currentQ.type === "essay" && hasEssay && (
              <div className="mt-5">
                <EssayUploadPanel submissionId={submissionId} getToken={getIdToken} onFilesChange={setEssayFileCount} />
              </div>
            )}
          </FitCard>

          <div className="sticky bottom-3 z-30 mt-3 flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white/90 p-1.5 shadow-[var(--shadow-lift)] backdrop-blur-xl lg:static lg:shadow-[var(--shadow-soft)]">
            <button
              onClick={() => onNavigate(Math.max(0, currentIdx - 1))}
              disabled={currentIdx === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent sm:px-5"
            >
              <ArrowLeft size={18} aria-hidden="true" /><span className="hidden sm:inline">Câu trước</span>
            </button>

            <span className="text-sm font-semibold text-gray-500 lg:hidden">{currentIdx + 1} / {totalQuestions}</span>

            {currentIdx < questions.length - 1 ? (
              <button onClick={() => onNavigate(Math.min(questions.length - 1, currentIdx + 1))} className="edu-btn inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white">
                Câu tiếp <ArrowRight size={18} aria-hidden="true" />
              </button>
            ) : (
              <button onClick={() => handleSubmit(false)} disabled={submitting} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 disabled:opacity-60">
                {submitting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Send size={17} aria-hidden="true" />}
                Nộp bài
              </button>
            )}
          </div>
        </FitStage>

        {/* Điện thoại: đồng hồ và dãy số câu chung một hàng để dành chỗ cho đề. */}
        <aside className="order-first flex min-w-0 items-stretch gap-2 lg:sticky lg:top-20 lg:order-last lg:block lg:space-y-4">
          <CountdownTimer totalSeconds={remainingSecondsOverride ?? timing.duration * 60} onExpire={onExpire} />
          <div className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-[var(--shadow-soft)] lg:rounded-3xl lg:p-4">
            <div className="mb-3 hidden items-center justify-between lg:flex">
              <p className="text-sm font-bold text-gray-900">Danh sách câu</p>
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{totalAnswered}/{totalQuestions}</span>
            </div>
            <QuestionPalette questions={questions} currentIdx={currentIdx} p1Ans={p1Ans} p2Ans={p2Ans} p3Ans={p3Ans} essayDone={essayFileCount > 0} onNavigate={onNavigate} />
            <div className="mt-4 hidden flex-wrap gap-x-3 gap-y-2 border-t border-gray-100 pt-3 text-xs text-gray-500 lg:flex">
              <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-gradient-to-br from-indigo-500 to-violet-500" />Đang xem</span>
              <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-brand-100 ring-1 ring-brand-200" />Đã làm</span>
              <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-white ring-1 ring-gray-200" />Chưa làm</span>
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
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      {/* Preview mode notice — shown above the card */}
      {isPreviewMode && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          <GraduationCap size={18} className="shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-bold">Chế độ học sinh</strong> — Bài làm được lưu và
            chỉ hiển thị cho giáo viên và admin (không tính vào thống kê học sinh).
          </span>
        </div>
      )}

      <div className="result-pop overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-[var(--shadow-lift)]">
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 px-6 py-9 text-white sm:px-9 sm:py-11">
          <div aria-hidden="true" className="edu-dots absolute inset-0 opacity-50 mix-blend-overlay" />
          <div aria-hidden="true" className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
          <span aria-hidden="true" className="edu-float absolute bottom-4 right-8 font-display text-7xl font-extrabold text-white/10">∫</span>
          <span aria-hidden="true" className="edu-float-slow absolute right-28 top-6 font-display text-4xl font-extrabold text-white/10">π</span>
          <div className="relative">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/25 backdrop-blur"><Sparkles size={14} aria-hidden="true" />Sẵn sàng làm bài</span>
            <h1 className="max-w-xl font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{title}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/80">
              <span className="inline-flex items-center gap-1.5"><Info size={15} aria-hidden="true" />{questions.length} câu hỏi</span>
              <span className="inline-flex items-center gap-1.5"><Clock3 size={15} aria-hidden="true" />{timing.duration} phút</span>
            </p>
          </div>
        </div>

        <div className="space-y-5 px-5 py-6 sm:px-8 sm:py-8">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: "Trắc nghiệm",  count: p1Count, gradient: "from-sky-400 to-indigo-500" },
              { label: "Đúng/Sai",     count: p2Count, gradient: "from-violet-500 to-fuchsia-500" },
              { label: "Trả lời ngắn", count: p3Count, gradient: "from-emerald-400 to-teal-500" },
            ].map(({ label, count, gradient }) => (
              <div key={label} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-3 sm:p-4">
                <p className={`bg-gradient-to-br bg-clip-text font-display text-3xl font-extrabold text-transparent ${gradient}`}>{count}</p>
                <p className="mt-0.5 text-xs font-medium text-gray-500">{label}</p>
              </div>
            ))}
          </div>

          {(timing.startTime || timing.endTime) && (
            <div className="space-y-2 rounded-2xl border border-gray-200 px-5 py-4 text-sm">
              {timing.startTime && (
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Mở đề từ</span>
                  <span className="font-semibold text-gray-800">{formatDateTime(timing.startTime)}</span>
                </div>
              )}
              {timing.endTime && (
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Đóng đề lúc</span>
                  <span className="font-semibold text-gray-800">{formatDateTime(timing.endTime)}</span>
                </div>
              )}
            </div>
          )}

          {notYetOpen && (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
              <CalendarClock size={22} className="shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold">Đề thi chưa mở</p>
                <p className="mt-0.5 text-xs opacity-80">Mở lúc {formatDateTime(timing.startTime)}</p>
              </div>
            </div>
          )}
          {alreadyClosed && (
            <div className="flex items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-danger-800">
              <Lock size={22} className="shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold">Đề thi đã đóng</p>
                <p className="mt-0.5 text-xs opacity-80">Đã đóng lúc {formatDateTime(timing.endTime)}</p>
              </div>
            </div>
          )}
          {retryLimitReached && (
            <div className="flex items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-danger-800">
              <Ban size={22} className="shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold">Hết lượt làm bài</p>
                <p className="mt-0.5 text-xs opacity-80">
                  Bạn đã hết số lượt làm bài cho phép (Đã làm {submissionCount}/{maxRetries} lần).
                </p>
              </div>
            </div>
          )}

          <ul className="space-y-2.5 text-sm text-gray-600">
            {[
              "Đồng hồ bắt đầu đếm ngay khi bạn nhấn Bắt đầu.",
              "Khi hết giờ bài sẽ tự động được nộp.",
              "Không thể quay lại làm bài sau khi nộp.",
              ...(maxRetries > 0 ? [`Số lượt làm bài: ${submissionCount ?? "…"}/${maxRetries}.`] : []),
            ].map((rule) => (
              <li key={rule} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Check size={12} strokeWidth={3} aria-hidden="true" /></span>
                {rule}
              </li>
            ))}
          </ul>

          <button
            onClick={onStart}
            disabled={!canStart}
            className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl text-lg font-semibold transition-all ${
              canStart ? "edu-btn text-white" : "cursor-not-allowed bg-gray-100 text-gray-400"
            }`}
          >
            {retryLimitReached
              ? `Đã làm ${submissionCount}/${maxRetries} lần (hết lượt)`
              : notYetOpen
              ? "Chưa đến giờ mở đề"
              : alreadyClosed
              ? "Đề thi đã đóng"
              : <>Bắt đầu làm bài <ArrowRight size={20} aria-hidden="true" /></>}
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
  /** Câu đầu của mỗi phần: hiện cách tính điểm của phần đó. */
  showPartNote?: boolean;
}

/**
 * Số cột cho 4 phương án theo độ dài chữ hiển thị (bỏ lệnh LaTeX), như đề in:
 * đáp án ngắn xếp một hàng, vừa thì 2 cột, dài hoặc có hình/bảng thì mỗi dòng một phương án.
 */
function optionGridClass(options: string[]): string {
  if (options.some((opt) => /\\begin|\[\[EXAM_INLINE_IMAGE|\$\$|\\\[/.test(opt))) return "grid-cols-1";
  const visible = (opt: string) => opt
    .replace(/\\(?:d?frac|tfrac)/g, "")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[{}$^_\\]/g, "")
    .replace(/\s+/g, " ")
    .trim().length;
  const longest = Math.max(0, ...options.map(visible));
  if (longest <= 14) return "grid-cols-2 lg:grid-cols-4";
  if (longest <= 34) return "grid-cols-1 sm:grid-cols-2";
  return "grid-cols-1";
}

const QuestionCard = memo(
  function QuestionCard({ question, questionNumber, p1Ans, p2Ans, p3Ans, onP1, onP2, onP3, showPartNote = false }: CardProps) {
    const { id, type, questionText, options, tikzCode, tikzImageUrl, imageUrls } = question;

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
        ? { label: "Trắc nghiệm",   cls: "bg-sky-50 text-sky-700 ring-1 ring-sky-200" }
        : type === "true_false"
        ? { label: "Đúng / Sai",    cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" }
        : type === "essay"
        ? { label: "Tự luận",      cls: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200" }
        : { label: "Trả lời ngắn", cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" };
    const part = SECTION_META[type];
    const optionGrid = type === "multiple_choice" && options ? optionGridClass(options) : "";

    return (
      <div className="exam-reading">
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 font-sans">
          <span className="rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1 text-xs font-bold text-white shadow-sm shadow-indigo-500/30">
            Câu {questionNumber}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${typeBadge.cls}`} title={part ? `Phần ${part.roman}: ${part.label}. ${part.note}` : undefined}>
            {part && <span className="font-bold">Phần {part.roman} ·</span>}{typeBadge.label}
          </span>
          {showPartNote && part && <span className="hidden text-xs text-gray-500 md:inline">{part.note}</span>}
        </div>

        {tikzCode || tikzImageUrl ? (
          <div className="exam-question-visual mb-3 grid grid-cols-1 items-center gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(15rem,.9fr)]">
            <div className="text-gray-900">
              {renderedQuestion}
            </div>
            {/* TikzRenderer is React.memo — never re-renders on answer clicks.    */}
            {/* key={currentQ.id} on QuestionCard (parent) ensures a fresh iframe  */}
            {/* is mounted when navigating, so TikZJax WebAssembly is fully freed. */}
            <div className="exam-figure flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-white p-2">
              {tikzImageUrl ? (
                <Image
                  src={tikzImageUrl}
                  alt="Hình vẽ Toán học"
                  width={960}
                  height={640}
                  unoptimized
                  className="h-auto w-full object-contain"
                />
              ) : (
                <TikzRenderer code={tikzCode as string} />
              )}
            </div>
          </div>
        ) : (
          <div className="mb-3 text-gray-900">
            {renderedQuestion}
          </div>
        )}

        {imageUrls && imageUrls.length > 0 && (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            {imageUrls.map((url, index) => (
              <div key={`${url}-${index}`} className="exam-figure flex min-h-28 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-white p-2">
                <Image src={url} alt={`Hình minh họa câu ${questionNumber}.${index + 1}`} width={960} height={640} unoptimized className="h-auto w-full object-contain" />
              </div>
            ))}
          </div>
        )}

        {/* P1 — Multiple choice */}
        {type === "multiple_choice" && options && (
          <div className={`grid gap-2.5 ${optionGrid}`} role="radiogroup" aria-label={`Phương án câu ${questionNumber}`}>
            {options.map((opt, i) => {
              const selected = p1Ans[id] === i;
              return (
                <button
                  key={i}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onP1(id, i)}
                  className={`group/opt relative flex w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition-all duration-200 active:scale-[.99] sm:px-4 ${
                    selected
                      ? "border-indigo-500 bg-gradient-to-r from-indigo-50 to-violet-50 shadow-md shadow-indigo-500/10"
                      : "border-gray-200 bg-white hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-500/5"
                  }`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-sans text-sm font-bold transition-all duration-200 ${selected ? "scale-105 bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/30" : "bg-gray-100 text-gray-500 group-hover/opt:bg-indigo-50 group-hover/opt:text-indigo-600"}`}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className={`flex-1 leading-relaxed ${selected ? "font-medium text-indigo-950" : "text-gray-700"}`}>
                    {renderedOptions[i]}
                  </span>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${selected ? "scale-100 bg-indigo-500 text-white opacity-100" : "scale-50 opacity-0"}`} aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
                </button>
              );
            })}
          </div>
        )}

        {/* P2 — True / False statements */}
        {type === "true_false" && options && (
          <div className="grid gap-2.5">
            {options.map((stmt, i) => {
              const selected = (p2Ans[id] ?? [])[i];
              const isDung = selected === true;
              const isSai  = selected === false;
              return (
                <div key={i} className={`flex flex-row items-center gap-2 rounded-2xl border-2 px-2.5 py-2 transition-colors sm:gap-3 sm:px-4 ${isDung ? "border-emerald-200 bg-emerald-50/40" : isSai ? "border-rose-200 bg-rose-50/40" : "border-gray-200 bg-white"}`}>
                  <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 font-sans text-sm font-bold text-violet-600">{String.fromCharCode(97 + i)}</span>
                    <div className="min-w-0 flex-1 pt-px leading-relaxed text-gray-800">{renderedOptions[i]}</div>
                  </div>
                  <div className="exam-true-false grid w-[6.75rem] shrink-0 grid-cols-2 gap-0.5 rounded-xl bg-gray-100 p-0.5 font-sans sm:w-40 sm:gap-1" role="radiogroup" aria-label={`Ý ${String.fromCharCode(97 + i)}`}>
                    <button
                      role="radio"
                      aria-checked={isDung}
                      onClick={() => onP2(id, i, true)}
                      className={`inline-flex min-h-9 items-center justify-center gap-1 rounded-lg text-sm font-semibold transition-all duration-200 ${isDung ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/30" : "text-gray-500 hover:bg-white hover:text-emerald-700"}`}
                    >{isDung && <Check size={14} strokeWidth={3} aria-hidden="true" />}Đúng</button>
                    <button
                      role="radio"
                      aria-checked={isSai}
                      onClick={() => onP2(id, i, false)}
                      className={`inline-flex min-h-9 items-center justify-center gap-1 rounded-lg text-sm font-semibold transition-all duration-200 ${isSai ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md shadow-rose-500/30" : "text-gray-500 hover:bg-white hover:text-rose-700"}`}
                    >Sai</button>
                  </div>
                </div>
              );
            })}
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
  essayDone: boolean;
  onNavigate: (i: number) => void;
}

const QuestionPalette = memo(
  function QuestionPalette({ questions, currentIdx, p1Ans, p2Ans, p3Ans, essayDone, onNavigate }: PaletteProps) {
    return (
      <div className="no-scrollbar flex max-w-full gap-1.5 overflow-x-auto lg:grid lg:grid-cols-5 lg:gap-2 lg:overflow-visible lg:pb-1">
        {questions.map((q, i) => {
          const answered =
            q.type === "multiple_choice"
              ? p1Ans[q.id] !== undefined
              : q.type === "true_false"
              ? (p2Ans[q.id]?.some((v) => v !== null && v !== undefined) ?? false)
              : q.type === "essay"
              ? essayDone
              : (p3Ans[q.id] ?? "").trim() !== "";
          return (
            <button
              key={q.id}
              onClick={() => onNavigate(i)}
              title={`Câu ${i + 1}`}
              aria-current={i === currentIdx ? "step" : undefined}
              className={`h-10 w-10 shrink-0 rounded-xl text-sm font-semibold transition-all duration-200 lg:w-full ${
                i === currentIdx
                  ? "scale-105 bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/30"
                  : answered
                  ? "bg-brand-100 text-brand-700 ring-1 ring-brand-200 hover:bg-brand-200"
                  : "bg-white text-gray-500 ring-1 ring-gray-200 hover:-translate-y-0.5 hover:text-brand-600 hover:ring-brand-200"
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
const ALLOWED_RE = /^[0-9,-]$/;

function ShortAnswerInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [cells, setCells] = useState<string[]>(() => {
    const chars = value
      .replace(/\./g, ",")
      .split("")
      .filter((char) => ALLOWED_RE.test(char))
      .slice(0, NUM_CELLS);
    return Array.from({ length: NUM_CELLS }, (_, i) => chars[i] ?? "");
  });
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const commit = (next: string[]) => {
    setCells(next);
    const answer = next.filter(Boolean).join("");
    onChange(answer);
  };

  const toggleMinus = () => {
    const compact = cells.filter(Boolean).filter((char) => char !== "-");
    const next = cells[0] === "-" ? compact : ["-", ...compact].slice(0, NUM_CELLS);
    commit(Array.from({ length: NUM_CELLS }, (_, index) => next[index] ?? ""));
    refs.current[cells[0] === "-" ? 0 : Math.min(1, NUM_CELLS - 1)]?.focus();
  };

  const hasDigit = cells.some((char) => /\d/.test(char));
  const lastFilledIndex = cells.reduce((last, char, index) => char ? index : last, -1);
  const canInsertComma = hasDigit && !cells.includes(",") && lastFilledIndex < NUM_CELLS - 1;

  const insertComma = () => {
    if (!canInsertComma) return;
    const next = [...cells];
    const index = lastFilledIndex + 1;
    next[index] = ",";
    commit(next);
    refs.current[Math.min(index + 1, NUM_CELLS - 1)]?.focus();
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
    if (mapped === "," && (!cells.slice(0, idx).some((char) => /\d/.test(char)) || cells.includes(","))) {
      e.preventDefault();
      return;
    }
    if (!ALLOWED_RE.test(mapped)) e.preventDefault();
  };

  // Tầng 3: safety net — đổi dấu chấm thành phẩy, lọc ký tự lạ còn sót
  const handleChange = (idx: number, raw: string) => {
    let char = raw.replace(/\./g, ",").replace(/[^0-9,-]/g, "").slice(-1);
    if (char === "-") {
      toggleMinus();
      return;
    }
    if (char === "," && (!cells.slice(0, idx).some((item) => /\d/.test(item)) || cells.includes(","))) {
      char = "";
    }
    const next = [...cells]; next[idx] = char; commit(next);
    if (char && idx < NUM_CELLS - 1) refs.current[idx + 1]?.focus();
  };

  const joined = cells.filter(Boolean).join("");
  const isNegative = cells[0] === "-";

  return (
    <div className="mt-3 rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-teal-50/30 p-4 font-sans sm:p-5">
      <p className="mb-3 text-sm font-semibold text-gray-800">Nhập đáp án của bạn</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleMinus}
          aria-pressed={isNegative}
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${isNegative ? "border-rose-300 bg-rose-50 text-rose-700 ring-2 ring-rose-100" : "border-gray-200 bg-white text-gray-600 hover:border-rose-300 hover:text-rose-700"}`}
        >
          <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-lg leading-none ${isNegative ? "bg-rose-500 text-white" : "bg-gray-100 text-gray-600"}`}>−</span>
          {isNegative ? "Bỏ dấu âm" : "Dấu âm"}
        </button>
        <button
          type="button"
          onClick={insertComma}
          disabled={!canInsertComma}
          title={!hasDigit ? "Nhập ít nhất một chữ số trước dấu phẩy" : undefined}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 transition-all hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-lg leading-none text-brand-700">,</span>
          Dấu phẩy
        </button>
      </div>

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
              className={`h-14 w-12 rounded-xl border-2 text-center text-xl font-extrabold outline-none transition-all sm:w-14 ${cell ? "border-indigo-500 bg-white text-indigo-950 shadow-md shadow-indigo-500/10" : "border-gray-300 bg-white text-gray-800 hover:border-indigo-300"} focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100`}
            />
          ))}
        </div>
        {joined && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <span className="text-xs font-medium text-emerald-700">Đáp án</span>
            <span className="text-lg font-extrabold leading-none text-emerald-900">{joined}</span>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-gray-500">Dấu âm và dấu phẩy được điền trực tiếp vào ô. Dấu phẩy chỉ dùng sau ít nhất một chữ số.</p>
    </div>
  );
}
