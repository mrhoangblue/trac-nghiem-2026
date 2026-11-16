"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, Undo2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { findSourceBlocks, hasLatexErrors, lintExamSource } from "@/utils/latexLint";

const VISIBLE_ROWS = 6;

interface RepairResponse { results?: Array<{ index: number; latex: string | null; reason: string | null }>; error?: string }

const ERROR_TEXT: Record<string, string> = {
  AI_NOT_CONFIGURED: "Máy chủ chưa cấu hình khoá AI.",
  RATE_LIMITED: "AI đang quá tải, thử lại sau ít phút.",
  TOO_LARGE: "Phần cần sửa quá dài, hãy sửa bớt bằng tay rồi thử lại.",
  UNAUTHENTICATED: "Phiên đăng nhập đã hết, hãy tải lại trang.",
};

/**
 * Rà LaTeX của nguồn đề ngay khi giáo viên dán vào: chỉ ra câu nào bộ hiển thị
 * phải tự sửa hoặc không dựng được, và cho nhờ AI viết lại các câu đó.
 */
export default function LatexCheckPanel({ source, onChange }: { source: string; onChange: (value: string) => void }) {
  const { user } = useAuth();
  const deferred = useDeferredValue(source);
  const [expanded, setExpanded] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string; details?: string[] } | null>(null);
  const [undoSource, setUndoSource] = useState<string | null>(null);

  const { reports, blockCount } = useMemo(() => {
    if (!/\\begin\{(?:ex|bt)\}/.test(deferred)) return { reports: [], blockCount: 0 };
    return { reports: lintExamSource(deferred, { essay: true }), blockCount: findSourceBlocks(deferred).length };
  }, [deferred]);

  if (blockCount === 0) return null;

  const rows = reports.flatMap((report) => report.issues.map((issue) => ({ number: report.number, ...issue })));
  const errorCount = reports.filter((report) => hasLatexErrors(report.issues)).length;

  const handleRepair = async () => {
    if (!user || repairing || reports.length === 0) return;
    setRepairing(true);
    setNotice(null);
    const base = source;
    const targets = lintExamSource(base, { essay: true });
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/exams/latex-repair", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          blocks: targets.map((report) => ({
            index: report.number,
            latex: base.slice(report.start, report.end),
            issues: report.issues.map((issue) => `${issue.where}: ${issue.message} — ${issue.snippet}`),
          })),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as RepairResponse;
      if (!response.ok || !payload.results) {
        setNotice({ tone: "warn", text: ERROR_TEXT[payload.error ?? ""] ?? "Chưa nhờ AI sửa được, hãy thử lại." });
        return;
      }
      const byNumber = new Map(payload.results.map((result) => [result.index, result]));
      // Thay từ cuối lên đầu để vị trí các khối phía trước không bị lệch.
      let next = base;
      let fixed = 0;
      const manual: string[] = [];
      for (const report of [...targets].reverse()) {
        const result = byNumber.get(report.number);
        if (result?.latex) { next = next.slice(0, report.start) + result.latex + next.slice(report.end); fixed++; }
        else manual.unshift(`Câu ${report.number}: ${result?.reason ?? "AI không trả kết quả."}`);
      }
      if (fixed > 0) { setUndoSource(base); onChange(next); }
      setNotice({
        tone: manual.length === 0 ? "ok" : "warn",
        text: `AI đã sửa ${fixed}/${targets.length} câu${fixed > 0 ? "; bấm Phân tích & xem trước để đọc lại các câu này" : ""}.${manual.length > 0 ? " Các câu sau cần sửa tay:" : ""}`,
        details: manual,
      });
    } catch {
      setNotice({ tone: "warn", text: "Mất kết nối khi nhờ AI sửa, hãy thử lại." });
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="space-y-2">
      {reports.length === 0 ? (
        <p role="status" className="flex items-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 size={15} aria-hidden="true" />LaTeX của {blockCount} câu hiển thị đúng.
        </p>
      ) : (
        <div role="alert" className={`rounded-2xl border p-3.5 text-sm ${errorCount > 0 ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle size={15} aria-hidden="true" />
              {reports.length} câu có LaTeX chưa chuẩn{errorCount > 0 ? `, trong đó ${errorCount} câu hiển thị sai` : ""}
            </p>
            <button type="button" onClick={handleRepair} disabled={repairing || !user} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-semibold text-brand-700 shadow-sm ring-1 ring-black/5 transition hover:bg-brand-50 disabled:opacity-60">
              {repairing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
              {repairing ? "AI đang sửa…" : `Nhờ AI sửa ${reports.length} câu`}
            </button>
          </div>
          <p className="mt-1 text-xs leading-5 opacity-80">
            {errorCount > 0 ? "Câu hiển thị sai phải sửa trước khi lưu. " : ""}Các chỗ còn lại website đã tự sửa khi hiển thị, nhưng nên sửa trong nguồn để đề in và đề online giống nhau.
          </p>
          <ul className="mt-2 space-y-1.5 text-xs leading-5">
            {(expanded ? rows : rows.slice(0, VISIBLE_ROWS)).map((row, index) => (
              <li key={index} className="rounded-lg bg-white/70 px-2.5 py-1.5">
                <b>Câu {row.number} · {row.where}:</b> {row.message}
                {row.snippet && <code className="mt-0.5 block truncate font-mono text-[11px] opacity-70">{row.snippet}</code>}
              </li>
            ))}
          </ul>
          {rows.length > VISIBLE_ROWS && (
            <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-2 text-xs font-semibold underline">
              {expanded ? "Thu gọn" : `Xem thêm ${rows.length - VISIBLE_ROWS} chỗ`}
            </button>
          )}
        </div>
      )}

      {notice && (
        <div role="status" className={`rounded-2xl border px-3.5 py-2.5 text-xs leading-5 ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50/60 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <p className="font-semibold">{notice.text}</p>
          {notice.details && notice.details.length > 0 && <ul className="mt-1 list-disc pl-5">{notice.details.map((line) => <li key={line}>{line}</li>)}</ul>}
          {undoSource !== null && (
            <button type="button" onClick={() => { onChange(undoSource); setUndoSource(null); setNotice(null); }} className="mt-1.5 inline-flex items-center gap-1 font-semibold underline">
              <Undo2 size={13} aria-hidden="true" />Hoàn tác, dùng lại bản trước khi AI sửa
            </button>
          )}
        </div>
      )}
    </div>
  );
}
