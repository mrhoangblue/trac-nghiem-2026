"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import AdminGuard from "@/components/AdminGuard";
import { authedFetch } from "@/lib/staffApi";
import { useAuth } from "@/lib/AuthContext";
import { collection, getDocs, orderBy, query, Timestamp } from "firebase/firestore";
import StateIcon from "@/components/StateIcon";
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardList, FileCheck2, GraduationCap, PenTool, Plus, TrendingDown, UserCheck, Users } from "lucide-react";
import type { AttentionReason } from "@/utils/teacherInsights";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ExamRow {
  id: string;
  title: string;
  createdAt: Timestamp | null;
  questionCount: number;
}

interface Overview {
  totals: { exams: number; submissions: number; students: number; classes: number; classStudents: number };
  perExam: Record<string, { submissions: number; students: number; pendingEssays: number; average: number | null }>;
  todo: {
    pendingEssays: Array<{ examId: string; title: string; count: number }>;
    pendingMembers: Array<{ classId: string; name: string; count: number }>;
    closingSoon: Array<{ examId: string; title: string; endMillis: number; students: number }>;
  };
  attention: Array<{
    studentId: string | null;
    name: string;
    email: string;
    classNames: string[];
    reasons: AttentionReason[];
    recentAverage: number | null;
    drop: number;
    assigned: number;
    missed: number;
    scores: Array<{ title: string; total: number }>;
  }>;
}

