"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageSquareText } from "lucide-react";
import EssayAnnotator from "@/components/essay/EssayAnnotator";
import { useEssayPages } from "@/components/essay/useEssayPages";
import type { EssayAnnotations, EssayFileView, EssayGrading } from "@/utils/essayTypes";

export interface EssayResultData {
  files: EssayFileView[];
  grading: EssayGrading | null;
  annotations: EssayAnnotations | null;
  gradingStatus: "pending" | "graded" | null;
}

/** Tải bài tự luận đã chấm (API chỉ trả phiếu chấm khi giáo viên đã hoàn tất). */
export function useEssayResult(submissionId: string | null, getToken: (() => Promise<string>) | null) {
  const [state, setState] = useState<{ id: string | null; data: EssayResultData | null }>({ id: null, data: null });
  useEffect(() => {
    if (!submissionId || !getToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/essay`, {
          headers: { Authorization: `Bearer ${await getToken()}` },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null) as EssayResultData | null;
        if (!cancelled) setState({ id: submissionId, data: response.ok ? payload : null });
      } catch {
        if (!cancelled) setState({ id: submissionId, data: null });
      }
    })();
    return () => { cancelled = true; };
  }, [getToken, submissionId]);
  return { data: state.id === submissionId ? state.data : null, loading: Boolean(submissionId && getToken) && state.id !== submissionId };
}

/** Bài làm tự luận kèm nét chấm của giáo viên, chỉ xem. */
export default function EssayGradedWork({ data, pending = false }: { data: EssayResultData; pending?: boolean }) {
  const { pages, loading } = useEssayPages(data.files);
  return (
    <section aria-label={pending ? "Bài làm tự luận chưa chấm" : "Bài làm tự luận đã chấm"} className="mt-8 rounded-3xl border border-violet-200 bg-white p-4 shadow-[var(--shadow-soft)] sm:p-6">
      <h2 className="font-display text-lg font-extrabold text-gray-900">{pending ? "Bài làm tự luận (chưa chấm xong)" : "Bài làm tự luận đã chấm"}</h2>
      {data.grading?.generalComment && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <MessageSquareText size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span><b>Nhận xét chung:</b> {data.grading.generalComment}</span>
        </p>
      )}
      <div className="mt-4 rounded-2xl bg-gray-100/80 px-2 pb-6 sm:px-5">
        {loading ? (
          <p role="status" className="flex items-center justify-center py-16 text-sm text-gray-500"><Loader2 size={17} className="mr-2 animate-spin" aria-hidden="true" />Đang mở bài làm…</p>
        ) : pages.length ? (
          <EssayAnnotator pages={pages} annotations={data.annotations ?? {}} readOnly />
        ) : (
          <p className="py-12 text-center text-sm text-gray-500">Không có trang bài làm nào.</p>
        )}
      </div>
    </section>
  );
}
