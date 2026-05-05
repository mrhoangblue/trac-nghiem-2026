"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebase";
import AdminGuard from "@/components/AdminGuard";
import { useAuth } from "@/lib/AuthContext";
import {
  collection,
  getDocs,
  query,
  orderBy,
  deleteDoc,
  doc,
  where,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExamRow {
  id: string;
  title: string;
  createdAt: Timestamp | null;
  part1Count: number;
  part2Count: number;
  part3Count: number;
  questionCount: number;
  submissionCount: number;
  hasRawLatex: boolean;
  authorEmail: string;
  isShared: boolean;
  isClonedFromShared: boolean;
  gradeLevel?: string;
  examType?: string;
  maxRetries: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-gray-500 text-sm animate-pulse">Đang tải danh sách bài thi…</p>
    </div>
  );
}

function formatDate(ts: Timestamp | null): string {
  if (!ts) return "—";
  return ts.toDate().toLocaleDateString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Main content (reads ?tab= search param) ───────────────────────────────────

function ExamListContent() {
  const { user, isMod, isAdmin, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab"); // "mine" | "shared" | null

  const [exams, setExams] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const userEmail = user?.email ?? "";

  // Sort helper (avoids composite Firestore indexes)
  const sortByCreatedAt = (docs: QueryDocumentSnapshot<DocumentData>[]) =>
    [...docs].sort(
      (a, b) =>
        ((b.data().createdAt as Timestamp)?.toMillis() ?? 0) -
        ((a.data().createdAt as Timestamp)?.toMillis() ?? 0)
    );

  const fetchExams = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    try {
      let examDocs: QueryDocumentSnapshot<DocumentData>[] = [];

      if (isAdmin) {
        // Admin sees every exam
        const snap = await getDocs(
          query(collection(db, "exams"), orderBy("createdAt", "desc"))
        );
        examDocs = snap.docs;
      } else if (isMod && userEmail) {
        if (!tab || tab === "mine") {
          // Only own exams — single-field where, no composite index needed
          const snap = await getDocs(
            query(collection(db, "exams"), where("authorEmail", "==", userEmail))
          );
          examDocs = sortByCreatedAt(snap.docs);
        } else if (tab === "shared") {
          // Others' shared exams + own clones (two single-field queries, merged)
          const [sharedSnap, ownSnap] = await Promise.all([
            getDocs(query(collection(db, "exams"), where("isShared", "==", true))),
            getDocs(query(collection(db, "exams"), where("authorEmail", "==", userEmail))),
          ]);
          const seen = new Set(sharedSnap.docs.map((d) => d.id));
          const merged = [...sharedSnap.docs];
          ownSnap.docs.forEach((d) => { if (!seen.has(d.id)) merged.push(d); });
          examDocs = sortByCreatedAt(merged);
        }
      }

      const rows: ExamRow[] = await Promise.all(
        examDocs.map(async (d) => {
          const data = d.data();
          const subSnap = await getDocs(
            query(collection(db, "submissions"), where("examId", "==", d.id))
          );
          return {
            id: d.id,
            title: data.title ?? "Không có tên",
            createdAt: data.createdAt ?? null,
            part1Count: data.part1Count ?? 0,
            part2Count: data.part2Count ?? 0,
            part3Count: data.part3Count ?? 0,
            questionCount: data.questionCount ?? 0,
            submissionCount: subSnap.size,
            hasRawLatex: !!data.rawLatex,
            authorEmail: data.authorEmail ?? "",
            isShared: data.isShared ?? false,
            isClonedFromShared: data.isClonedFromShared ?? false,
            gradeLevel: data.gradeLevel,
            examType: data.examType,
            maxRetries: data.maxRetries ?? 1,
          };
        })
      );
      setExams(rows);
    } catch (err) {
      console.error("Lỗi tải danh sách:", err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isAdmin, isMod, userEmail, authLoading]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  const handleDelete = async (examId: string, title: string) => {
    if (!window.confirm(`Bạn có chắc muốn XÓA vĩnh viễn bài thi:\n"${title}"?\n\nHành động này KHÔNG thể hoàn tác.`)) return;
    setDeleting(examId);
    try {
      await deleteDoc(doc(db, "exams", examId));
      setExams((prev) => prev.filter((e) => e.id !== examId));
    } catch (err) {
      console.error(err);
      alert("❌ Xóa thất bại. Vui lòng thử lại.");
    } finally {
      setDeleting(null);
    }
  };

  // ── Tab filtering ─────────────────────────────────────────────────────────
  let tabFiltered = exams;
  if (isMod && !isAdmin) {
    if (!tab || tab === "mine") {
      // Own original exams (not cloned from shared)
      tabFiltered = exams.filter(
        (e) => e.authorEmail === userEmail && !e.isClonedFromShared
      );
    } else if (tab === "shared") {
      // Others' shared exams + own cloned shared exams
      tabFiltered = exams.filter(
        (e) =>
          (e.isShared && e.authorEmail !== userEmail) ||
          (e.isClonedFromShared && e.authorEmail === userEmail)
      );
    }
  }

  const filtered = tabFiltered.filter((e) =>
    e.title.toLowerCase().includes(search.toLowerCase())
  );

  // Can a mod edit this exam?
  const canEdit = (exam: ExamRow) => {
    if (isAdmin) return exam.hasRawLatex;
    if (isMod) return exam.hasRawLatex && (exam.authorEmail === userEmail || exam.isShared);
    return false;
  };

  // Can a mod delete this exam?
  const canDelete = (exam: ExamRow) => {
    if (isAdmin) return true;
    return exam.authorEmail === userEmail;
  };

  // ── Tab titles ────────────────────────────────────────────────────────────
  let listTitle = "Tất cả đề thi";
  if (isMod && !isAdmin) {
    if (!tab || tab === "mine") listTitle = "Đề của tôi";
    else if (tab === "shared") listTitle = "Đề được chia sẻ";
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">{listTitle}</h1>
          <p className="text-gray-500 mt-1">Xem, sửa và xóa các đề thi.</p>
        </div>
        <div className="flex gap-3">
          {isAdmin && (
            <Link
              href="/admin/dashboard"
              className="inline-flex items-center gap-2 border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300 font-semibold py-2.5 px-5 rounded-xl transition-all text-sm"
            >
              ← Dashboard
            </Link>
          )}
          <Link
            href="/admin/create-exam"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-sm transition-all hover:-translate-y-0.5 text-sm"
          >
            ＋ Tạo đề mới
          </Link>
        </div>
      </div>

      {/* Mod tab switcher */}
      {isMod && !isAdmin && (
        <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 mb-6 max-w-xs">
          {[
            { label: "Đề của tôi", value: "mine" },
            { label: "Chia sẻ", value: "shared" },
          ].map((t) => (
            <Link
              key={t.value}
              href={`/admin/exam-list?tab=${t.value}`}
              className={`flex-1 py-2 rounded-xl font-semibold text-sm text-center transition-all ${
                (!tab && t.value === "mine") || tab === t.value
                  ? "bg-white shadow text-blue-700"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Tìm kiếm tên đề thi…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md p-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">
            {loading ? "Đang tải…" : `${filtered.length} đề thi`}
          </h2>
          {!loading && (
            <button onClick={fetchExams} className="text-xs text-gray-400 hover:text-blue-600 transition-colors">
              ↻ Làm mới
            </button>
          )}
        </div>

        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center text-gray-400">
            <span className="text-5xl">📭</span>
            <p>{search ? "Không tìm thấy đề thi phù hợp." : "Chưa có đề thi nào."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-6 py-3 font-semibold">Tên bài thi</th>
                  <th className="text-left px-4 py-3 font-semibold">Cấp / Loại</th>
                  <th className="text-left px-4 py-3 font-semibold">Ngày tạo</th>
                  <th className="text-center px-3 py-3 font-semibold">P1</th>
                  <th className="text-center px-3 py-3 font-semibold">P2</th>
                  <th className="text-center px-3 py-3 font-semibold">P3</th>
                  <th className="text-center px-3 py-3 font-semibold">Nộp</th>
                  <th className="text-center px-3 py-3 font-semibold">Lượt</th>
                  <th className="text-center px-6 py-3 font-semibold">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((exam, i) => (
                  <tr
                    key={exam.id}
                    className={`hover:bg-blue-50/30 transition-colors ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{exam.title}</span>
                        {!exam.hasRawLatex && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 font-medium" title="Đề cũ không thể sửa">
                            legacy
                          </span>
                        )}
                        {exam.isShared && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">chia sẻ</span>
                        )}
                        {exam.isClonedFromShared && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 font-medium">bản sao</span>
                        )}
                      </div>
                      {isAdmin && exam.authorEmail && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{exam.authorEmail}</p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-0.5">
                        {exam.gradeLevel && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold w-fit">{exam.gradeLevel}</span>
                        )}
                        {exam.examType && (
                          <span className="text-xs text-gray-400">{exam.examType}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-500 whitespace-nowrap text-xs">
                      {formatDate(exam.createdAt)}
                    </td>
                    <td className="px-3 py-4 text-center">
                      <span className="bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full text-xs">{exam.part1Count}</span>
                    </td>
                    <td className="px-3 py-4 text-center">
                      <span className="bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full text-xs">{exam.part2Count}</span>
                    </td>
                    <td className="px-3 py-4 text-center">
                      <span className="bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full text-xs">{exam.part3Count}</span>
                    </td>
                    <td className="px-3 py-4 text-center">
                      <span className="bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full text-xs">{exam.submissionCount}</span>
                    </td>
                    <td className="px-3 py-4 text-center">
                      <span className={`font-bold px-2 py-0.5 rounded-full text-xs ${
                        exam.maxRetries === 0 ? "bg-gray-100 text-gray-500" : "bg-rose-100 text-rose-700"
                      }`}>
                        {exam.maxRetries === 0 ? "∞" : exam.maxRetries}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          href={`/quiz/${exam.id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800 font-semibold border border-gray-200 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-all text-xs"
                        >
                          👁 Xem
                        </Link>
                        <Link
                          href={`/admin/exam/${exam.id}`}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg transition-all text-xs"
                        >
                          📊 KQ
                        </Link>
                        {canEdit(exam) ? (
                          <Link
                            href={`/admin/edit-exam/${exam.id}`}
                            className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-800 font-semibold border border-amber-200 hover:border-amber-400 px-3 py-1.5 rounded-lg transition-all text-xs"
                          >
                            {exam.authorEmail === userEmail ? "✏️ Sửa" : "📋 Nhân bản"}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-300 font-semibold border border-gray-100 px-3 py-1.5 rounded-lg text-xs cursor-not-allowed" title="Không thể sửa">
                            ✏️ Sửa
                          </span>
                        )}
                        {canDelete(exam) && (
                          <button
                            onClick={() => handleDelete(exam.id, exam.title)}
                            disabled={deleting === exam.id}
                            className="inline-flex items-center gap-1 text-red-500 hover:text-red-700 font-semibold border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-all text-xs disabled:opacity-40"
                          >
                            {deleting === exam.id ? (
                              <span className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              "🗑 Xóa"
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page (wrap in AdminGuard + Suspense for useSearchParams) ──────────────────

export default function ExamListPage() {
  return (
    <AdminGuard>
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center py-24">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
              <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
            </div>
          </div>
        }
      >
        <ExamListContent />
      </Suspense>
    </AdminGuard>
  );
}
