"use client";

import { useEffect, useRef, useState } from "react";
import { authedFetch } from "@/lib/staffApi";

/** Gọi API quản trị; trả về dữ liệu hoặc ném mã lỗi của máy chủ. */
export async function systemRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authedFetch(path, init);
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error ?? "REQUEST_FAILED");
  return payload;
}

/** Tải dữ liệu một lần khi mở trang; giữ dữ liệu cũ khi tải lại. */
export function useSystemData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    systemRequest<T>(path)
      .then((value) => { if (!cancelled) { setData(value); setError(""); } })
      .catch(() => { if (!cancelled) setError("Không tải được dữ liệu. Thử lại sau."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path, tick]);
  return { data, error, loading, reload: () => { setLoading(true); setTick((value) => value + 1); } };
}

export const fmtNum = (value: number) => value.toLocaleString("vi-VN");
export const fmtCompact = (value: number) => new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
export const fmtDate = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
export const fmtDateTime = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
export function fmtBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
export function fmtAgo(ms: number | null | undefined): string {
  if (!ms) return "—";
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "Hôm nay";
  if (days < 30) return `${days} ngày trước`;
  return fmtDate(ms);
}

export function Panel({ title, action, children, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-soft)] ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-display text-sm font-bold text-gray-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Thay đổi so với kỳ trước: nền nhỏ hơn 5 thì chỉ nêu số kỳ trước bằng chữ xám, không báo phần trăm. */
export function Delta({ current, previous, goodWhenUp = true }: { current: number; previous: number; goodWhenUp?: boolean }) {
  if (previous < 5) return <span className="text-xs text-gray-400">kỳ trước {fmtNum(previous)}</span>;
  const change = ((current - previous) / previous) * 100;
  const up = change >= 0;
  const good = up === goodWhenUp;
  return (
    <span className={`text-xs font-semibold tabular-nums ${change === 0 ? "text-gray-400" : good ? "text-emerald-700" : "text-rose-700"}`}>
      {up ? "▲" : "▼"} {Math.abs(Math.round(change))}% <span className="font-normal text-gray-400">so với 7 ngày trước</span>
    </span>
  );
}

export function Kpi({ label, value, icon: Icon, footer, tone = "default" }: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>;
  footer?: React.ReactNode;
  tone?: "default" | "warn";
}) {
  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-[var(--shadow-soft)] ${tone === "warn" ? "border-amber-300" : "border-gray-200"}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500">{label}</p>
        {Icon && <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"}`}><Icon size={15} aria-hidden="true" /></span>}
      </div>
      <p className="mt-1.5 font-display text-2xl font-extrabold tabular-nums text-gray-900">{value}</p>
      {footer && <div className="mt-1 min-h-4">{footer}</div>}
    </div>
  );
}

/** Biểu đồ cột theo ngày bằng SVG: cột xám nhạt, cột cuối đậm; rê chuột xem số liệu chính xác. */
export function BarChart({ points, height = 120, color = "#4f46e5" }: { points: Array<{ label: string; value: number }>; height?: number; color?: string }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const width = 600;
  const gap = 3;
  const barWidth = Math.max(2, (width - gap * (points.length - 1)) / Math.max(1, points.length));
  const total = points.reduce((sum, point) => sum + point.value, 0);
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full" role="img" aria-label={`Biểu đồ cột, tổng ${total}`} preserveAspectRatio="none">
        {points.map((point, index) => {
          const barHeight = point.value === 0 ? 2 : Math.max(3, (point.value / max) * (height - 6));
          return (
            <rect key={point.label} x={index * (barWidth + gap)} y={height - barHeight} width={barWidth} height={barHeight} rx={2}
              fill={color} fillOpacity={index === points.length - 1 ? 1 : 0.3}>
              <title>{`${point.label}: ${fmtNum(point.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-gray-400">
        <span>{points[0]?.label.slice(5).split("-").reverse().join("/")}</span>
        <span className="font-semibold text-gray-600">{fmtNum(total)}</span>
        <span>{points[points.length - 1]?.label.slice(5).split("-").reverse().join("/")}</span>
      </div>
    </div>
  );
}

export function Pill({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "indigo" | "green" | "amber" | "rose" }) {
  const tones = { gray: "bg-gray-100 text-gray-600", indigo: "bg-indigo-50 text-indigo-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-800", rose: "bg-rose-50 text-rose-700" };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
}

export function StateBox({ loading, error, onRetry, empty }: { loading?: boolean; error?: string; onRetry?: () => void; empty?: string }) {
  if (loading) return <p role="status" className="py-10 text-center text-sm text-gray-400">Đang tải…</p>;
  if (error) return (
    <div role="alert" className="py-10 text-center text-sm text-rose-700">
      {error} {onRetry && <button type="button" onClick={onRetry} className="ml-1 font-semibold underline">Thử lại</button>}
    </div>
  );
  return empty ? <p className="py-10 text-center text-sm text-gray-400">{empty}</p> : null;
}

/** Hộp xác nhận có ô lý do; lý do được ghi vào nhật ký quản trị. */
export function ReasonDialog({ title, detail, confirmLabel, danger, requireReason, onCancel, onConfirm }: {
  title: string;
  detail?: string;
  confirmLabel: string;
  danger?: boolean;
  requireReason?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const disabled = busy || (requireReason === true && reason.trim().length < 3);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 p-3 sm:items-center" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="font-display text-base font-bold text-gray-900">{title}</h2>
        {detail && <p className="mt-1 break-words text-sm text-gray-500">{detail}</p>}
        <textarea ref={ref} value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={300}
          placeholder={requireReason ? "Lý do (bắt buộc)" : "Lý do (không bắt buộc)"} aria-label="Lý do"
          className="mt-3 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-11 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700">Hủy</button>
          <button type="button" disabled={disabled} onClick={async () => { setBusy(true); try { await onConfirm(reason.trim()); } finally { setBusy(false); } }}
            className={`h-11 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50 ${danger ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"}`}>{busy ? "Đang xử lý…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
