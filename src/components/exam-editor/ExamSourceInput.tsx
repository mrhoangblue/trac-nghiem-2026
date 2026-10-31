"use client";

import { useState, type DragEvent } from "react";
import { AlertTriangle, Code2, FileText, FileUp, Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";
import type { SmartParseCounts } from "@/utils/smartParseLatex";

export interface ImportStats {
  questionCount: number;
  equationCount: number;
  imageCount: number;
  pageCount?: number;
}

const ACCEPT = ".docx,.pdf,.tex,application/pdf,text/x-tex,application/x-tex,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export default function ExamSourceInput({
  value,
  onChange,
  onAnalyze,
  onFile,
  importing,
  counts,
  importStats,
  warnings,
}: {
  value: string;
  onChange: (value: string) => void;
  onAnalyze: () => void;
  onFile: (file: File) => void;
  importing: boolean;
  counts: SmartParseCounts | null;
  importStats: ImportStats | null;
  warnings: string[];
}) {
  const [mode, setMode] = useState<"latex" | "file">("latex");
  const [dragging, setDragging] = useState(false);
  const lineCount = value ? value.split("\n").length : 0;

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !importing) onFile(file);
  };

  const tabClass = (active: boolean) =>
    `inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition sm:flex-none sm:px-4 ${active ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Cách nhập đề" className="flex rounded-xl bg-gray-100 p-1">
        <button type="button" role="tab" aria-selected={mode === "latex"} onClick={() => setMode("latex")} className={tabClass(mode === "latex")}>
          <Code2 size={16} aria-hidden="true" />Dán mã LaTeX
        </button>
        <button type="button" role="tab" aria-selected={mode === "file"} onClick={() => setMode("file")} className={tabClass(mode === "file")}>
          <FileUp size={16} aria-hidden="true" />Tải file đề
        </button>
      </div>

      {mode === "latex" ? (
        <div role="tabpanel" className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-inner">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5"><Sparkles size={13} className="text-violet-300" aria-hidden="true" />Smart Input tự chia phần theo <code className="text-slate-200">\choice</code>, <code className="text-slate-200">\choiceTF</code>, <code className="text-slate-200">\shortans</code></span>
            <span className="hidden shrink-0 tabular-nums sm:inline">{lineCount} dòng</span>
          </div>
          <label htmlFor="smart-latex" className="sr-only">Mã LaTeX của đề thi</label>
          <textarea
            id="smart-latex"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            placeholder={"% Dán toàn bộ đề vào đây, không cần tách từng phần\n\\begin{ex}\n  Nội dung câu hỏi...\n  \\choice{A}{B}{C}{\\True D}\n  \\loigiai{...}\n\\end{ex}"}
            className="block h-80 w-full resize-y bg-transparent p-4 font-mono text-[13px] leading-6 text-slate-100 outline-none placeholder:text-slate-500 sm:h-96"
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2.5">
            <button type="button" onClick={onAnalyze} disabled={!value.trim()} className="edu-btn inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50">
              <Wand2 size={16} aria-hidden="true" />Phân tích &amp; xem trước
            </button>
            {value && (
              <button type="button" onClick={() => onChange("")} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-slate-400 transition hover:bg-white/10 hover:text-white">
                <Trash2 size={15} aria-hidden="true" />Xóa
              </button>
            )}
          </div>
        </div>
      ) : (
        <div role="tabpanel">
          <label
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`relative flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${importing ? "cursor-wait border-brand-200 bg-brand-50/50" : dragging ? "border-brand-500 bg-brand-50" : "border-gray-300 bg-gray-50/60 hover:border-brand-400 hover:bg-brand-50/40"}`}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25">
              {importing ? <Loader2 size={24} className="animate-spin" aria-hidden="true" /> : <FileUp size={24} aria-hidden="true" />}
            </span>
            <span>
              <span className="block font-display text-base font-bold text-gray-900">{importing ? "Đang đọc và phân tích file…" : "Kéo thả file vào đây hoặc bấm để chọn"}</span>
              <span className="mt-1 block text-sm text-gray-500">Word (.docx), PDF hoặc LaTeX (.tex) · tối đa 25 MB</span>
            </span>
            <input
              type="file"
              accept={ACCEPT}
              disabled={importing}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onFile(file);
                event.target.value = "";
              }}
            />
          </label>
          <ul className="mt-3 grid gap-2 text-xs leading-5 text-gray-500 sm:grid-cols-3">
            <li className="flex gap-2 rounded-xl bg-gray-50 p-2.5"><FileText size={14} className="mt-0.5 shrink-0 text-sky-500" aria-hidden="true" /><span><b className="text-gray-700">DOCX</b> nhận Word Equation và ảnh</span></li>
            <li className="flex gap-2 rounded-xl bg-gray-50 p-2.5"><FileText size={14} className="mt-0.5 shrink-0 text-rose-500" aria-hidden="true" /><span><b className="text-gray-700">PDF</b> đọc lớp văn bản, cần soát lại công thức</span></li>
            <li className="flex gap-2 rounded-xl bg-gray-50 p-2.5"><FileText size={14} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden="true" /><span><b className="text-gray-700">TEX</b> tự lấy các khối ex/bt</span></li>
          </ul>
          {value && !importing && (
            <button type="button" onClick={() => setMode("latex")} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
              <Code2 size={15} aria-hidden="true" />Xem và sửa mã LaTeX đã nhận diện
            </button>
          )}
        </div>
      )}

      {counts && (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
          <div className={`grid gap-2 ${counts.p4 > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
            {[
              { label: "Nhiều lựa chọn", count: counts.p1, tone: "from-sky-400 to-indigo-500" },
              { label: "Đúng / Sai", count: counts.p2, tone: "from-amber-400 to-orange-500" },
              { label: "Trả lời ngắn", count: counts.p3, tone: "from-emerald-400 to-teal-500" },
              ...(counts.p4 > 0 ? [{ label: "Tự luận", count: counts.p4, tone: "from-fuchsia-400 to-violet-500" }] : []),
            ].map(({ label, count, tone }) => (
              <div key={label} className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 shadow-sm">
                <span className={`hidden h-8 w-1.5 shrink-0 rounded-full bg-gradient-to-b sm:block ${tone}`} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-display text-xl font-extrabold tabular-nums text-gray-900">{count}</span>
                  <span className="block truncate text-[11px] font-medium text-gray-500">{label}</span>
                </span>
              </div>
            ))}
          </div>
          {importStats && (
            <p className="mt-2.5 px-1 text-xs font-medium text-emerald-800">
              Từ file: {importStats.questionCount} câu · {importStats.equationCount} công thức · {importStats.imageCount} hình{importStats.pageCount ? ` · ${importStats.pageCount} trang` : ""}
            </p>
          )}
          {counts.unknown > 0 && (
            <p className="mt-2 flex items-start gap-1.5 px-1 text-xs font-semibold text-amber-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />{counts.unknown} câu chưa nhận diện được loại nên tạm xếp vào Phần I.
            </p>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
          <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} aria-hidden="true" />Cần kiểm tra lại</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-5">{warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
