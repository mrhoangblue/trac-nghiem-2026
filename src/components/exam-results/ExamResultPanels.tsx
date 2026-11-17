"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Check, ChevronDown, Copy, Crosshair, ListChecks, Search, UserX, Users } from "lucide-react";
import type { ClassBreakdown, ClassRoster, QuestionStat, ScoreSummary, SortKey } from "@/utils/examResultStats";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];
const number = (value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const percent = (value: number) => `${Math.round(value * 100)}%`;

/** Nhãn "ngoài các lớp được giao" trong ô lọc lớp. */
export const NO_CLASS = "__none__";

// ── Ô lọc lớp + tìm học sinh ──────────────────────────────────────────────────

export function ResultFilters({ classes, classFilter, onClass, lockedClass, search, onSearch }: {
  classes: ClassRoster[];
  classFilter: string;
  onClass: (value: string) => void;
  /** Trang mở từ một lớp cụ thể: máy chủ đã lọc sẵn, không đổi lớp ở đây. */
  lockedClass: boolean;
  search: string;
  onSearch: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {classes.length > 0 && !lockedClass && (
        <label className="relative block">
          <span className="sr-only">Lọc theo lớp</span>
          <Users size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <select
            value={classFilter}
            onChange={(event) => onClass(event.target.value)}
            className="w-full appearance-none rounded-xl border-2 border-gray-200 bg-white py-2 pl-9 pr-9 text-sm font-semibold text-gray-800 outline-none transition focus:border-brand-500 sm:w-52"
          >
            <option value="">Tất cả lớp</option>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            <option value={NO_CLASS}>Ngoài các lớp được giao</option>
          </select>
          <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        </label>
      )}
      <label className="relative block">
        <span className="sr-only">Tìm học sinh</span>
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Tìm tên hoặc email…"
          className="w-full rounded-xl border-2 border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 sm:w-60"
        />
      </label>
    </div>
  );
}

// ── Tiêu đề cột bấm để sắp xếp ────────────────────────────────────────────────

export function SortHeader({ label, sortKey, sort, onSort, align = "center", className = "" }: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; direction: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  align?: "left" | "center";
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`px-2 py-3 font-semibold ${align === "left" ? "text-left" : "text-center"} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Sắp xếp theo ${label.toLowerCase()}`}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 uppercase tracking-wider transition hover:bg-gray-200/70 hover:text-gray-800 ${active ? "text-brand-700" : ""}`}
      >
        {label}
        <Icon size={12} className={active ? "" : "opacity-40"} aria-hidden="true" />
      </button>
    </th>
  );
}

// ── Phổ điểm, điểm từng phần, câu khó ─────────────────────────────────────────

export function ResultAnalytics({ summary, stats, parts, scopeLabel }: {
  summary: ScoreSummary;
  stats: QuestionStat[];
  /** Điểm tối đa từng phần; phần không có câu thì bỏ qua. */
  parts: Array<{ label: string; average: number; max: number; tone: string; bar: string }>;
  scopeLabel: string;
}) {
  const hardest = [...stats].sort((a, b) => a.rate - b.rate || a.number - b.number).slice(0, 3);
  return (
    <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 font-extrabold text-gray-800">
          <BarChart3 size={18} className="text-brand-500" aria-hidden="true" /> Phổ điểm
          <span className="ml-auto text-xs font-semibold text-gray-400">{scopeLabel}</span>
        </h2>
        <div className="mb-4 flex items-center gap-4">
          <div className="text-center">
            <p className="text-4xl font-extrabold tabular-nums text-brand-700">{number(summary.average)}</p>
            <p className="mt-1 text-xs text-gray-400">Điểm trung bình</p>
          </div>
          <div className="grid flex-1 grid-cols-3 gap-2 text-center text-sm">
            {[
              { value: summary.high, label: "Giỏi (≥8)", cls: "border-success-100 bg-success-50 text-success-700" },
              { value: summary.mid, label: "TB (5–8)", cls: "border-yellow-100 bg-yellow-50 text-yellow-700" },
              { value: summary.low, label: "Yếu (<5)", cls: "border-danger-100 bg-danger-50 text-danger-700" },
            ].map((item) => (
              <div key={item.label} className={`rounded-xl border py-3 ${item.cls}`}>
                <p className="text-xl font-extrabold tabular-nums">{item.value}</p>
                <p className="mt-0.5 text-xs font-medium">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`Giỏi ${summary.high}, trung bình ${summary.mid}, yếu ${summary.low}`}>
          <div className="h-full bg-success-400" style={{ width: `${(summary.high / summary.count) * 100}%` }} />
          <div className="h-full bg-yellow-400" style={{ width: `${(summary.mid / summary.count) * 100}%` }} />
          <div className="h-full bg-danger-400" style={{ width: `${(summary.low / summary.count) * 100}%` }} />
        </div>
        <dl className="mt-4 grid grid-cols-4 gap-2 text-center text-xs text-gray-500">
          {[
            ["Cao nhất", number(summary.highest)],
            ["Trung vị", number(summary.median)],
            ["Thấp nhất", number(summary.lowest)],
            ["Đạt ≥5", percent(summary.passRate)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-gray-50 px-2 py-2">
              <dd className="text-sm font-extrabold tabular-nums text-gray-800">{value}</dd>
              <dt className="mt-0.5">{label}</dt>
            </div>
          ))}
        </dl>
        {parts.length > 0 && (
          <div className="mt-5 space-y-2.5 border-t border-gray-100 pt-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Trung bình từng phần</p>
            {parts.map((part) => (
              <div key={part.label} className="flex items-center gap-3 text-sm">
                <span className={`w-16 shrink-0 font-bold ${part.tone}`}>{part.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full rounded-full ${part.bar}`} style={{ width: `${part.max > 0 ? Math.min(100, (part.average / part.max) * 100) : 0}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right tabular-nums text-gray-700"><strong>{number(part.average)}</strong> / {number(part.max)} đ</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 font-extrabold text-gray-800">
          <Crosshair size={18} className="text-danger-500" aria-hidden="true" /> 3 câu sai nhiều nhất
        </h2>
        {hardest.length === 0 ? (
          <p className="text-sm text-gray-400">Đề không có câu chấm tự động.</p>
        ) : (
          <div className="space-y-3.5">
            {hardest.map((question, index) => {
              const wrong = 1 - question.rate;
              return (
                <div key={question.number} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger-50 text-xs font-extrabold text-danger-700">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-gray-800">Câu {question.number}<span className="ml-1.5 text-xs font-semibold text-gray-400">({question.part})</span></span>
                      <span className="text-sm font-extrabold tabular-nums text-danger-600">{percent(wrong)} sai</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-danger-400" style={{ width: percent(wrong) }} /></div>
                    <p className="mt-1 text-xs text-gray-500">
                      {question.total - question.correct}/{question.total} học sinh làm sai
                      {question.topWrong && <> · hay chọn nhầm <strong className="text-danger-700">{OPTION_LETTERS[question.topWrong.option]}</strong> ({question.topWrong.count} em)</>}
                      {question.part === "P2" && typeof question.averageMatches === "number" && <> · trung bình đúng {number(question.averageMatches)}/4 ý</>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Tỉ lệ đúng của mọi câu ────────────────────────────────────────────────────

export function QuestionBreakdown({ stats, p1Correct }: { stats: QuestionStat[]; p1Correct: Array<number | null> }) {
  const [open, setOpen] = useState(false);
  if (stats.length === 0) return null;
  const hasChoices = stats.some((item) => item.choices);
  const tone = (rate: number) => (rate >= 0.7 ? "bg-success-400" : rate >= 0.4 ? "bg-yellow-400" : "bg-danger-400");
  return (
    <section className="mb-6 overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-2 px-6 py-4 text-left transition hover:bg-gray-50">
        <ListChecks size={18} className="text-brand-500" aria-hidden="true" />
        <span className="font-extrabold text-gray-800">Tỉ lệ đúng từng câu</span>
        <span className="text-xs font-semibold text-gray-400">{stats.length} câu{hasChoices ? " · có phương án học sinh chọn" : ""}</span>
        <ChevronDown size={18} className={`ml-auto text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <th scope="col" className="px-6 py-2.5 text-left font-semibold">Câu</th>
                <th scope="col" className="px-3 py-2.5 text-left font-semibold">Tỉ lệ đúng</th>
                <th scope="col" className="px-3 py-2.5 text-center font-semibold">Đúng</th>
                {hasChoices && <th scope="col" className="px-3 py-2.5 text-left font-semibold">Học sinh chọn</th>}
                <th scope="col" className="px-6 py-2.5 text-left font-semibold">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats.map((item) => (
                <tr key={item.number}>
                  <td className="whitespace-nowrap px-6 py-2.5 font-bold text-gray-800">Câu {item.number}<span className="ml-1.5 text-xs font-semibold text-gray-400">{item.part}</span></td>
                  <td className="px-3 py-2.5">
                    <div className="flex min-w-40 items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${tone(item.rate)}`} style={{ width: percent(item.rate) }} /></div>
                      <span className="w-10 text-right text-xs font-bold tabular-nums text-gray-700">{percent(item.rate)}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-center tabular-nums text-gray-600">{item.correct}/{item.total}</td>
                  {hasChoices && (
                    <td className="px-3 py-2.5">
                      {item.choices ? (
                        <div className="flex flex-wrap gap-1.5">
                          {item.choices.map((count, option) => {
                            const right = p1Correct[item.number - 1] === option;
                            return (
                              <span key={option} title={right ? "Đáp án đúng" : undefined} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${right ? "bg-success-100 text-success-800" : count > 0 ? "bg-danger-50 text-danger-700" : "bg-gray-100 text-gray-400"}`}>
                                {OPTION_LETTERS[option]} {count}{right && <Check size={11} aria-hidden="true" />}
                              </span>
                            );
                          })}
                          {(item.blank ?? 0) > 0 && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-500">Bỏ trống {item.blank}</span>}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  <td className="px-6 py-2.5 text-xs text-gray-500">
                    {item.topWrong ? <>Hay nhầm sang <strong className="text-danger-700">{OPTION_LETTERS[item.topWrong.option]}</strong></>
                      : item.part === "P2" && typeof item.averageMatches === "number" ? <>Trung bình đúng {number(item.averageMatches)}/4 ý</>
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── So sánh lớp + ai chưa nộp ─────────────────────────────────────────────────

export function ClassPanels({ breakdown, classFilter, onClass, lockedClass }: {
  breakdown: ClassBreakdown[];
  classFilter: string;
  onClass: (value: string) => void;
  lockedClass: boolean;
}) {
  const [copied, setCopied] = useState("");
  if (breakdown.length === 0) return null;
  const shown = breakdown.filter((item) => !classFilter || classFilter === NO_CLASS || item.id === classFilter);
  const missingGroups = (classFilter === NO_CLASS ? [] : shown).filter((item) => item.missing.length > 0);
  const copy = async (item: ClassBreakdown) => {
    try {
      await navigator.clipboard.writeText(item.missing.map((student) => student.name).join("\n"));
      setCopied(item.id);
      window.setTimeout(() => setCopied(""), 2000);
    } catch { /* trình duyệt chặn clipboard: danh sách vẫn hiện để chép tay */ }
  };
  return (
    <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <h2 className="flex items-center gap-2 px-6 py-4 font-extrabold text-gray-800">
          <Users size={18} className="text-brand-500" aria-hidden="true" /> {breakdown.length > 1 ? "So sánh các lớp" : "Lớp được giao"}
        </h2>
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <th scope="col" className="px-6 py-2.5 text-left font-semibold">Lớp</th>
                <th scope="col" className="px-3 py-2.5 text-center font-semibold">Đã nộp</th>
                <th scope="col" className="px-3 py-2.5 text-center font-semibold">Điểm TB</th>
                <th scope="col" className="px-3 py-2.5 text-center font-semibold">Đạt ≥5</th>
                <th scope="col" className="px-3 py-2.5 text-center font-semibold">Giỏi ≥8</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {breakdown.map((item) => {
                const active = classFilter === item.id;
                return (
                  <tr key={item.id} className={active ? "bg-brand-50/60" : ""}>
                    <td className="px-6 py-2.5">
                      {lockedClass ? <span className="font-bold text-gray-800">{item.name}</span> : (
                        <button type="button" onClick={() => onClass(active ? "" : item.id)} title={active ? "Bỏ lọc lớp này" : "Chỉ xem lớp này"} className="font-bold text-brand-700 hover:underline">{item.name}</button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums">
                      <span className="font-bold text-gray-800">{item.submitted}</span><span className="text-gray-400">/{item.rosterSize}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-extrabold tabular-nums text-brand-700">{item.summary.count ? number(item.summary.average) : "—"}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-gray-700">{item.summary.count ? percent(item.summary.passRate) : "—"}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-gray-700">{item.summary.count ? item.summary.high : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 font-extrabold text-gray-800">
          <UserX size={18} className="text-amber-500" aria-hidden="true" /> Chưa nộp bài
          <span className="ml-auto rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">{missingGroups.reduce((sum, item) => sum + item.missing.length, 0)} học sinh</span>
        </h2>
        {missingGroups.length === 0 ? (
          <p className="text-sm text-gray-500">{classFilter === NO_CLASS ? "Chọn một lớp để xem ai chưa nộp." : "Cả lớp đã nộp bài."}</p>
        ) : (
          <div className="max-h-64 space-y-4 overflow-y-auto pr-1">
            {missingGroups.map((item) => (
              <div key={item.id}>
                <div className="mb-1.5 flex items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{item.name} · {item.missing.length}/{item.rosterSize}</p>
                  <button type="button" onClick={() => void copy(item)} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600 transition hover:border-brand-300 hover:text-brand-700">
                    {copied === item.id ? <><Check size={12} aria-hidden="true" />Đã chép</> : <><Copy size={12} aria-hidden="true" />Chép tên</>}
                  </button>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {item.missing.map((student) => (
                    <li key={student.uid} title={student.email} className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-100">{student.name}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
