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
import JoinClassSection from "@/components/classroom/JoinClassSection";
import FindTeacherSection from "@/components/classroom/FindTeacherSection";

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
  };
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-gray-500 text-sm animate-pulse">Đang tải lịch sử bài làm…</p>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 8
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : score >= 5
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-red-100 text-red-600 border-red-200";
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
    setLoading(true);

    const fetchSubmissions = async () => {
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
            } as Submission;
          })
          // Sort client-side: mới nhất trước (tránh cần composite index)
          .sort((a, b) => {
            const ts = (v: unknown) =>
              v && typeof (v as any).toMillis === "function"
                ? (v as any).toMillis()
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

    fetchSubmissions();
  }, [user]);

  // ── Chưa đăng nhập ────────────────────────────────────────────────────────
  if (authLoading) return <Spinner />;

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        <div className="text-6xl mb-6">🔐</div>
        <h2 className="text-2xl font-extrabold text-gray-800 mb-3">Cần đăng nhập</h2>
        <p className="text-gray-500 mb-8">
          Vui lòng đăng nhập để xem lịch sử bài làm của bạn.
        </p>
        <Link
          href="/"
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
        >
          Về trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 w-full space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        {user.photoURL && (
          <img
            src={user.photoURL}
            alt={user.displayName ?? "Avatar"}
            width={48}
            height={48}
            className="w-12 h-12 rounded-full border-2 border-blue-200"
            referrerPolicy="no-referrer"
          />
        )}
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">
            Trang học sinh
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">{user.displayName} · {user.email}</p>
        </div>
      </div>

      {/* ── Classroom section ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <JoinClassSection
          user={user}
          fullName={user.displayName ?? user.email ?? "Học sinh"}
        />
        <FindTeacherSection />
      </div>

      {/* ── Divider ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="flex-1 border-t border-gray-200" />
        <span className="text-sm font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
          Lịch sử làm bài
        </span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-red-500 font-medium">{error}</p>
        </div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
          <div className="text-6xl mb-4">📭</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Chưa có bài nào</h2>
          <p className="text-gray-500 mb-8">Bạn chưa nộp bài thi nào. Hãy làm một bài ngay!</p>
          <Link
            href="/"
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
          >
            Chọn bài thi
          </Link>
        </div>
      ) : (
        <>
          {/* Tổng kết nhanh */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
              <p className="text-3xl font-extrabold text-blue-600">{submissions.length}</p>
              <p className="text-sm text-gray-500 mt-1">Bài đã nộp</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
              <p className="text-3xl font-extrabold text-emerald-600">
                {Math.max(...submissions.map((s) => s.scores.total))}
              </p>
              <p className="text-sm text-gray-500 mt-1">Điểm cao nhất</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
              <p className="text-3xl font-extrabold text-indigo-600">
                {(submissions.reduce((sum, s) => sum + s.scores.total, 0) / submissions.length).toFixed(1)}
              </p>
              <p className="text-sm text-gray-500 mt-1">Điểm trung bình</p>
            </div>
          </div>

          {/* Bảng lịch sử */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-4 font-bold text-gray-600">Bài thi</th>
                    <th className="text-center px-4 py-4 font-bold text-gray-600 whitespace-nowrap">
                      Thời gian nộp
                    </th>
                    <th className="text-center px-4 py-4 font-bold text-purple-600 whitespace-nowrap">
                      P1
                    </th>
                    <th className="text-center px-4 py-4 font-bold text-amber-600 whitespace-nowrap">
                      P2
                    </th>
                    <th className="text-center px-4 py-4 font-bold text-emerald-600 whitespace-nowrap">
                      P3
                    </th>
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
                      </td>
                      <td className="px-4 py-4 text-center text-gray-500 whitespace-nowrap">
                        {formatDateTime(sub.submittedAt)}
                      </td>
                      <td className="px-4 py-4 text-center font-semibold text-purple-600">
                        {sub.scores.p1 ?? "—"}
                      </td>
                      <td className="px-4 py-4 text-center font-semibold text-amber-600">
                        {sub.scores.p2 ?? "—"}
                      </td>
                      <td className="px-4 py-4 text-center font-semibold text-emerald-600">
                        {sub.scores.p3 ?? "—"}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <ScoreBadge score={sub.scores.total} />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`/student/review/${sub.id}`}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg text-xs transition-colors whitespace-nowrap"
                        >
                          Xem lại →
                        </Link>
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
