"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

const DEFAULTS = [
  "Làm tốt, trình bày rõ ràng.",
  "Hướng làm đúng, chưa hoàn thiện kết quả.",
  "Thiếu lập luận, cần trình bày rõ từng bước.",
  "Sai dấu hoặc tính nhầm ở bước cuối.",
  "Quên điều kiện xác định hoặc chưa kiểm tra nghiệm.",
  "Thiếu kết luận.",
  "Chữ viết khó đọc, cần trình bày rõ hơn.",
];
const STORAGE_KEY = "essay-comment-templates";

function loadCustom(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 30) : [];
  } catch {
    return [];
  }
}

/** Nhận xét mẫu: bấm để chèn vào ô nhận xét; nhận xét hay thì lưu thành mẫu riêng (lưu trên trình duyệt này). */
export default function CommentTemplates({ current, onPick }: { current: string; onPick: (text: string) => void }) {
  const [custom, setCustom] = useState<string[]>(loadCustom);
  const persist = (next: string[]) => {
    setCustom(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* trình duyệt chặn lưu: bỏ qua */ }
  };
  const draft = current.trim();
  const canSave = draft.length > 0 && draft.length <= 200 && !DEFAULTS.includes(draft) && !custom.includes(draft);
  const chip = "inline-flex min-h-8 max-w-full items-center rounded-full border border-gray-200 bg-white px-2.5 text-left text-xs text-gray-700 transition hover:border-brand-300 hover:bg-brand-50";
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Nhận xét mẫu">
      {DEFAULTS.map((text) => <button key={text} type="button" onClick={() => onPick(text)} className={chip}>{text}</button>)}
      {custom.map((text) => (
        <span key={text} className="inline-flex max-w-full items-center rounded-full border border-violet-200 bg-violet-50">
          <button type="button" onClick={() => onPick(text)} className="min-h-8 truncate pl-2.5 pr-1 text-left text-xs text-violet-800">{text}</button>
          <button type="button" onClick={() => persist(custom.filter((item) => item !== text))} aria-label={`Xóa mẫu: ${text}`} className="flex h-8 w-7 items-center justify-center text-violet-500 hover:text-rose-600"><X size={13} aria-hidden="true" /></button>
        </span>
      ))}
      {canSave && (
        <button type="button" onClick={() => persist([...custom, draft])} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed border-violet-300 px-2.5 text-xs font-semibold text-violet-700 hover:bg-violet-50">
          <Plus size={13} aria-hidden="true" />Lưu nhận xét này làm mẫu
        </button>
      )}
    </div>
  );
}
