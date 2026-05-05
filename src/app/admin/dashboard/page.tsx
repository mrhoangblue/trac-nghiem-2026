"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import AdminGuard from "@/components/AdminGuard";
import { useAuth } from "@/lib/AuthContext";
import TeacherClassPanel from "@/components/classroom/TeacherClassPanel";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  deleteDoc,
  doc,
  Timestamp,
} from "firebase/firestore";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ExamRow {
  id: string;
  title: string;
  createdAt: Timestamp | null;
  questionCount: number;
  submissionCount: number;
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-gray-500 text-sm animate-pulse">Đang tải dữ liệu…</p>
    </div>
  );
}

// ── Format date ───────────────────────────────────────────────────────────────
function formatDate(ts: Timestamp | null): string {
  if (!ts) return "—";
  return ts.toDate().toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ── Dashboard Page ────────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const router = useRouter();
  const { user, userProfile } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Fetch all exams
        const examSnap = await getDocs(
          query(collection(db, "exams"), orderBy("createdAt", "desc"))
        );

        // 2. For each exam, count submissions
        const rows: ExamRow[] = await Promise.all(
          examSnap.docs.map(async (doc) => {
            const d = doc.data();
            const subSnap = await getDocs(
              query(collection(db, "submissions"), where("examId", "==", doc.id))
            );
            return {
              id: doc.id,
              title: d.title ?? "Không có tên",
              createdAt: d.createdAt ?? null,
              questionCount: d.questionCount ?? (Array.isArray(d.questions) ? d.questions.length : 0),
              submissionCount: subSnap.size,
            };
          })
        );

        setExams(rows);
      } catch (err) {
        console.error("Lỗi tải dashboard:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleDelete = async (examId: string, title: string) => {
    if (!window.confirm(`Bạn có chắc muốn XÓA bài thi "${title}"?\nHành động này không thể hoàn tác.`)) return;
    setDeleting(examId);
    try {
      await deleteDoc(doc(db, "exams", examId));
      setExams(prev => prev.filter(e => e.id !== examId));
    } catch (err) {
      console.error(err);
      alert("❌ Xóa thất bại. Vui lòng thử lại.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AdminGuard>
    <div className="max-w-6xl mx-auto px-4 py-12 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">Quản trị bài thi</h1>
          <p className="text-gray-500 mt-1">Danh sách tất cả bài thi và thống kê lượt nộp.</p>
        </div>
        <Link
          href="/admin/create-exam"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl shadow-sm transition-all hover:shadow hover:-translate-y-0.5"
        >
          <span className="text-lg">＋</span> Tạo bài thi mới
        </Link>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Tổng bài thi", value: exams.length, icon: "📋", color: "bg-blue-50 border-blue-100 text-blue-700" },
          { label: "Lượt nộp bài", value: exams.reduce((s, e) => s + e.submissionCount, 0), icon: "📝", color: "bg-green-50 border-green-100 text-green-700" },
          { label: "Học sinh hoạt động", value: exams.reduce((s, e) => s + e.submissionCount, 0), icon: "👨‍🎓", color: "bg-purple-50 border-purple-100 text-purple-700" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className={`rounded-2xl border p-5 flex items-center gap-4 ${color}`}>
            <span className="text-2xl">{icon}</span>
            <div>
              <p className="text-2xl font-extrabold">{loading ? "…" : value}</p>
              <p className="text-sm font-medium opacity-75">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">Danh sách bài thi</h2>
        </div>

        {loading ? (
          <Spinner />
        ) : exams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center text-gray-400">
            <span className="text-5xl">📭</span>
            <p>Chưa có bài thi nào. Hãy tạo bài thi đầu tiên!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-6 py-3 font-semibold">Tên bài thi</th>
                  <th className="text-left px-6 py-3 font-semibold">Ngày tạo</th>
                  <th className="text-center px-6 py-3 font-semibold">Số câu</th>
                  <th className="text-center px-6 py-3 font-semibold">Học sinh đã thi</th>
                  <th className="text-center px-6 py-3 font-semibold">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {exams.map((exam, i) => (
                  <tr key={exam.id} className={`hover:bg-blue-50/40 transition-colors ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-gray-900">{exam.title}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(exam.createdAt)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded-full text-xs">
                        {exam.questionCount} câu
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-green-100 text-green-700 font-bold px-3 py-1 rounded-full text-xs">
                        {exam.submissionCount} HS
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          href={`/admin/exam/${exam.id}`}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg transition-all text-xs"
                        >
                          🔍 Chi tiết
                        </Link>
                        <Link
                          href={`/admin/edit-exam/${exam.id}`}
                          className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-800 font-semibold border border-amber-200 hover:border-amber-400 px-3 py-1.5 rounded-lg transition-all text-xs"
                        >
                          ✏️ Sửa
                        </Link>
                        <button
                          onClick={() => handleDelete(exam.id, exam.title)}
                          disabled={deleting === exam.id}
                          className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 font-semibold border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-all text-xs disabled:opacity-50"
                        >
                          {deleting === exam.id ? "…" : "🗑 Xóa"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* ── Classroom section (visible to all mod/admin users) ──────────── */}
      {user && userProfile && (
        <TeacherClassPanel
          teacherId={user.uid}
          teacherName={userProfile.fullName}
        />
      )}
    </div>
    </AdminGuard>
  );
}
