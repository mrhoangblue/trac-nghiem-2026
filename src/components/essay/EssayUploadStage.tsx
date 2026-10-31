"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, Hourglass, Loader2, Lock } from "lucide-react";
import EssayUploadPanel from "@/components/essay/EssayUploadPanel";
import type { EssayUploadState } from "@/utils/essayTypes";

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Sau khi nộp Phần I–III của đề tự luận: khóa phần trắc nghiệm, đếm ngược thời
 * gian bổ sung để chụp/tải bài làm, rồi báo "chờ giáo viên chấm". Học sinh
 * không thấy điểm hay đáp án cho tới khi chấm xong.
 */
export default function EssayUploadStage({
  title,
  submissionId,
  deadlineMillis,
  getToken,
}: {
  title: string;
  submissionId: string;
  deadlineMillis: number | null;
  getToken: () => Promise<string>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [finalized, setFinalized] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const remaining = deadlineMillis === null ? 0 : deadlineMillis - now;
  const open = !finalized && remaining > 0;

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const handleState = useCallback((state: EssayUploadState) => {
    if (state.finalized || !state.uploadOpen) setFinalized(true);
  }, []);

  const finalize = async () => {
    if (fileCount === 0 && !window.confirm("Bạn chưa nộp trang nào cho phần tự luận. Vẫn hoàn tất?")) return;
    setFinalizing(true);
    try {
      const response = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/essay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
        body: JSON.stringify({ action: "finalize" }),
      });
      if (!response.ok) throw new Error("FINALIZE_FAILED");
      setFinalized(true);
    } catch {
      window.alert("Chưa hoàn tất được, kiểm tra mạng rồi thử lại. Ảnh đã tải vẫn được giữ.");
    } finally {
      setFinalizing(false);
    }
  };

  if (!open) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="result-pop w-full max-w-md overflow-hidden rounded-[2rem] border border-gray-200 bg-white text-center shadow-[var(--shadow-lift)]">
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 px-8 py-9 text-white">
            <div aria-hidden="true" className="edu-dots absolute inset-0 opacity-50 mix-blend-overlay" />
            <span className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur"><Hourglass size={26} aria-hidden="true" /></span>
            <h1 className="relative font-display text-xl font-extrabold">Đã nộp bài</h1>
            <p className="relative mt-1 text-sm text-white/85">{title}</p>
          </div>
          <div className="px-8 py-7">
            <p className="font-display text-lg font-bold text-gray-900">Chờ giáo viên chấm phần tự luận</p>
            <p className="mt-2 text-sm leading-6 text-gray-500">Điểm và bài chữa sẽ hiện trong <b className="text-gray-700">Lịch sử làm bài</b> khi giáo viên chấm xong toàn bộ.</p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <Link href="/student/history" className="edu-btn inline-flex min-h-12 items-center justify-center rounded-2xl px-4 text-sm font-semibold text-white">Lịch sử làm bài</Link>
              <Link href="/" className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">Về trang chủ</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const urgent = remaining < 60_000;
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-3 py-5 sm:px-5 lg:py-8">
      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} aria-hidden="true" />Đã nộp Phần I–III</p>
            <h1 className="mt-1 font-display text-xl font-extrabold text-gray-900">Nộp bài làm tự luận</h1>
            <p className="mt-1 text-sm text-gray-500">{title}</p>
          </div>
          <div role="timer" aria-live="polite" className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 ${urgent ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" : "bg-brand-50 text-brand-700 ring-1 ring-brand-100"}`}>
            <Clock3 size={20} aria-hidden="true" />
            <span>
              <span className="block font-display text-2xl font-extrabold tabular-nums leading-none">{formatRemaining(remaining)}</span>
              <span className="text-[11px] font-semibold">còn lại để nộp ảnh</span>
            </span>
          </div>
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-xs leading-5 text-gray-600">
          <Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />Phần trắc nghiệm đã khóa, không sửa được nữa. Hết giờ, hệ thống tự hoàn tất với những trang đã tải lên.
        </p>
      </div>

      <div className="mt-4">
        <EssayUploadPanel submissionId={submissionId} getToken={getToken} onFilesChange={setFileCount} onStateLoaded={handleState} />
      </div>

      <button type="button" onClick={() => void finalize()} disabled={finalizing} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 disabled:opacity-60">
        {finalizing ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={17} aria-hidden="true" />}
        Hoàn tất nộp bài
      </button>
    </div>
  );
}
