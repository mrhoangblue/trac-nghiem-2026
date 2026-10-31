"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, Clock3, FileQuestion, Hourglass, Lock } from "lucide-react";
import ExamPartsBar from "@/components/ExamPartsBar";
import { trackSpotlight } from "@/utils/spotlight";
import type { ClassExamStatus, ClassExamSummary } from "@/utils/classroomTypes";

const STATUS_STYLE: Record<ClassExamStatus, { label: string; chip: string; accent: string }> = {
  open: { label: "Đang mở", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", accent: "from-emerald-400 to-teal-500" },
  upcoming: { label: "Sắp mở", chip: "bg-indigo-50 text-indigo-700 ring-indigo-200", accent: "from-indigo-500 to-violet-500" },
  closed: { label: "Đã đóng", chip: "bg-gray-100 text-gray-600 ring-gray-200", accent: "from-gray-300 to-gray-400" },
};

// Đồng hồ theo phút cho nhãn "còn lại"; phía máy chủ trả 0 để không lệch hydrate.
function subscribeMinute(onChange: () => void) {
  const timer = window.setInterval(onChange, 30_000);
  return () => window.clearInterval(timer);
}
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;
export function useMinuteNow() {
  return useSyncExternalStore(subscribeMinute, minuteNow, () => 0);
}

function parseTime(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function shortDate(value: string | null, fallback: string): string {
  const time = parseTime(value);
  if (time === null) return fallback;
  return new Date(time).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

export function duration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} giờ`;
  return `${Math.round(hours / 24)} ngày`;
}

/** Thẻ bài thi được giao cho lớp. */
export default function ClassExamCard({ exam, href, canEdit }: { exam: ClassExamSummary; href: string; canEdit: boolean }) {
  const now = useMinuteNow();
  const style = STATUS_STYLE[exam.status];
  const start = parseTime(exam.startTime);
  const end = parseTime(exam.endTime);
  const canOpen = canEdit || exam.status === "open" || exam.submitted;

  let countdown = "";
  if (now) {
    if (exam.status === "open") countdown = end ? `Còn ${duration(end - now)}` : "Không giới hạn thời gian";
    else if (exam.status === "upcoming" && start) countdown = `Mở sau ${duration(start - now)}`;
    else if (exam.status === "closed" && end) countdown = `Đóng ${duration(now - end)} trước`;
  }
  const elapsed = now && exam.status === "open" && start && end && end > start
    ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100))
    : null;

  const buttonLabel = canEdit ? "Kết quả" : exam.submitted ? "Xem lại" : "Làm bài";

  return (
    <article onPointerMove={trackSpotlight} className="edu-card group flex overflow-hidden rounded-2xl">
      <div aria-hidden="true" className={`w-1.5 shrink-0 bg-gradient-to-b ${style.accent}`} />
      <div className="relative z-[3] flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${style.chip}`}>
            {exam.status === "open" ? (
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" /></span>
            ) : exam.status === "upcoming" ? <CalendarClock size={12} aria-hidden="true" /> : <Lock size={11} aria-hidden="true" />}
            {style.label}
          </span>
          {exam.submitted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm shadow-indigo-500/30">
              <CheckCircle2 size={12} aria-hidden="true" />
              {typeof exam.totalScore === "number" ? `${String(exam.totalScore).replace(".", ",")} điểm` : "Chờ chấm"}
            </span>
          )}
        </div>

        <h3 className="mt-2 line-clamp-2 font-display text-[15px] font-bold leading-6 text-gray-900 transition-colors group-hover:text-brand-700" title={exam.title}>{exam.title}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-gray-500">
          <span className="inline-flex items-center gap-1"><FileQuestion size={13} aria-hidden="true" className="text-brand-500" />{exam.questionCount} câu</span>
          <span className="inline-flex items-center gap-1"><Clock3 size={13} aria-hidden="true" className="text-brand-500" />{exam.duration ? `${exam.duration} phút` : "Không giới hạn"}</span>
        </p>
        {exam.partCounts && <ExamPartsBar counts={exam.partCounts} compact className="mt-2.5" />}

        <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-[11px] ring-1 ring-gray-100">
          <p className="flex items-center gap-1.5 font-semibold tabular-nums text-gray-700">
            <span className="truncate">{shortDate(exam.startTime, "Mở ngay")}</span>
            <ArrowRight size={11} aria-hidden="true" className="shrink-0 text-gray-300" />
            <span className="truncate">{shortDate(exam.endTime, "Không hạn")}</span>
          </p>
          {elapsed !== null && (
            <div aria-hidden="true" className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" style={{ width: `${elapsed}%` }} />
            </div>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <p className={`inline-flex min-w-0 items-center gap-1 text-xs font-semibold ${exam.status === "open" ? "text-emerald-700" : exam.status === "upcoming" ? "text-indigo-700" : "text-gray-500"}`}>
            {countdown && <><Hourglass size={12} aria-hidden="true" className="shrink-0" /><span className="truncate">{countdown}</span></>}
          </p>
          {canOpen ? (
            <Link href={href} aria-label={`${buttonLabel}: ${exam.title}`} className="edu-btn inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold text-white">
              {buttonLabel}<ArrowRight size={14} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <span className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-gray-100 px-3 text-xs font-semibold text-gray-500">
              {exam.status === "upcoming" ? <><CalendarClock size={13} aria-hidden="true" />Chưa mở</> : <><Lock size={12} aria-hidden="true" />Đã đóng</>}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
