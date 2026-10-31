"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertCircle, BookOpenCheck, KeyRound, LockKeyhole, LogIn, RefreshCw } from "lucide-react";
import QuizClient, { QuizClientProps } from "@/components/QuizClient";
import { useAuth } from "@/lib/AuthContext";
import { ScoringConfig, TimingConfig } from "@/utils/examTypes";
import { formatDateTime } from "@/utils/examTypes";
import { normalizeStructure, orderQuestionsByPart } from "@/utils/examStructure";
import { parseLatexExam, ParsedQuestion } from "@/utils/latexParser";

type QuizData = Omit<QuizClientProps, "examId">;
type AccessMetadata = TimingConfig & { title: string; requiresPassword: boolean };
type ExamAccessData = {
  title?: string;
  questions?: ParsedQuestion[];
  scoringConfig?: ScoringConfig;
  structure?: string;
  versioning?: unknown;
  duration?: number;
  startTime?: string | null;
  endTime?: string | null;
  requiresPassword?: boolean;
  tikzProcessed?: boolean;
  rawLatex?: { part1?: string; part2?: string; part3?: string; part4?: string };
  maxRetries?: number;
};

function LoadingExam() {
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30">
        <BookOpenCheck className="h-8 w-8 animate-pulse" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-extrabold font-display text-gray-900">Đang chuẩn bị đề thi</h1>
      <p className="mt-2 text-sm text-gray-500">Hệ thống đang tải câu hỏi và cấu hình thời gian…</p>
    </div>
  );
}

