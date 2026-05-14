"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import type { ClassDoc } from "@/utils/classroomTypes";
import * as XLSX from "xlsx";

const FIRESTORE_IN_LIMIT = 30;

function chunkIds<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface StudentRow {
  uid: string;
  fullName: string;
  email: string;
  school?: string;
}

interface ExamOption {
  id: string;
  title: string;
}

interface ScoreRow {
  stt: number;
  fullName: string;
  email: string;
  school: string;
  p1: number | string;
  p2: number | string;
  p3: number | string;
  total: number | string;
  submittedAt: string;
}

function Spinner() {
  return (
    <div className="flex justify-center py-24">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
        <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
      </div>
    </div>
  );
}

export default function TeacherClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [classData, setClassData] = useState<(ClassDoc & { id: string }) | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Score export state ─────────────────────────────────────────────────────
  const [myExams, setMyExams] = useState<ExamOption[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [scoreRows, setScoreRows] = useState<ScoreRow[] | null>(null);
  const [loadingScores, setLoadingScores] = useState(false);
  const [showScorePanel, setShowScorePanel] = useState(false);

  useEffect(() => {
    if (!classId || !user?.uid) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const cref = await getDoc(doc(db, "classes", classId));
        if (!cref.exists()) {
          if (!cancelled) setError("Không tìm thấy lớp học.");
          return;
        }
        const cd = cref.data() as ClassDoc;

        if (!isAdmin && cd.teacherId !== user.uid) {
          if (!cancelled) setError("Bạn không có quyền xem lớp này.");
          return;
        }

        if (!cancelled) setClassData({ ...cd, id: cref.id });

        const ids = cd.studentIds ?? [];
        const rows: StudentRow[] = [];
        if (ids.length > 0) {
          for (const batch of chunkIds(ids, FIRESTORE_IN_LIMIT)) {
            const q = query(collection(db, "users"), where(documentId(), "in", batch));
            const snap = await getDocs(q);
            snap.docs.forEach((d) => {
              const ud = d.data();
              rows.push({
                uid: d.id,
                fullName: String(ud.fullName ?? "—"),
                email: String(ud.email ?? ""),
                school: ud.school ? String(ud.school) : "",
              });
            });
          }
          rows.sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"));
        }
        if (!cancelled) setStudents(rows);

        // Load teacher's exams for score export
        const examSnap = await getDocs(
          query(collection(db, "exams"), where("authorEmail", "==", user.email ?? ""))
        );
        if (!cancelled) {
          setMyExams(
            examSnap.docs.map((d) => ({ id: d.id, title: String(d.data().title ?? d.id) }))
          );
        }
      } catch {
        if (!cancelled) setError("Không thể tải dữ liệu.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [classId, user?.uid, user?.email, isAdmin]);

  // ── Load scores for selected exam ──────────────────────────────────────────
  const handleLoadScores = async () => {
    if (!selectedExamId || !classData) return;
    setLoadingScores(true);
    setScoreRows(null);
    try {
      const studentIds = classData.studentIds;
      const allSubmissions: Record<string, { p1: number; p2: number; p3: number; total: number; submittedAt: Date }> = {};

      for (const batch of chunkIds(studentIds, FIRESTORE_IN_LIMIT)) {
        const snap = await getDocs(
          query(
            collection(db, "submissions"),
            where("examId", "==", selectedExamId),
            where("studentId", "in", batch)
          )
        );
        snap.docs.forEach((d) => {
          const data = d.data();
          const sid = String(data.studentId);
          const scores = data.scores ?? {};
          const existing = allSubmissions[sid];
          const submittedAt = data.submittedAt?.toDate?.() ?? new Date(0);
          // Keep highest score if multiple submissions
          if (!existing || (scores.total ?? 0) > (existing.total ?? 0)) {
            allSubmissions[sid] = {
              p1: scores.p1 ?? 0,
              p2: scores.p2 ?? 0,
              p3: scores.p3 ?? 0,
              total: scores.total ?? 0,
              submittedAt,
            };
          }
        });
      }

      const rows: ScoreRow[] = students.map((s, idx) => {
        const sub = allSubmissions[s.uid];
        return {
          stt: idx + 1,
          fullName: s.fullName,
          email: s.email,
          school: s.school ?? "",
          p1: sub ? sub.p1 : "—",
          p2: sub ? sub.p2 : "—",
          p3: sub ? sub.p3 : "—",
          total: sub ? sub.total : "—",
          submittedAt: sub
            ? sub.submittedAt.toLocaleString("vi-VN")
            : "Chưa làm",
        };
      });

      setScoreRows(rows);
    } catch {
      alert("Không thể tải điểm. Vui lòng thử lại.");
    } finally {
      setLoadingScores(false);
    }
  };

  // ── Export helpers ─────────────────────────────────────────────────────────
  const getExamTitle = () =>
    myExams.find((e) => e.id === selectedExamId)?.title ?? selectedExamId;

  const exportCSV = () => {
    if (!scoreRows) return;
    const header = ["STT", "Họ và tên", "Email", "Trường", "Phần I", "Phần II", "Phần III", "Tổng", "Nộp lúc"];
    const rows = scoreRows.map((r) =>
      [r.stt, r.fullName, r.email, r.school, r.p1, r.p2, r.p3, r.total, r.submittedAt].join(",")
    );
    const csvContent = "﻿" + [header.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bang-diem-${classData?.name ?? classId}-${getExamTitle()}.csv`.replace(/\s+/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportXLSX = () => {
    if (!scoreRows) return;
    const wsData = [
      ["STT", "Họ và tên", "Email", "Trường", "Phần I", "Phần II", "Phần III", "Tổng", "Nộp lúc"],
      ...scoreRows.map((r) => [r.stt, r.fullName, r.email, r.school, r.p1, r.p2, r.p3, r.total, r.submittedAt]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 5 }, { wch: 25 }, { wch: 28 }, { wch: 22 },
      { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 20 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bảng điểm");
    XLSX.writeFile(wb, `bang-diem-${classData?.name ?? classId}-${getExamTitle()}.xlsx`.replace(/\s+/g, "_"));
  };

  const printPDF = () => {
    if (!scoreRows) return;
    const examTitle = getExamTitle();
    const rows = scoreRows
      .map(
        (r) => `<tr>
        <td>${r.stt}</td>
        <td>${r.fullName}</td>
        <td>${r.email}</td>
        <td>${r.school}</td>
        <td>${r.p1}</td>
        <td>${r.p2}</td>
        <td>${r.p3}</td>
        <td><strong>${r.total}</strong></td>
        <td>${r.submittedAt}</td>
      </tr>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8"/>
<title>Bảng điểm — ${classData?.name}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
  h2 { margin-bottom: 4px; }
  p.sub { color: #555; margin-bottom: 16px; font-size: 11px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f0f4ff; font-weight: bold; }
  tr:nth-child(even) { background: #f9f9f9; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h2>Bảng điểm lớp: ${classData?.name}</h2>
<p class="sub">Đề thi: ${examTitle} &nbsp;|&nbsp; Xuất lúc: ${new Date().toLocaleString("vi-VN")}</p>
<table>
  <thead>
    <tr>
      <th>STT</th><th>Họ và tên</th><th>Email</th><th>Trường</th>
      <th>Phần I</th><th>Phần II</th><th>Phần III</th><th>Tổng</th><th>Nộp lúc</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.print();
  };

  return (
    <AdminGuard>
      <div className="max-w-5xl mx-auto px-4 py-10 w-full">
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
          <Link href="/teacher/classes" className="text-indigo-600 hover:text-indigo-800 font-semibold">
            ← Quản lý lớp học
          </Link>
        </div>

        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center text-red-700 font-semibold">
            {error}
          </div>
        ) : classData ? (
          <>
            {/* Class header */}
            <header className="mb-8 rounded-3xl bg-gradient-to-r from-indigo-600 to-blue-700 text-white p-8 shadow-lg">
              <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-1">Lớp học</p>
              <h1 className="text-3xl font-extrabold">{classData.name}</h1>
              <div className="mt-4 inline-flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="text-sm text-indigo-100 font-medium">
                  Mã lớp:{" "}
                  <strong className="text-white tracking-[0.35em] text-lg font-black font-mono">
                    {classData.classCode}
                  </strong>
                </span>
                <span className="text-sm text-indigo-100 font-medium">
                  Link tham gia:{" "}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/join/${classId}`);
                      alert("Đã sao chép link lớp học!");
                    }}
                    className="underline text-white hover:text-indigo-200 transition-colors"
                  >
                    {typeof window !== "undefined" ? `${window.location.origin}/join/${classId}` : `/join/${classId}`}
                  </button>
                </span>
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                  {students.length} học sinh đã vào lớp
                </span>
              </div>
            </header>

            {/* Students table */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mb-8">
              <div className="px-6 py-4 border-b border-gray-50">
                <h2 className="font-extrabold text-gray-900">Danh sách học sinh</h2>
                <p className="text-gray-500 text-sm mt-0.5">
                  Chọn một dòng để xem các bài thi của học sinh.
                </p>
              </div>

              {students.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm font-medium">
                  Chưa có học sinh nào tham gia lớp.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                        <th className="text-left px-6 py-3 font-semibold">Họ và tên</th>
                        <th className="text-left px-4 py-3 font-semibold">Email</th>
                        <th className="text-left px-4 py-3 font-semibold">Trường</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {students.map((s, i) => (
                        <tr
                          key={s.uid}
                          onClick={() =>
                            router.push(
                              `/teacher/students/${encodeURIComponent(s.uid)}?fromClass=${encodeURIComponent(classId ?? "")}`
                            )
                          }
                          className={`cursor-pointer hover:bg-blue-50/70 transition-colors ${
                            i % 2 === 1 ? "bg-gray-50/40" : ""
                          }`}
                        >
                          <td className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">{s.fullName}</td>
                          <td className="px-4 py-4 text-gray-500 text-xs">{s.email || "—"}</td>
                          <td className="px-4 py-4 text-gray-600 text-xs">{s.school || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Score export panel ───────────────────────────────────── */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowScorePanel((v) => !v)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">📊</span>
                  <div className="text-left">
                    <h2 className="font-extrabold text-gray-900">Xuất bảng điểm</h2>
                    <p className="text-gray-500 text-sm">CSV, XLSX hoặc in PDF</p>
                  </div>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${showScorePanel ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showScorePanel && (
                <div className="border-t border-gray-100 px-6 pb-6 pt-5 space-y-5">
                  {/* Exam picker */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Chọn đề thi</label>
                    {myExams.length === 0 ? (
                      <p className="text-sm text-gray-400">Bạn chưa có đề thi nào.</p>
                    ) : (
                      <div className="flex gap-3">
                        <select
                          value={selectedExamId}
                          onChange={(e) => { setSelectedExamId(e.target.value); setScoreRows(null); }}
                          className="flex-1 p-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none transition-colors"
                        >
                          <option value="">— Chọn đề thi —</option>
                          {myExams.map((e) => (
                            <option key={e.id} value={e.id}>{e.title}</option>
                          ))}
                        </select>
                        <button
                          onClick={handleLoadScores}
                          disabled={!selectedExamId || loadingScores || students.length === 0}
                          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all whitespace-nowrap flex items-center gap-2"
                        >
                          {loadingScores ? (
                            <>
                              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Đang tải…
                            </>
                          ) : (
                            "Tải điểm"
                          )}
                        </button>
                      </div>
                    )}
                    {students.length === 0 && (
                      <p className="text-xs text-amber-600 mt-2">Lớp chưa có học sinh.</p>
                    )}
                  </div>

                  {/* Score table */}
                  {scoreRows && (
                    <>
                      <div className="flex flex-wrap gap-2 justify-end">
                        <button
                          onClick={exportCSV}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-all"
                        >
                          ⬇ CSV
                        </button>
                        <button
                          onClick={exportXLSX}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all"
                        >
                          ⬇ XLSX
                        </button>
                        <button
                          onClick={printPDF}
                          className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm transition-all"
                        >
                          🖨 In / PDF
                        </button>
                      </div>

                      <div className="overflow-x-auto rounded-2xl border border-gray-100">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-indigo-50 text-indigo-700 text-xs uppercase tracking-wider">
                              <th className="text-center px-3 py-3 font-bold w-10">STT</th>
                              <th className="text-left px-4 py-3 font-bold">Họ và tên</th>
                              <th className="text-left px-4 py-3 font-bold hidden sm:table-cell">Email</th>
                              <th className="text-center px-3 py-3 font-bold">Phần I</th>
                              <th className="text-center px-3 py-3 font-bold">Phần II</th>
                              <th className="text-center px-3 py-3 font-bold">Phần III</th>
                              <th className="text-center px-3 py-3 font-bold">Tổng</th>
                              <th className="text-left px-4 py-3 font-bold hidden md:table-cell">Nộp lúc</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {scoreRows.map((r, i) => (
                              <tr key={r.email + i} className={i % 2 === 1 ? "bg-gray-50/50" : ""}>
                                <td className="text-center px-3 py-3 text-gray-400 text-xs">{r.stt}</td>
                                <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{r.fullName}</td>
                                <td className="px-4 py-3 text-gray-400 text-xs hidden sm:table-cell">{r.email}</td>
                                <td className="text-center px-3 py-3 text-gray-700">{r.p1}</td>
                                <td className="text-center px-3 py-3 text-gray-700">{r.p2}</td>
                                <td className="text-center px-3 py-3 text-gray-700">{r.p3}</td>
                                <td className="text-center px-3 py-3 font-black text-indigo-700">
                                  {r.total}
                                </td>
                                <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell whitespace-nowrap">
                                  {r.submittedAt}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <p className="text-xs text-gray-400 text-right">
                        Tổng {scoreRows.length} học sinh · Đã làm: {scoreRows.filter((r) => r.total !== "—").length}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </AdminGuard>
  );
}
