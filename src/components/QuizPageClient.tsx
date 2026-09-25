"use client";

import { useEffect, useState } from "react";
import { AlertCircle, BookOpenCheck, LogIn, RefreshCw } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import QuizClient, { QuizClientProps } from "@/components/QuizClient";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import { ScoringConfig, TimingConfig } from "@/utils/examTypes";
import { parseLatexExam, ParsedQuestion } from "@/utils/latexParser";

type QuizData = Omit<QuizClientProps, "examId">;

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
  const [error, setError] = useState<"not-found" | "permission" | "unknown" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadExam() {
      setError(null);
      setQuiz(null);

      try {
        const snapshot = await getDoc(doc(db, "exams", examId));
        if (cancelled) return;
        if (!snapshot.exists()) {
          setError("not-found");
          return;
        }

        const data = snapshot.data();
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
      } catch (cause) {
        if (cancelled) return;
        const code = (cause as { code?: string }).code;
        setError(code === "permission-denied" ? "permission" : "unknown");
        console.error("Không thể tải đề thi:", cause);
      }
    }

    void loadExam();
    return () => {
      cancelled = true;
    };
  }, [examId, reloadKey, user]);

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

  if (error) {
    const message =
      error === "not-found"
        ? "Đề thi không tồn tại hoặc đã được gỡ."
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