export default function QuizPageClient({ examId }: { examId: string }) {
  const { user, login } = useAuth();
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [metadata, setMetadata] = useState<AccessMetadata | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<"not-found" | "not-open" | "closed" | "permission" | "not-in-class" | "auth" | "unknown" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadExam = useCallback(async (suppliedPassword = "", signal?: AbortSignal) => {
      if (!user) return;
      setError(null);
      setPasswordError(null);

      try {
        const requestExam = async (forceRefresh: boolean) => {
          const idToken = await user.getIdToken(forceRefresh);
          return fetch(`/api/exams/${encodeURIComponent(examId)}/access`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify(suppliedPassword ? { password: suppliedPassword } : {}),
            signal,
            cache: "no-store",
          });
        };

        // Firebase may retain an expired/revoked token in a long-lived browser tab.
        // Refresh it once on 401 instead of leaving the user on a generic error page.
        let response = await requestExam(false);
        if (response.status === 401 && !signal?.aborted) {
          response = await requestExam(true);
        }

        const payload = (await response.json().catch(() => ({ error: "INVALID_RESPONSE" }))) as {
          error?: string;
          metadata?: AccessMetadata;
          exam?: ExamAccessData;
        };
        if (signal?.aborted) return;

        if (!response.ok) {
          if (payload.metadata) setMetadata(payload.metadata as AccessMetadata);
          if (payload.error === "PASSWORD_REQUIRED") {
            setNeedsPassword(true);
            return;
          }
          if (payload.error === "INVALID_PASSWORD") {
            setPasswordError("Mật khẩu chưa đúng. Vui lòng kiểm tra lại.");
            return;
          }
          const errorMap: Record<string, typeof error> = {
            NOT_FOUND: "not-found",
            NOT_OPEN: "not-open",
            CLOSED: "closed",
            FORBIDDEN: "permission",
            NOT_IN_CLASS: "not-in-class",
            UNAUTHENTICATED: "auth",
          };
          setError(payload.error ? (errorMap[payload.error] ?? "unknown") : "unknown");
          return;
        }

        const data = payload.exam!;
        const scoringConfig: ScoringConfig = data.scoringConfig ?? {
          part1TotalScore: 3,
          part3TotalScore: 1,
        };
        const timing: TimingConfig = {
          duration: data.duration ?? 90,
          startTime: data.startTime ?? null,
          endTime: data.endTime ?? null,
        };

        // Đề đã xử lý TikZ phải dùng questions đã lưu ảnh. Parse lại rawLatex
        // sẽ đưa mã TikZ gốc trở lại và có thể làm mobile Safari quá tải.
        let questions: ParsedQuestion[];
        if (data.tikzProcessed && Array.isArray(data.questions)) {
          questions = data.questions as ParsedQuestion[];
        } else if (data.rawLatex) {
          const { part1 = "", part2 = "", part3 = "", part4 = "" } = data.rawLatex;
          questions = orderQuestionsByPart([
            ...parseLatexExam(part1),
            ...parseLatexExam(part2),
            ...parseLatexExam(part3),
            ...parseLatexExam(part4),
          ]);
        } else {
          questions = (data.questions ?? []) as ParsedQuestion[];
        }

        setQuiz({
          title: data.title ?? "Bài thi",
          questions,
          scoringConfig,
          structure: normalizeStructure(data.structure),
          versioning: data.versioning,
          timing,
          maxRetries: data.maxRetries ?? 1,
        });
        setMetadata({
          title: data.title ?? "Bài thi",
          duration: data.duration ?? 90,
          startTime: data.startTime ?? null,
          endTime: data.endTime ?? null,
          requiresPassword: Boolean(data.requiresPassword),
        });
        setNeedsPassword(false);
      } catch (cause) {
        if (signal?.aborted) return;
        const code = (cause as { code?: string }).code;
        setError(code === "permission-denied" ? "permission" : "unknown");
        console.error("Không thể tải đề thi:", cause);
      }
  }, [examId, user]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    queueMicrotask(() => void loadExam("", controller.signal));
    return () => {
      controller.abort();
    };
  }, [loadExam, reloadKey, user]);

  const handleUnlock = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || unlocking) return;
    setUnlocking(true);
    await loadExam(password);
    setUnlocking(false);
  };

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-orange-500/30">
          <LogIn className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-extrabold font-display text-gray-900">Đăng nhập để làm bài</h1>
        <p className="mt-3 text-gray-600">Đề thi được bảo vệ để lưu tiến độ và kết quả đúng tài khoản của bạn.</p>
        <button
          type="button"
          onClick={login}
          className="sunset-button mt-6 inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-bold"
        >
          <LogIn className="h-5 w-5" aria-hidden="true" />
          Đăng nhập bằng Google
        </button>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-orange-500/30">
          <LockKeyhole className="h-8 w-8" aria-hidden="true" />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Đề thi có mật khẩu</p>
        <h1 className="mt-2 text-2xl font-extrabold font-display text-gray-900">{metadata?.title ?? "Nhập mật khẩu mở đề"}</h1>
        <form onSubmit={handleUnlock} className="mt-6 w-full rounded-3xl border border-brand-100 bg-white p-6 text-left shadow-[var(--shadow-soft)]">
          <label htmlFor="exam-password" className="mb-2 block text-sm font-bold text-gray-700">
            Mật khẩu đề thi
          </label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-400" aria-hidden="true" />
            <input
              id="exam-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              placeholder="Nhập mật khẩu do giáo viên cung cấp"
            />
          </div>
          {passwordError && <p className="mt-2 text-sm font-semibold text-danger-600">{passwordError}</p>}
          <button
            type="submit"
            disabled={!password || unlocking}
            className="sunset-button mt-4 w-full rounded-xl px-5 py-3 font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {unlocking ? "Đang kiểm tra…" : "Mở đề thi"}
          </button>
        </form>
      </div>
    );
  }

  if (error) {
    const message =
      error === "not-found"
        ? "Đề thi không tồn tại hoặc đã được gỡ."
        : error === "not-open"
          ? `Đề thi chưa mở${metadata?.startTime ? `; thời gian mở là ${formatDateTime(metadata.startTime)}` : ""}.`
          : error === "closed"
            ? `Đề thi đã hết hạn${metadata?.endTime ? ` từ ${formatDateTime(metadata.endTime)}` : ""}. Giáo viên có thể gia hạn để mở lại.`
        : error === "permission"
          ? "Tài khoản của bạn chưa được cấp quyền đọc đề thi này."
        : error === "not-in-class"
          ? "Đề này chỉ giao cho học sinh của lớp được chọn. Hãy tham gia lớp bằng mã giáo viên gửi, hoặc liên hệ giáo viên."
          : error === "auth"
            ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng xuất, đăng nhập lại rồi mở đề."
          : "Có lỗi khi tải đề thi. Vui lòng thử lại.";

    return (
      <div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/30">
          <AlertCircle className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-extrabold font-display text-gray-900">Không thể mở đề thi</h1>
        <p className="mt-3 text-gray-600">{message}</p>
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-brand-300 bg-white px-5 py-3 font-bold text-brand-800 shadow-soft transition hover:bg-brand-50"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Thử tải lại
        </button>
      </div>
    );
  }

  if (!quiz) return <LoadingExam />;

  return <QuizClient examId={examId} {...quiz} />;
}
