"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { formatDateTime } from "@/utils/examTypes";
import StateIcon from "@/components/StateIcon";
import { FileCheck2, GraduationCap, Hourglass, TrendingUp, Trophy } from "lucide-react";

interface Submission {
  id: string;
  examId: string;
  examTitle: string;
  submittedAt: unknown; // Firestore Timestamp
  scores: {
    total: number;
    p1: number;
    p2: number;
    p3: number;
    /** Phần IV tự luận; null khi chưa chấm. */
    p4?: number | null;
  };
  /** "pending": bài tự luận chờ giáo viên chấm, chưa công bố điểm. */
  gradingStatus?: "pending" | "graded" | null;
  /** True when submitted by a teacher in student-preview mode */
  isTeacherPreview?: boolean;
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
        <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-gray-500 text-sm animate-pulse">Đang tải lịch sử bài làm…</p>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 8
      ? "bg-success-100 text-success-700 border-success-200"
      : score >= 5
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-danger-100 text-danger-600 border-danger-200";
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-extrabold border ${color}`}>
      {score}/10
    </span>
  );
}

export default function StudentHistoryPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const hasEssay = submissions.some((submission) => submission.gradingStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lắng nghe trạng thái đăng nhập
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Fetch submissions khi biết user
  useEffect(() => {
    if (!user?.email) return;

    const fetchSubmissions = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, "submissions"),
          where("studentEmail", "==", user.email)
        );
        const snap = await getDocs(q);
        const data = snap.docs
          .map((doc: QueryDocumentSnapshot<DocumentData>) => {
            const d = doc.data();
            return {
              id: doc.id,
              examId: d.examId ?? "",
              examTitle: d.examTitle ?? "Bài thi không có tên",
              submittedAt: d.submittedAt,
              scores: d.scores ?? { total: 0, p1: 0, p2: 0, p3: 0 },
              isTeacherPreview: d.isTeacherPreview === true,
              gradingStatus: d.gradingStatus === "pending" || d.gradingStatus === "graded" ? d.gradingStatus : null,
            } as Submission;
          })
          // Sort client-side: mới nhất trước (tránh cần composite index)
          .sort((a, b) => {
            const ts = (v: unknown) =>
              typeof (v as { toMillis?: unknown } | null)?.toMillis === "function"
                ? (v as { toMillis: () => number }).toMillis()
                : 0;
            return ts(b.submittedAt) - ts(a.submittedAt);
          });
        setSubmissions(data);
      } catch (err) {
        console.error(err);
        setError("Không thể tải lịch sử. Vui lòng thử lại sau.");
      } finally {
        setLoading(false);
      }
    };

    queueMicrotask(() => void fetchSubmissions());
  }, [user]);

  // ── Chưa đăng nhập ────────────────────────────────────────────────────────
  if (authLoading) return <Spinner />;

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        <StateIcon icon="lock" className="mb-6" />
        <h2 className="text-2xl font-extrabold text-gray-800 mb-3">Cần đăng nhập</h2>
        <p className="text-gray-500 mb-8">
          Vui lòng đăng nhập để xem lịch sử bài làm của bạn.
        </p>
        <Link
          href="/"
          className="px-8 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl transition-colors"
        >
          Về trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="workspace-page max-w-4xl mx-auto px-4 py-8 sm:py-10 w-full space-y-8">
      {/* Header */}
      <div className="workspace-header flex items-center gap-4">
        {user.photoURL && (
          <img
            src={user.photoURL}
            alt={user.displayName ?? "Avatar"}
            width={48}
            height={48}
            className="w-12 h-12 rounded-full border-2 border-brand-200"
            referrerPolicy="no-referrer"
          />
        )}
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">
            Lịch sử làm bài
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">{user.displayName} · {user.email}</p>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="text-center py-16">
          <StateIcon icon="alert" tone="danger" className="mb-4" />
          <p className="text-danger-500 font-medium">{error}</p>
        </div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
          <StateIcon icon="inbox" className="mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Chưa có bài nào</h2>
          <p className="text-gray-500 mb-8">Bạn chưa nộp bài thi nào. Hãy làm một bài ngay!</p>
          <Link
            href="/"
            className="px-8 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl transition-colors"
          >
            Chọn bài thi
          </Link>
        </div>
      ) : (
        <>
          {/* Tổng kết nhanh — only counts real (non-preview) submissions */}
          {(() => {
            // Bài chờ chấm tự luận chưa có điểm chính thức nên không tính vào thống kê.
            const real = submissions.filter((s) => !s.isTeacherPreview && s.gradingStatus !== "pending");
            const preview = submissions.filter((s) => s.isTeacherPreview);
            return (
              <>
                <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {[
                    { label: "Bài đã nộp", value: submissions.filter((s) => !s.isTeacherPreview).length, Icon: FileCheck2, gradient: "from-indigo-500 to-violet-500", shadow: "shadow-indigo-500/30" },
                    { label: "Điểm cao nhất", value: real.length > 0 ? Math.max(...real.map((s) => s.scores.total)) : "—", Icon: Trophy, gradient: "from-amber-400 to-orange-500", shadow: "shadow-orange-500/30" },
                    { label: "Điểm trung bình", value: real.length > 0 ? (real.reduce((sum, s) => sum + s.scores.total, 0) / real.length).toFixed(1) : "—", Icon: TrendingUp, gradient: "from-emerald-400 to-teal-500", shadow: "shadow-emerald-500/30" },
                  ].map(({ label, value, Icon, gradient, shadow }) => (
                    <div key={label} className="flex items-center gap-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${gradient} ${shadow}`}><Icon size={22} aria-hidden="true" /></span>
                      <div>
                        <p className="font-display text-3xl font-extrabold leading-none text-gray-900">{value}</p>
                        <p className="mt-1.5 text-sm text-gray-500">{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {preview.length > 0 && (
                  <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
                    <GraduationCap size={16} className="shrink-0" aria-hidden="true" />
                    <span>Có {preview.length} bài làm từ <strong>Chế độ học sinh</strong> (được đánh dấu &ldquo;Xem trước&rdquo;) — chỉ giáo viên/admin thấy.</span>
                  </div>
                )}
              </>
            );
          })()}

          {/* Bảng lịch sử */}
          <div className="workspace-surface bg-white rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-4 font-bold text-gray-600">Bài thi</th>
                    <th className="text-center px-4 py-4 font-bold text-gray-600 whitespace-nowrap">
                      Thời gian nộp
                    </th>
                    <th className="text-center px-4 py-4 font-bold text-brand-600 whitespace-nowrap">
                      P1
                    </th>
                    <th className="text-center px-4 py-4 font-bold text-amber-600 whitespace-nowrap">
                      P2
                    </th>
                    <th className="text-center px-4 py-4 font-bold text-success-600 whitespace-nowrap">
                      P3
                    </th>
                    {hasEssay && (
                      <th className="text-center px-4 py-4 font-bold text-violet-600 whitespace-nowrap">
                        P4
                      </th>
                    )}
                    <th className="text-center px-4 py-4 font-bold text-gray-700 whitespace-nowrap">
                      Tổng
                    </th>
                    <th className="px-4 py-4" />
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((sub, i) => (
                    <tr
                      key={sub.id}
                      className={`border-t border-gray-50 hover:bg-gray-50/60 transition-colors ${
                        i % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                      }`}
                    >
                      <td className="px-6 py-4">
                        <p className="font-semibold text-gray-900 line-clamp-1">
                          {sub.examTitle}
                        </p>
                        {sub.isTeacherPreview && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">
                            <GraduationCap size={11} aria-hidden="true" /> Xem trước
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center text-gray-500 whitespace-nowrap">
                        {formatDateTime(sub.submittedAt)}
                      </td>
                      {sub.gradingStatus === "pending" ? (
                        <td colSpan={hasEssay ? 5 : 4} className="px-4 py-4 text-center">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
                            <Hourglass size={13} aria-hidden="true" />Chờ giáo viên chấm tự luận
                          </span>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-4 text-center font-semibold text-brand-600">
                            {sub.scores.p1 ?? "—"}
                          </td>
                          <td className="px-4 py-4 text-center font-semibold text-amber-600">
                            {sub.scores.p2 ?? "—"}
                          </td>
                          <td className="px-4 py-4 text-center font-semibold text-success-600">
                            {sub.scores.p3 ?? "—"}
                          </td>
                          {hasEssay && (
                            <td className="px-4 py-4 text-center font-semibold text-violet-600">
                              {sub.gradingStatus === "graded" ? sub.scores.p4 ?? "—" : "—"}
                            </td>
                          )}
                          <td className="px-4 py-4 text-center">
                            <ScoreBadge score={sub.scores.total} />
                          </td>
                        </>
                      )}
                      <td className="px-4 py-4 text-right">
                        {sub.gradingStatus !== "pending" && <Link
                          href={`/student/review/${sub.id}`}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 font-semibold rounded-lg text-xs transition-colors whitespace-nowrap"
                        >
                          Xem lại →
                        </Link>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
