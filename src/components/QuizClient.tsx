"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { ParsedQuestion } from "@/utils/latexParser";
import { processLatexText } from "@/utils/textProcessor";
import TikzRenderer from "@/components/TikzRenderer";
import ReviewMode from "@/components/ReviewMode";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import {
  ScoringConfig,
  TimingConfig,
  ScoreResult,
  P2_TABLE,
  normalizeAnswer,
  formatCountdown,
  formatDateTime,
} from "@/utils/examTypes";

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
    colors: "border-purple-300 bg-purple-50 text-purple-800",
  },
  true_false: {
    roman: "II",
    label: "Câu hỏi trắc nghiệm Đúng – Sai",
    note: "Điểm tối đa mỗi câu là 1,0 điểm theo quy chế",
    colors: "border-amber-300 bg-amber-50 text-amber-800",
  },
  short_answer: {
    roman: "III",
    label: "Câu hỏi trắc nghiệm trả lời ngắn",
    note: "Mỗi câu trả lời đúng được 0,25 hoặc 0,5 điểm tùy cấu hình",
    colors: "border-emerald-300 bg-emerald-50 text-emerald-800",
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
    <div className="sticky top-16 z-40 flex justify-end mb-4 pointer-events-none">
      <div
        className={`pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-2xl shadow-lg font-mono font-extrabold text-lg transition-colors ${
          isDanger
            ? "bg-red-600 text-white animate-pulse"
            : isWarning
            ? "bg-amber-400 text-white"
            : "bg-white border border-gray-200 text-gray-800"
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

  // ── Screen state ──────────────────────────────────────────────────────────
  const [started, setStarted] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // NOTE: `timeLeft` state has been REMOVED from this component.
  // It now lives inside <CountdownTimer> to isolate per-second re-renders.

  // ── Student answers ───────────────────────────────────────────────────────
  const [p1Ans, setP1Ans] = useState<Record<number, number>>({});
  const [p2Ans, setP2Ans] = useState<Record<number, (boolean | null)[]>>({});
  const [p3Ans, setP3Ans] = useState<Record<number, string>>({});

  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);

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
  }, [started, isSubmitted, requestWakeLock]);

  // ── Retry limit ───────────────────────────────────────────────────────────
  const [submissionCount, setSubmissionCount] = useState<number | null>(null);
  const userEmail = user?.email ?? null; // stable string dep (not object ref)

  useEffect(() => {
    if (!userEmail) return;
    let cancelled = false;
    const countPrev = async () => {
      try {
        const q = query(
          collection(db, "submissions"),
          where("examId", "==", examId),
          where("studentEmail", "==", userEmail)
        );
        const snap = await getDocs(q);
        if (!cancelled) setSubmissionCount(snap.size);
      } catch {
        if (!cancelled) setSubmissionCount(0);
      }
    };
    countPrev();
    return () => { cancelled = true; };
  }, [userEmail, examId]);

  // ── Anti-cheat + Wake Lock re-acquire (merged visibility handler) ─────────
  const [cheatCount, setCheatCount] = useState(0);
  const [showCheatWarning, setShowCheatWarning] = useState(false);
  const cheatCountRef = useRef(0);

  useEffect(() => {
    if (!started || isSubmitted) return;
    const handleVisibility = () => {
      if (document.hidden) {
        // Student left the exam tab
        cheatCountRef.current += 1;
        setCheatCount(cheatCountRef.current);
        setShowCheatWarning(true);
      } else {
        // TASK 1 edge case: tab became visible again.
        // The OS always releases wake lock when the page is hidden — re-request it.
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [started, isSubmitted, requestWakeLock]);

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
      try {
        const docRef = await addDoc(collection(db, "submissions"), {
          examId,
          examTitle: title,
          studentName: userProfile?.fullName ?? user?.displayName ?? "Khách",
          studentEmail: user?.email ?? "—",
          studentAvatar: user?.photoURL ?? "",
          submittedAt: serverTimestamp(),
          part1Results,
          part2Results,
          part3Results,
          scores: result,
          answersJson: JSON.stringify({ p1Ans, p2Ans, p3Ans }),
          cheatCount: cheatCountRef.current,
        });
        savedSubmissionId = docRef.id;
      } catch (err) {
        console.error("Lỗi lưu bài nộp:", err);
      }

      if (user?.email && user.email !== "—") {
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

        fetch("/api/send-result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
      isSubmitted, submitting, totalAnswered, totalQuestions,
      calculateScore, p1Qs, p2Qs, p3Qs,
      p1Ans, p2Ans, p3Ans, examId, title, user, userProfile,
      // cheatCount intentionally OMITTED — read via cheatCountRef.current inside
    ]
  );

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
    (qId: number, optIdx: number) => setP1Ans((prev) => ({ ...prev, [qId]: optIdx })),
    []
  );
  const onP2 = useCallback(
    (qId: number, stmtIdx: number, value: boolean) =>
      setP2Ans((prev) => {
        const cur = prev[qId] ?? new Array(4).fill(null);
        const next = [...cur];
        next[stmtIdx] = value;
        return { ...prev, [qId]: next };
      }),
    []
  );
  const onP3 = useCallback(
    (qId: number, val: string) => setP3Ans((prev) => ({ ...prev, [qId]: val })),
    []
  );

  // Stable navigate callback for QuestionPalette — empty deps, uses functional updater
  const onNavigate = useCallback((i: number) => setCurrentIdx(i), []);

  // ── Auth guard ────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 max-w-md w-full overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-8 text-center">
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
              className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all hover:-translate-y-0.5"
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

  // ── Intro screen ──────────────────────────────────────────────────────────
  if (!started) {
    const retryLimitReached =
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
        onStart={() => setStarted(true)} // CountdownTimer initialises its own state
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-red-950/80 backdrop-blur-sm">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border-2 border-red-200">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4">⚠️</div>
        <h2 className="text-2xl font-extrabold text-red-600 mb-2">Cảnh báo gian lận!</h2>
        <p className="text-gray-700 text-sm leading-relaxed mb-1">
          Bạn đã <strong>rời khỏi màn hình bài thi</strong>.
        </p>
        <p className="text-gray-500 text-sm mb-6">
          Số lần vi phạm: <strong className="text-red-600 text-lg">{cheatCount}</strong>
        </p>
        <button
          onClick={() => setShowCheatWarning(false)}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors"
        >
          Tôi hiểu, quay lại làm bài
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 w-full flex-1 flex flex-col">
      {CheatWarningModal}

      {/* ── TASK 2: Isolated countdown — only this tiny component re-renders per second ── */}
      <CountdownTimer totalSeconds={timing.duration * 60} onExpire={onExpire} />

      {/* ── Section banner ─────────────────────────────────────────────────── */}
      {isFirstOfSection && sectionMeta && (
        <div className={`mb-4 px-5 py-3 rounded-2xl border-2 ${sectionMeta.colors}`}>
          <p className="font-extrabold text-sm">
            PHẦN {sectionMeta.roman}: {sectionMeta.label}
          </p>
          <p className="text-xs opacity-80 mt-0.5">{sectionMeta.note}</p>
        </div>
      )}

      {/* ── Header / progress ──────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex justify-between items-end mb-3">
          <div>
            <h1 className="text-xl font-extrabold text-gray-900 leading-tight">{title}</h1>
            <p className="text-sm text-gray-500 mt-1">
              Câu {currentIdx + 1}/{totalQuestions} · Đã trả lời:{" "}
              <span className="font-semibold text-blue-600">{totalAnswered}</span>/{totalQuestions}
            </p>
          </div>
          <span className="text-blue-600 font-bold text-sm">{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ── Question card — key forces full unmount/remount on navigation ── */}
      {/* key={currentQ.id} ensures old KaTeX DOM + TikZJax WebAssembly are   */}
      {/* fully released BEFORE the new question's DOM is allocated.           */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-8 flex-1">
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

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <div className="mt-6 flex items-center gap-3 justify-between">
        <button
          onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
          disabled={currentIdx === 0}
          className={`px-5 py-3 rounded-xl font-bold text-sm transition-all ${
            currentIdx === 0
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
          }`}
        >
          ← Trước
        </button>

        {/* Question palette — memoized component, skips render when nothing changed */}
        <QuestionPalette
          questions={questions}
          currentIdx={currentIdx}
          p1Ans={p1Ans}
          p2Ans={p2Ans}
          p3Ans={p3Ans}
          onNavigate={onNavigate}
        />

        {currentIdx < questions.length - 1 ? (
          <button
            onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all"
          >
            Tiếp →
          </button>
        ) : (
          <button
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className="px-5 py-3 bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-all flex items-center gap-2"
          >
            {submitting && (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            Nộp bài
          </button>
        )}
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
  onStart,
}: {
  title: string;
  questions: ParsedQuestion[];
  timing: TimingConfig;
  maxRetries: number;
  submissionCount: number | null;
  retryLimitReached: boolean;
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
    <div className="max-w-xl mx-auto px-4 py-16 w-full">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-10 text-white">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-3xl mb-4">📝</div>
          <h1 className="text-2xl font-extrabold leading-tight">{title}</h1>
          <p className="mt-2 opacity-70 text-sm">{questions.length} câu hỏi</p>
        </div>

        <div className="px-8 py-6 space-y-5">
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            {[
              { label: "Trắc nghiệm",   count: p1Count, color: "bg-purple-50 border-purple-100 text-purple-700" },
              { label: "Đúng/Sai",      count: p2Count, color: "bg-amber-50 border-amber-100 text-amber-700" },
              { label: "Trả lời ngắn",  count: p3Count, color: "bg-emerald-50 border-emerald-100 text-emerald-700" },
            ].map(({ label, count, color }) => (
              <div key={label} className={`rounded-xl border p-3 ${color}`}>
                <p className="text-2xl font-extrabold">{count}</p>
                <p className="text-xs font-medium opacity-80 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 space-y-2 text-sm">
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
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800">
              <span className="text-2xl">🔒</span>
              <div>
                <p className="font-bold text-sm">Đề thi đã đóng</p>
                <p className="text-xs opacity-70 mt-0.5">Đã đóng lúc {formatDateTime(timing.endTime)}</p>
              </div>
            </div>
          )}
          {retryLimitReached && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800">
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
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow hover:-translate-y-0.5"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
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
        ? { label: "Trắc nghiệm",   cls: "bg-purple-100 text-purple-700" }
        : type === "true_false"
        ? { label: "Đúng / Sai",    cls: "bg-amber-100 text-amber-700" }
        : { label: "Trả lời ngắn", cls: "bg-emerald-100 text-emerald-700" };

    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
            Câu {questionNumber}
          </span>
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${typeBadge.cls}`}>
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
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-center gap-3 ${
                    selected ? "border-blue-500 bg-blue-50" : "border-gray-100 hover:border-blue-300 hover:bg-gray-50"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${selected ? "border-blue-500" : "border-gray-300"}`}>
                    {selected && <div className="w-3 h-3 bg-blue-500 rounded-full" />}
                  </div>
                  <span className="font-bold text-gray-400 shrink-0">{String.fromCharCode(65 + i)}.</span>
                  <span className={`leading-relaxed ${selected ? "text-blue-900 font-medium" : "text-gray-700"}`}>
                    {renderedOptions[i]}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* P2 — True / False table */}
        {type === "true_false" && options && (
          <div className="overflow-x-auto rounded-2xl border border-amber-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-amber-50 border-b border-amber-200">
                  <th className="text-center px-3 py-2.5 font-bold text-amber-700 border-r border-amber-200 w-10">Ý</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Phát biểu</th>
                  <th className="text-center px-4 py-2.5 font-bold text-emerald-700 border-l border-amber-200 w-20">ĐÚNG</th>
                  <th className="text-center px-4 py-2.5 font-bold text-red-600 border-l border-amber-200 w-20">SAI</th>
                </tr>
              </thead>
              <tbody>
                {options.map((stmt, i) => {
                  const selected = (p2Ans[id] ?? [])[i];
                  const isDung = selected === true;
                  const isSai  = selected === false;
                  return (
                    <tr key={i} className={`border-t border-amber-100 ${i % 2 === 1 ? "bg-amber-50/30" : "bg-white"}`}>
                      <td className="px-3 py-3 text-center font-extrabold text-amber-600 border-r border-amber-100">
                        {String.fromCharCode(97 + i)}
                      </td>
                      <td className="px-4 py-3 text-gray-800 leading-relaxed">{renderedOptions[i]}</td>
                      <td className="px-3 py-2 text-center border-l border-amber-100">
                        <button
                          onClick={() => onP2(id, i, true)}
                          className={`w-full py-2 rounded-xl font-bold text-sm transition-all ${isDung ? "bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-300" : "bg-gray-100 text-gray-400 hover:bg-emerald-100 hover:text-emerald-700"}`}
                        >Đúng</button>
                      </td>
                      <td className="px-3 py-2 text-center border-l border-amber-100">
                        <button
                          onClick={() => onP2(id, i, false)}
                          className={`w-full py-2 rounded-xl font-bold text-sm transition-all ${isSai ? "bg-red-500 text-white shadow-sm ring-2 ring-red-300" : "bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-700"}`}
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
      <div className="flex gap-1 flex-wrap justify-center max-w-xs">
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
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                i === currentIdx
                  ? "bg-blue-600 text-white shadow"
                  : answered
                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
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
const ALLOWED_RE = /^[0-9,\-]$/;

function ShortAnswerInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [cells, setCells] = useState<string[]>(() => {
    const chars = value.split("").slice(0, NUM_CELLS);
    return Array.from({ length: NUM_CELLS }, (_, i) => chars[i] ?? "");
  });
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const commit = (next: string[]) => { setCells(next); onChange(next.filter(Boolean).join("")); };

  // Tầng 1: chặn tại nguồn trước khi ký tự vào DOM (iOS Safari)
  const handleBeforeInput = (idx: number, e: React.FormEvent<HTMLInputElement> & { data?: string }) => {
    const raw = e.data ?? "";
    // Dấu chấm → cho qua để xử lý thành phẩy ở bước tiếp theo
    if (raw === ".") return;
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
    // Cho phép phím điều hướng và phím hệ thống đi qua
    if (e.key.length > 1) return;
    const mapped = e.key === "." ? "," : e.key;
    if (!ALLOWED_RE.test(mapped)) e.preventDefault();
  };

  // Tầng 3: safety net — đổi dấu chấm thành phẩy, lọc ký tự lạ còn sót
  const handleChange = (idx: number, raw: string) => {
    const char = raw.replace(/\./g, ",").replace(/[^0-9,\-]/g, "").slice(-1);
    const next = [...cells]; next[idx] = char; commit(next);
    if (char && idx < NUM_CELLS - 1) refs.current[idx + 1]?.focus();
  };

  const joined = cells.filter(Boolean).join("");

  const toggleMinus = () => {
    const next = [...cells];
    if (next[0] === "-") {
      next[0] = "";
    } else {
      // Đẩy các ô sang phải để chèn "-" vào đầu
      for (let i = NUM_CELLS - 1; i > 0; i--) next[i] = next[i - 1];
      next[0] = "-";
    }
    commit(next);
    refs.current[next[0] === "-" ? 1 : 0]?.focus();
  };

  return (
    <div className="mt-2">
      <p className="text-sm font-semibold text-gray-600 mb-3">Nhập đáp án của bạn:</p>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Nút dấu trừ riêng biệt — giải pháp cho iOS không có "-" trên bàn phím decimal */}
        <button
          type="button"
          onClick={toggleMinus}
          className={`w-10 h-12 text-xl font-bold border-2 rounded-md transition-all select-none
            ${cells[0] === "-"
              ? "border-rose-500 bg-rose-50 text-rose-700 ring-2 ring-rose-200"
              : "border-gray-300 hover:border-gray-400 bg-white text-gray-500 hover:text-gray-800"}`}
        >
          −
        </button>
        {cells.map((cell, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="text"
            inputMode="decimal"
            pattern="[0-9,\-]*"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={1}
            value={cell}
            onBeforeInput={(e) => handleBeforeInput(i, e as React.FormEvent<HTMLInputElement> & { data?: string })}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className={`w-12 h-12 text-center text-xl font-bold border-2 rounded-md outline-none transition-all
              ${cell ? "border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-200"
                     : "border-gray-300 hover:border-gray-400 bg-white text-gray-800"}
              focus:border-blue-500 focus:ring-2 focus:ring-blue-200`}
          />
        ))}
        {joined && (
          <div className="ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
            <span className="text-xs text-emerald-600 font-medium">Đáp án:</span>
            <span className="font-extrabold text-emerald-800 text-lg leading-none">{joined}</span>
          </div>
        )}
      </div>
    </div>
  );
}
