"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import type { ClassDoc } from "@/utils/classroomTypes";
import * as XLSX from "xlsx";

// ─────────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────────────────────────

const FIRESTORE_IN_LIMIT = 30;

function chunkIds<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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

interface SubmissionData {
  p1: number;
  p2: number;
  p3: number;
  total: number;
  submittedAt: Date;
}

interface AddStudentForm {
  email: string;
  fullName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI atoms
// ─────────────────────────────────────────────────────────────────────────────

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

function BtnSpinner() {
  return (
    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AddStudentModal
// ─────────────────────────────────────────────────────────────────────────────

interface AddStudentModalProps {
  classId: string;
  existingUids: Set<string>;
  onAdd: (student: StudentRow) => void;
  onClose: () => void;
}

function AddStudentModal({ classId, existingUids, onAdd, onClose }: AddStudentModalProps) {
  const [form, setForm] = useState<AddStudentForm>({ email: "", fullName: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // Auto-focus the email input when modal opens
  useEffect(() => { emailRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const email = form.email.trim().toLowerCase();
    if (!email) { setError("Vui lòng nhập Email học sinh."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Email không hợp lệ.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Look up the user account by email
      const userSnap = await getDocs(
        query(collection(db, "users"), where("email", "==", email))
      );
      if (userSnap.empty) {
        setError("Không tìm thấy tài khoản với email này. Học sinh phải đăng ký trước.");
        return;
      }
      const userDoc = userSnap.docs[0];
      const uid = userDoc.id;
      const userData = userDoc.data();

      // 2. Guard: already in class
      if (existingUids.has(uid)) {
        setError("Học sinh này đã có trong lớp.");
        return;
      }

      // 3. Add UID to classes/{classId}.studentIds
      await updateDoc(doc(db, "classes", classId), {
        studentIds: arrayUnion(uid),
        updatedAt: serverTimestamp(),
      });

      // 4. Mirror to class_members collection (same pattern as joinClass service)
      await setDoc(
        doc(db, "class_members", `${classId}_${uid}`),
        {
          classId,
          studentId: uid,
          studentName: (userData.fullName ?? form.fullName.trim()) || "—",
          studentEmail: email,
          joinedAt: serverTimestamp(),
          status: "active",
        },
        { merge: true }
      );

      // 5. Notify parent to update local state
      onAdd({
        uid,
        fullName: String((userData.fullName ?? form.fullName.trim()) || "—"),
        email,
        school: userData.school ? String(userData.school) : "",
      });
    } catch (err) {
      console.error("[AddStudentModal]", err);
      setError("Đã xảy ra lỗi. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }, [form, classId, existingUids, onAdd]);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-modal="true"
      role="dialog"
      aria-labelledby="add-modal-title"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 id="add-modal-title" className="text-lg font-extrabold text-gray-900">
              Thêm học sinh
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Học sinh phải có tài khoản trong hệ thống
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Email — primary lookup key */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5" htmlFor="add-email">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              ref={emailRef}
              id="add-email"
              type="email"
              value={form.email}
              onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); setError(null); }}
              placeholder="hocsinh@gmail.com"
              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
              disabled={loading}
              autoComplete="off"
            />
            <p className="text-xs text-gray-400 mt-1">
              Dùng để tìm tài khoản học sinh trong hệ thống
            </p>
          </div>

          {/* Full name — optional hint shown to teacher */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5" htmlFor="add-fullname">
              Họ và tên
              <span className="ml-1.5 text-xs font-normal text-gray-400">(tuỳ chọn — để xác nhận)</span>
            </label>
            <input
              id="add-fullname"
              type="text"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="Nguyễn Văn A"
              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
              disabled={loading}
            />
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={loading || !form.email.trim()}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
            >
              {loading ? <><BtnSpinner /> Đang thêm…</> : "✓ Thêm học sinh"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DeleteConfirmModal
// ─────────────────────────────────────────────────────────────────────────────

interface DeleteConfirmModalProps {
  student: StudentRow;
  classId: string;
  onDeleted: (uid: string) => void;
  onClose: () => void;
}

function DeleteConfirmModal({ student, classId, onDeleted, onClose }: DeleteConfirmModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !loading) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, loading]);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Remove UID from classes/{classId}.studentIds
      await updateDoc(doc(db, "classes", classId), {
        studentIds: arrayRemove(student.uid),
        updatedAt: serverTimestamp(),
      });

      // 2. Delete the mirror document in class_members
      await deleteDoc(doc(db, "class_members", `${classId}_${student.uid}`));

      onDeleted(student.uid);
    } catch (err) {
      console.error("[DeleteConfirmModal]", err);
      setError("Xóa thất bại. Vui lòng thử lại.");
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
      aria-modal="true"
      role="alertdialog"
      aria-labelledby="del-modal-title"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">
        {/* Icon + heading */}
        <div className="px-6 pt-7 pb-4 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-100 flex items-center justify-center text-2xl">
            🗑️
          </div>
          <h2 id="del-modal-title" className="text-lg font-extrabold text-gray-900">
            Xóa học sinh khỏi lớp?
          </h2>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            Bạn có chắc chắn muốn xóa{" "}
            <strong className="text-gray-800">{student.fullName}</strong>{" "}
            (<span className="font-mono text-xs">{student.email}</span>) khỏi lớp này?
            <br />
            <span className="text-xs text-gray-400 mt-1 inline-block">
              Tài khoản học sinh vẫn được giữ nguyên, chỉ xóa khỏi lớp.
            </span>
          </p>
        </div>

        {error && (
          <div className="mx-6 mb-3 text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-2.5 rounded-xl">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Giữ lại
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
          >
            {loading ? <><BtnSpinner /> Đang xóa…</> : "Xóa khỏi lớp"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function TeacherClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();

  const [classData, setClassData] = useState<(ClassDoc & { id: string }) | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Score export state ───────────────────────────────────────────────────
  const [myExams, setMyExams] = useState<ExamOption[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [scoreRows, setScoreRows] = useState<ScoreRow[] | null>(null);
  const [loadingScores, setLoadingScores] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"csv" | "xlsx" | "pdf" | null>(null);
  const [showScorePanel, setShowScorePanel] = useState(false);

  // ── Add / Delete student state ───────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingStudent, setDeletingStudent] = useState<StudentRow | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Initial data load
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // Add student callback (called from modal on success)
  // ─────────────────────────────────────────────────────────────────────────

  const handleStudentAdded = useCallback((newStudent: StudentRow) => {
    setStudents((prev) => {
      const merged = [...prev, newStudent];
      merged.sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"));
      return merged;
    });
    // Keep classData.studentIds in sync so the count badge updates
    setClassData((prev) =>
      prev
        ? { ...prev, studentIds: [...prev.studentIds, newStudent.uid] }
        : prev
    );
    // Reset score table since roster changed
    setScoreRows(null);
    setShowAddModal(false);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Delete student callback (called from modal on success)
  // ─────────────────────────────────────────────────────────────────────────

  const handleStudentDeleted = useCallback((uid: string) => {
    setStudents((prev) => prev.filter((s) => s.uid !== uid));
    setClassData((prev) =>
      prev
        ? { ...prev, studentIds: prev.studentIds.filter((id) => id !== uid) }
        : prev
    );
    setScoreRows(null);
    setDeletingStudent(null);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Score loading
  // ─────────────────────────────────────────────────────────────────────────

  const handleLoadScores = async () => {
    if (!selectedExamId || !classData) return;
    setLoadingScores(true);
    setScoreRows(null);
    try {
      const studentEmails = students.map((s) => s.email).filter(Boolean);
      const allSubmissions: Record<string, SubmissionData> = {};

      for (const batch of chunkIds(studentEmails, FIRESTORE_IN_LIMIT)) {
        const snap = await getDocs(
          query(
            collection(db, "submissions"),
            where("examId", "==", selectedExamId),
            where("studentEmail", "in", batch),
            where("status", "==", "COMPLETED"),
          )
        );
        snap.docs.forEach((d) => {
          const data = d.data();
          // Skip teacher-preview submissions — they should not appear in class gradebook
          if (data.isTeacherPreview === true) return;
          const email = String(data.studentEmail);
          const scores = data.scores ?? {};
          const existing = allSubmissions[email];
          const submittedAt = data.submittedAt?.toDate?.() ?? new Date(0);
          if (!existing || (scores.total ?? 0) > (existing.total ?? 0)) {
            allSubmissions[email] = {
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
        const sub = allSubmissions[s.email];
        return {
          stt: idx + 1,
          fullName: s.fullName,
          email: s.email,
          school: s.school ?? "",
          p1: sub ? sub.p1 : "—",
          p2: sub ? sub.p2 : "—",
          p3: sub ? sub.p3 : "—",
          total: sub ? sub.total : "—",
          submittedAt: sub ? sub.submittedAt.toLocaleString("vi-VN") : "Chưa làm",
        };
      });

      setScoreRows(rows);
    } catch (err) {
      console.error("[handleLoadScores]", err);
      alert("Không thể tải điểm. Vui lòng thử lại.");
    } finally {
      setLoadingScores(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Export helpers
  // ─────────────────────────────────────────────────────────────────────────

  const getExamTitle = () =>
    myExams.find((e) => e.id === selectedExamId)?.title ?? selectedExamId;

  const csvCell = (v: string | number): string => {
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const exportCSV = () => {
    if (!scoreRows) return;
    setExportingFormat("csv");
    try {
      const HEADERS = ["STT", "Họ và tên", "Email", "Trường", "Phần I", "Phần II", "Phần III", "Tổng", "Nộp lúc"];
      const lines = [
        HEADERS.map(csvCell).join(","),
        ...scoreRows.map((r) =>
          [r.stt, r.fullName, r.email, r.school, r.p1, r.p2, r.p3, r.total, r.submittedAt]
            .map(csvCell).join(",")
        ),
      ];
      const csvContent = "﻿" + lines.join("\n"); // UTF-8 BOM for Excel
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bang-diem-${classData?.name ?? classId}-${getExamTitle()}.csv`.replace(/\s+/g, "_");
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingFormat(null);
    }
  };

  const exportXLSX = () => {
    if (!scoreRows) return;
    setExportingFormat("xlsx");
    try {
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
    } finally {
      setExportingFormat(null);
    }
  };

  const printPDF = () => {
    if (!scoreRows) return;
    setExportingFormat("pdf");
    const examTitle = getExamTitle();
    const rows = scoreRows.map((r) => `<tr>
      <td>${r.stt}</td><td>${r.fullName}</td><td>${r.email}</td><td>${r.school}</td>
      <td>${r.p1}</td><td>${r.p2}</td><td>${r.p3}</td>
      <td><strong>${r.total}</strong></td><td>${r.submittedAt}</td>
    </tr>`).join("");

    const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/>
<title>Bảng điểm — ${classData?.name}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;margin:20px}
  h2{margin-bottom:4px} p.sub{color:#555;margin-bottom:16px;font-size:11px}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
  th{background:#f0f4ff;font-weight:bold}
  tr:nth-child(even){background:#f9f9f9}
  @media print{body{margin:0}}
</style></head><body>
<h2>Bảng điểm lớp: ${classData?.name}</h2>
<p class="sub">Đề thi: ${examTitle} &nbsp;|&nbsp; Xuất lúc: ${new Date().toLocaleString("vi-VN")}</p>
<table><thead><tr>
  <th>STT</th><th>Họ và tên</th><th>Email</th><th>Trường</th>
  <th>Phần I</th><th>Phần II</th><th>Phần III</th><th>Tổng</th><th>Nộp lúc</th>
</tr></thead><tbody>${rows}</tbody></table>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) { setExportingFormat(null); return; }
    win.document.write(html);
    win.document.close();
    win.print();
    setExportingFormat(null);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Derived
  // ─────────────────────────────────────────────────────────────────────────

  const existingUids = new Set(students.map((s) => s.uid));

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <AdminGuard>
      <div className="max-w-5xl mx-auto px-4 py-10 w-full">
        {/* Back link */}
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
            {/* ── Class header ──────────────────────────────────────────── */}
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
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/join/${classId}`
                      : `/join/${classId}`}
                  </button>
                </span>
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                  {students.length} học sinh đã vào lớp
                </span>
              </div>
            </header>

            {/* ── Students table ────────────────────────────────────────── */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mb-8">
              {/* Panel header with Add button */}
              <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-extrabold text-gray-900">Danh sách học sinh</h2>
                  <p className="text-gray-500 text-sm mt-0.5">
                    Nhấn vào tên để xem chi tiết bài thi.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-sm font-bold rounded-xl shadow-sm transition-all whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  Thêm học sinh
                </button>
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
                        <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell">Trường</th>
                        {/* Action column — narrow, no label */}
                        <th className="w-12 px-3 py-3" aria-label="Hành động" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {students.map((s, i) => (
                        <tr
                          key={s.uid}
                          className={`group transition-colors ${i % 2 === 1 ? "bg-gray-50/40" : ""} hover:bg-blue-50/60`}
                        >
                          {/* Name — clickable to student detail */}
                          <td
                            className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap cursor-pointer"
                            onClick={() =>
                              router.push(
                                `/teacher/students/${encodeURIComponent(s.uid)}?fromClass=${encodeURIComponent(classId ?? "")}`
                              )
                            }
                          >
                            {s.fullName}
                          </td>
                          <td
                            className="px-4 py-4 text-gray-500 text-xs cursor-pointer"
                            onClick={() =>
                              router.push(
                                `/teacher/students/${encodeURIComponent(s.uid)}?fromClass=${encodeURIComponent(classId ?? "")}`
                              )
                            }
                          >
                            {s.email || "—"}
                          </td>
                          <td
                            className="px-4 py-4 text-gray-600 text-xs hidden sm:table-cell cursor-pointer"
                            onClick={() =>
                              router.push(
                                `/teacher/students/${encodeURIComponent(s.uid)}?fromClass=${encodeURIComponent(classId ?? "")}`
                              )
                            }
                          >
                            {s.school || "—"}
                          </td>

                          {/* Delete button */}
                          <td className="px-3 py-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingStudent(s);
                              }}
                              title={`Xóa ${s.fullName} khỏi lớp`}
                              aria-label={`Xóa ${s.fullName} khỏi lớp`}
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-all"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Score export panel ────────────────────────────────────── */}
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
                          {loadingScores ? <><BtnSpinner /> Đang tải…</> : "Tải điểm"}
                        </button>
                      </div>
                    )}
                    {students.length === 0 && (
                      <p className="text-xs text-amber-600 mt-2">Lớp chưa có học sinh.</p>
                    )}
                  </div>

                  {scoreRows && (
                    <>
                      <div className="flex flex-wrap gap-2 justify-end">
                        {(
                          [
                            { fmt: "csv"  as const, label: "CSV",      color: "bg-emerald-600 hover:bg-emerald-700", icon: "⬇" },
                            { fmt: "xlsx" as const, label: "XLSX",     color: "bg-blue-600 hover:bg-blue-700",       icon: "⬇" },
                            { fmt: "pdf"  as const, label: "In / PDF", color: "bg-rose-600 hover:bg-rose-700",       icon: "🖨" },
                          ]
                        ).map(({ fmt, label, color, icon }) => (
                          <button
                            key={fmt}
                            onClick={fmt === "csv" ? exportCSV : fmt === "xlsx" ? exportXLSX : printPDF}
                            disabled={exportingFormat !== null}
                            className={`flex items-center gap-2 px-4 py-2 ${color} disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all`}
                          >
                            {exportingFormat === fmt
                              ? <BtnSpinner />
                              : <span>{icon ?? "⬇"}</span>
                            }
                            {label}
                          </button>
                        ))}
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
                                <td className="text-center px-3 py-3 font-black text-indigo-700">{r.total}</td>
                                <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell whitespace-nowrap">
                                  {r.submittedAt}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <p className="text-xs text-gray-400 text-right">
                        Tổng {scoreRows.length} học sinh · Đã làm:{" "}
                        {scoreRows.filter((r) => r.total !== "—").length}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* ── Modals (rendered outside main card, above everything) ─── */}
      {showAddModal && classId && (
        <AddStudentModal
          classId={classId}
          existingUids={existingUids}
          onAdd={handleStudentAdded}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {deletingStudent && classId && (
        <DeleteConfirmModal
          student={deletingStudent}
          classId={classId}
          onDeleted={handleStudentDeleted}
          onClose={() => setDeletingStudent(null)}
        />
      )}
    </AdminGuard>
  );
}
