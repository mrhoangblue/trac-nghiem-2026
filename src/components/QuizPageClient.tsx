"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertCircle, BookOpenCheck, KeyRound, LockKeyhole, LogIn, RefreshCw } from "lucide-react";
import QuizClient, { QuizClientProps } from "@/components/QuizClient";
import { useAuth } from "@/lib/AuthContext";
import { ScoringConfig, TimingConfig } from "@/utils/examTypes";
import { formatDateTime } from "@/utils/examTypes";
import { parseLatexExam, ParsedQuestion } from "@/utils/latexParser";

type QuizData = Omit<QuizClientProps, "examId">;
type AccessMetadata = TimingConfig & { title: string; requiresPassword: boolean };

function LoadingExam() {
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-brand-100 text-brand-700 shadow-soft">
        <BookOpenCheck className="h-8 w-8 animate-pulse" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-extrabold text-earth-900">Đang chuẩn bị đề thi</h1>
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
  const [error, setError] = useState<"not-found" | "not-open" | "closed" | "permission" | "unknown" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadExam = useCallback(async (suppliedPassword = "", signal?: AbortSignal) => {
      if (!user) return;
      setError(null);
      setPasswordError(null);

      try {
        const idToken = await user.getIdToken();
        const response = await fetch(`/api/exams/${encodeURIComponent(examId)}/access`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(suppliedPassword ? { password: suppliedPassword } : {}),
          signal,
        });
        const payload = await response.json();
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
          };
          setError(errorMap[payload.error] ?? "unknown");
          return;
        }

        const data = payload.exam;
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
          const { part1 = "", part2 = "", part3 = "" } = data.rawLatex;
          questions = [
            ...parseLatexExam(part1),
            ...parseLatexExam(part2),
            ...parseLatexExam(part3),
          ].map((question, index) => ({ ...question, id: index + 1 }));
        } else {
          questions = (data.questions ?? []) as ParsedQuestion[];
        }

        setQuiz({
          title: data.title ?? "Bài thi",
          questions,
          scoringConfig,
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
        <div className="mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-amber-100 text-amber-800 shadow-soft">
          <LogIn className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-extrabold text-earth-900">Đăng nhập để làm bài</h1>
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
        <div className="mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-amber-100 text-amber-800 shadow-soft">
          <LockKeyhole className="h-8 w-8" aria-hidden="true" />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Đề thi có mật khẩu</p>
        <h1 className="mt-2 text-2xl font-extrabold text-earth-900">{metadata?.title ?? "Nhập mật khẩu mở đề"}</h1>
        <form onSubmit={handleUnlock} className="mt-6 w-full rounded-3xl border border-brand-100 bg-white p-6 text-left shadow-card">
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
              className="w-full rounded-xl border-2 border-brand-200 py-2.5 pl-10 pr-3 outline-none focus:border-brand-500"
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
          : "Có lỗi khi tải đề thi. Vui lòng thử lại.";

    return (
      <div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-danger-50 text-danger-700 shadow-soft">
          <AlertCircle className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-extrabold text-earth-900">Không thể mở đề thi</h1>
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