const RECENT_EXAMS = 6;
const number = (value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

function formatDate(ts: Timestamp | null): string {
  if (!ts) return "—";
  return ts.toDate().toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function timeLeft(endMillis: number): string {
  const hours = Math.max(0, (endMillis - Date.now()) / 3_600_000);
  return hours < 1 ? `còn ${Math.max(1, Math.round(hours * 60))} phút` : `còn ${Math.round(hours)} giờ`;
}

/** Đường điểm các đề gần nhất (thang 10), cũ bên trái. */
function ScoreTrend({ scores }: { scores: Array<{ title: string; total: number }> }) {
  if (scores.length === 0) return <span className="text-xs text-gray-300">Chưa có điểm</span>;
  const width = 84;
  const height = 28;
  const x = (index: number) => (scores.length === 1 ? width / 2 : 4 + (index * (width - 8)) / (scores.length - 1));
  const y = (total: number) => height - 4 - (Math.max(0, Math.min(10, total)) / 10) * (height - 8);
  const last = scores[scores.length - 1];
  return (
    <div className="flex items-center gap-2" title={scores.map((point) => `${point.title}: ${number(point.total)}`).join("\n")}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Điểm ${scores.length} đề gần nhất: ${scores.map((point) => number(point.total)).join(", ")}`}>
        <line x1="0" x2={width} y1={y(5)} y2={y(5)} className="stroke-gray-200" strokeDasharray="3 3" />
        {scores.length > 1 && <polyline fill="none" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" className="stroke-brand-400" points={scores.map((point, index) => `${x(index)},${y(point.total)}`).join(" ")} />}
        {scores.map((point, index) => (
          <circle key={index} cx={x(index)} cy={y(point.total)} r={index === scores.length - 1 ? 3 : 2} className={index === scores.length - 1 ? (point.total < 5 ? "fill-danger-500" : "fill-brand-600") : "fill-brand-300"} />
        ))}
      </svg>
      <span className={`text-sm font-extrabold tabular-nums ${last.total < 5 ? "text-danger-600" : "text-gray-800"}`}>{number(last.total)}</span>
    </div>
  );
}

const REASON_LABEL: Record<AttentionReason, (item: Overview["attention"][number]) => string> = {
  dropping: (item) => `Giảm ${number(item.drop)} điểm so với các đề trước`,
  low: (item) => `Trung bình gần đây ${number(item.recentAverage ?? 0)}`,
  missing: (item) => `Chưa nộp ${item.missed}/${item.assigned} đề được giao`,
};
const REASON_TONE: Record<AttentionReason, string> = {
  dropping: "bg-orange-50 text-orange-800 ring-orange-100",
  low: "bg-danger-50 text-danger-700 ring-danger-100",
  missing: "bg-amber-50 text-amber-800 ring-amber-100",
};

// ── Dashboard Page ────────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [examSnap, response] = await Promise.all([
          getDocs(query(collection(db, "exams"), orderBy("createdAt", "desc"))),
          authedFetch("/api/staff/overview"),
        ]);
        const payload = response.ok ? await response.json().catch(() => null) as Overview | null : null;
        if (cancelled) return;
        setOverview(payload);
        setFailed(!payload);
        setExams(examSnap.docs.map((document) => {
          const data = document.data();
          return {
            id: document.id,
            title: data.title ?? "Không có tên",
            createdAt: data.createdAt ?? null,
            questionCount: data.questionCount ?? (Array.isArray(data.questions) ? data.questions.length : 0),
          };
        }));
      } catch (error) {
        console.error("Lỗi tải bảng điều khiển:", error);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [authLoading, user]);

  // Chỉ hiện đề người dùng có quyền xem kết quả (giáo viên: đề của mình).
  const myExams = overview ? exams.filter((exam) => overview.perExam[exam.id]) : exams;
  const recent = myExams.slice(0, RECENT_EXAMS);
  const todo = overview?.todo;
  const todoCount = todo ? todo.pendingEssays.length + todo.pendingMembers.length + todo.closingSoon.length : 0;
  const totals = overview?.totals;

  return (
    <AdminGuard>
    <div className="workspace-page max-w-6xl mx-auto px-4 py-8 sm:py-10 w-full">
      <div className="workspace-header flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">Bảng điều khiển</h1>
          <p className="text-gray-500 mt-1">Việc cần làm hôm nay, tình hình các đề và học sinh cần chú ý.</p>
        </div>
        <Link href="/admin/create-exam" className="edu-btn inline-flex min-h-12 items-center gap-2 rounded-xl px-6 font-semibold text-white">
          <Plus size={18} aria-hidden="true" /> Tạo bài thi mới
        </Link>
      </div>

      {failed && !loading && (
        <p className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-900" role="alert">
          Không tải được số liệu tổng quan. Thử tải lại trang.
        </p>
      )}

      {/* Số liệu */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Đề đã tạo", value: totals?.exams, hint: "", Icon: ClipboardList, gradient: "from-indigo-500 to-violet-500 shadow-indigo-500/30" },
          { label: "Lượt nộp bài", value: totals?.submissions, hint: "", Icon: FileCheck2, gradient: "from-emerald-400 to-teal-500 shadow-emerald-500/30" },
          { label: "Học sinh đã làm bài", value: totals?.students, hint: "Mỗi học sinh tính một lần", Icon: GraduationCap, gradient: "from-sky-400 to-blue-500 shadow-sky-500/30" },
          { label: "Học sinh trong lớp", value: totals?.classStudents, hint: totals ? `${totals.classes} lớp` : "", Icon: Users, gradient: "from-fuchsia-500 to-pink-500 shadow-fuchsia-500/30" },
        ].map(({ label, value, hint, Icon, gradient }) => (
          <div key={label} className="flex items-center gap-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-soft)]">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${gradient}`}><Icon size={22} aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="font-display text-3xl font-extrabold leading-none tabular-nums text-gray-900">{loading ? "…" : value ?? "—"}</p>
              <p className="mt-1.5 text-sm text-gray-500">{label}</p>
              {hint && <p className="text-xs text-gray-400">{hint}</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Việc cần làm */}
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-[var(--shadow-soft)]">
          <h2 className="mb-4 flex items-center gap-2 font-extrabold text-gray-800">
            Việc cần làm
            {todoCount > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">{todoCount}</span>}
          </h2>
          {loading ? (
            <p className="text-sm text-gray-400">Đang tải…</p>
          ) : !todo || todoCount === 0 ? (
            <p className="flex items-center gap-2 text-sm text-gray-500"><CheckCircle2 size={18} className="text-success-500" aria-hidden="true" />Không có bài chờ chấm, yêu cầu vào lớp hay đề sắp đóng.</p>
          ) : (
            <ul className="space-y-2">
              {todo.pendingEssays.map((item) => (
                <li key={`essay-${item.examId}`}>
                  <Link href={`/admin/grade/${item.examId}`} className="group flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 transition hover:border-violet-300">
                    <PenTool size={18} className="shrink-0 text-violet-600" aria-hidden="true" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-gray-900">{item.title}</span><span className="text-xs text-violet-800">{item.count} bài tự luận chờ chấm</span></span>
                    <ArrowRight size={16} className="shrink-0 text-violet-400 transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
              {todo.pendingMembers.map((item) => (
                <li key={`member-${item.classId}`}>
                  <Link href={`/teacher/classes/${item.classId}`} className="group flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3 transition hover:border-amber-300">
                    <UserCheck size={18} className="shrink-0 text-amber-600" aria-hidden="true" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-gray-900">{item.name}</span><span className="text-xs text-amber-800">{item.count} học sinh chờ duyệt vào lớp</span></span>
                    <ArrowRight size={16} className="shrink-0 text-amber-400 transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
              {todo.closingSoon.map((item) => (
                <li key={`close-${item.examId}`}>
                  <Link href={`/admin/exam/${item.examId}`} className="group flex items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-3 transition hover:border-sky-300">
                    <CalendarClock size={18} className="shrink-0 text-sky-600" aria-hidden="true" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-gray-900">{item.title}</span><span className="text-xs text-sky-800">Sắp đóng, {timeLeft(item.endMillis)} · {item.students} học sinh đã nộp</span></span>
                    <ArrowRight size={16} className="shrink-0 text-sky-400 transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Học sinh cần chú ý */}
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-[var(--shadow-soft)]">
          <h2 className="mb-1 flex items-center gap-2 font-extrabold text-gray-800"><TrendingDown size={18} className="text-danger-500" aria-hidden="true" />Học sinh cần chú ý</h2>
          <p className="mb-4 text-xs text-gray-400">Điểm giảm từ 1,5 so với các đề trước, trung bình gần đây dưới 5, hoặc bỏ từ 2 đề và ít nhất một nửa số đề đã giao cho lớp.</p>
          {loading ? (
            <p className="text-sm text-gray-400">Đang tải…</p>
          ) : !overview || overview.attention.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-gray-500"><CheckCircle2 size={18} className="text-success-500" aria-hidden="true" />Chưa có học sinh nào có dấu hiệu cần chú ý.</p>
          ) : (
            <ul className="max-h-[22rem] divide-y divide-gray-100 overflow-y-auto pr-1">
              {overview.attention.map((item) => {
                const body = (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-gray-900">{item.name}{item.classNames.length > 0 && <span className="ml-2 text-xs font-semibold text-gray-400">{item.classNames.join(", ")}</span>}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.reasons.map((reason) => (
                          <span key={reason} className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${REASON_TONE[reason]}`}>{REASON_LABEL[reason](item)}</span>
                        ))}
                      </div>
                    </div>
                    <ScoreTrend scores={item.scores} />
                  </>
                );
                return (
                  <li key={item.email || item.studentId || item.name}>
                    {item.studentId
                      ? <Link href={`/teacher/students/${item.studentId}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-gray-50">{body}</Link>
                      : <div className="flex items-center gap-3 py-2.5">{body}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Đề gần đây */}
      <div className="workspace-surface bg-white rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
          <h2 className="font-bold text-gray-800">Đề gần đây</h2>
          <Link href="/admin/exam-list" className="inline-flex items-center gap-1 text-sm font-bold text-brand-700 hover:underline">Tất cả {myExams.length} đề <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
            <p className="text-sm text-gray-500">Đang tải dữ liệu…</p>
          </div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center text-gray-400">
            <StateIcon icon="inbox" />
            <p>Chưa có bài thi nào. Hãy tạo bài thi đầu tiên!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th scope="col" className="text-left px-6 py-3 font-semibold">Tên bài thi</th>
                  <th scope="col" className="text-left px-4 py-3 font-semibold">Ngày tạo</th>
                  <th scope="col" className="text-center px-4 py-3 font-semibold">Số câu</th>
                  <th scope="col" className="text-center px-4 py-3 font-semibold">Học sinh</th>
                  <th scope="col" className="text-center px-4 py-3 font-semibold">Điểm TB</th>
                  <th scope="col" className="text-right px-6 py-3 font-semibold">Kết quả</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recent.map((exam) => {
                  const stats = overview?.perExam[exam.id];
                  return (
                    <tr key={exam.id} className="transition-colors hover:bg-brand-50/40">
                      <td className="px-6 py-3.5">
                        <Link href={`/admin/exam/${exam.id}`} className="font-semibold text-gray-900 hover:text-brand-700">{exam.title}</Link>
                        {(stats?.pendingEssays ?? 0) > 0 && <span className="ml-2 rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-bold text-violet-700">{stats!.pendingEssays} chờ chấm</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-gray-500">{formatDate(exam.createdAt)}</td>
                      <td className="px-4 py-3.5 text-center tabular-nums text-gray-700">{exam.questionCount}</td>
                      <td className="px-4 py-3.5 text-center tabular-nums font-bold text-gray-800">{stats?.students ?? "—"}</td>
                      <td className="px-4 py-3.5 text-center tabular-nums font-extrabold text-brand-700">{stats?.average != null ? number(stats.average) : "—"}</td>
                      <td className="px-6 py-3.5 text-right">
                        <Link href={`/admin/exam/${exam.id}`} className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-600 transition hover:border-brand-400 hover:text-brand-800">Chi tiết <ArrowRight size={13} aria-hidden="true" /></Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </AdminGuard>
  );
}
