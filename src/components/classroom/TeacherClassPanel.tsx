"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import CreateClassModal from "./CreateClassModal";
import { deleteClass } from "@/lib/classroomService";
import { useAuth } from "@/lib/AuthContext";
import type { ClassDoc } from "@/utils/classroomTypes";

interface ClassRow {
  id: string;
  name: string;
  classCode: string;
  description: string;
  studentCount: number;
  isActive: boolean;
}

interface Props {
  teacherId: string;
}

function ClassCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border-2 border-gray-100 p-5 space-y-3 animate-pulse">
      <div className="h-4 bg-gray-100 rounded-lg w-3/4" />
      <div className="h-16 bg-gray-100 rounded-xl" />
      <div className="h-4 bg-gray-100 rounded-lg w-1/2" />
    </div>
  );
}

export default function TeacherClassPanel({ teacherId }: Props) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ClassRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!teacherId) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    const fetchClasses = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "classes"), where("teacherId", "==", teacherId))
        );
        const rows: ClassRow[] = snap.docs.map((d) => {
          const data = d.data() as ClassDoc;
          return {
            id: d.id,
            name: data.name,
            classCode: data.classCode,
            description: data.description ?? "",
            studentCount: data.studentIds.length,
            isActive: data.isActive,
          };
        });
        rows.sort((a, b) => a.name.localeCompare(b.name, "vi"));
        setClasses(rows);
      } catch (err) {
        console.error("Failed to load classes:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchClasses();
  }, [teacherId]);

  const copyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (!user) {
        setDeleteError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        return;
      }

      const idToken = await user.getIdToken();
      const res = await deleteClass(pendingDelete.id, idToken);
      if (!res.success) {
        const errorMessages = {
          FORBIDDEN: "Bạn không có quyền xóa lớp này.",
          NOT_FOUND: "Không tìm thấy lớp — có thể đã bị xóa.",
          UNAUTHENTICATED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
          DELETE_FAILED: "Máy chủ chưa thể xóa lớp. Vui lòng thử lại.",
        } as const;
        setDeleteError(errorMessages[res.error ?? "DELETE_FAILED"]);
        return;
      }
      setClasses((prev) => prev.filter((c) => c.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      console.error("Failed to delete class:", err);
      setDeleteError("Xóa lớp thất bại. Vui lòng thử lại.");
    } finally {
      setDeleting(false);
    }
  };

  const handleCreated = (result: { classId: string; classCode: string; name: string }) => {
    setClasses((prev) => [
      ...prev,
      { id: result.classId, name: result.name, classCode: result.classCode, description: "", studentCount: 0, isActive: true },
    ]);
  };

  return (
    <section className="mt-10">
      {/* Section header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900">Lớp học của tôi</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? "Đang tải…" : `${classes.length} lớp · Chia sẻ mã lớp với học sinh để họ tham gia.`}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 text-sm whitespace-nowrap"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Tạo lớp học mới
        </button>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <ClassCardSkeleton key={i} />)}
        </div>
      ) : classes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-3xl border-2 border-dashed border-gray-200 text-center">
          <span className="text-5xl mb-4">🏫</span>
          <p className="font-extrabold text-gray-800 text-lg">Chưa có lớp học nào</p>
          <p className="text-gray-500 text-sm mt-1 mb-6 max-w-xs">
            Tạo lớp đầu tiên để bắt đầu quản lý học sinh và chia sẻ bài thi.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5 px-6 rounded-xl text-sm transition-colors"
          >
            Tạo lớp học mới
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((cls) => (
            <div
              key={cls.id}
              className={`bg-white rounded-2xl border-2 p-5 flex flex-col gap-4 transition-all hover:shadow-md ${
                cls.isActive
                  ? "border-brand-100 hover:border-brand-300"
                  : "border-gray-100 opacity-60"
              }`}
            >
              {/* Class name + status badge */}
              <div className="flex items-start justify-between gap-2">
                <p className="font-extrabold text-gray-900 leading-snug text-sm">{cls.name}</p>
                <span
                  className={`shrink-0 text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                    cls.isActive
                      ? "bg-success-100 text-success-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {cls.isActive ? "Đang mở" : "Đã đóng"}
                </span>
              </div>

              {/* Code display */}
              <div className="bg-gradient-to-br from-brand-50 to-brand-50 border border-brand-100 rounded-xl px-4 py-4 text-center">
                <p className="text-[10px] text-brand-400 font-bold uppercase tracking-widest mb-1.5">
                  Mã lớp học
                </p>
                <p className="text-4xl font-black tracking-[0.3em] text-brand-700 font-mono select-all">
                  {cls.classCode}
                </p>
              </div>

              {/* Footer: student count + copy button */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm text-gray-500">
                  👨‍🎓 <span className="font-semibold text-gray-700">{cls.studentCount}</span> học sinh
                </span>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/teacher/classes/${cls.id}`}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white border border-brand-200 text-brand-700 hover:bg-brand-50 transition-all"
                  >
                    Danh sách →
                  </Link>
                  <button
                    type="button"
                    onClick={() => copyCode(cls.id, cls.classCode)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                      copiedId === cls.id
                        ? "bg-success-100 text-success-700"
                        : "bg-brand-50 hover:bg-brand-100 text-brand-700"
                    }`}
                  >
                    {copiedId === cls.id ? "✓ Đã sao chép" : "📋 Sao chép"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setPendingDelete(cls);
                    }}
                    aria-label={`Xóa lớp ${cls.name}`}
                    title="Xóa lớp"
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-danger-50 hover:bg-danger-100 text-danger-600 transition-all"
                  >
                    🗑️ Xóa
                  </button>
                </div>
              </div>

              {cls.description && (
                <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 -mt-1">
                  {cls.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-3xl">🗑️</span>
              <div>
                <h3 className="text-lg font-extrabold text-gray-900">Xóa lớp học?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Bạn sắp xóa lớp <span className="font-bold text-gray-800">{pendingDelete.name}</span>
                  {pendingDelete.studentCount > 0 && (
                    <> cùng <span className="font-bold text-gray-800">{pendingDelete.studentCount}</span> học sinh đang tham gia</>
                  )}
                  . Hành động này <span className="font-bold text-danger-600">không thể hoàn tác</span>.
                </p>
              </div>
            </div>

            {deleteError && (
              <p className="text-sm text-danger-600 bg-danger-50 border border-danger-100 rounded-xl px-3 py-2">
                {deleteError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setPendingDelete(null)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-danger-600 hover:bg-danger-700 transition-colors disabled:opacity-60 inline-flex items-center gap-2"
              >
                {deleting ? "Đang xóa…" : "Xóa lớp"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <CreateClassModal
          onClose={() => setShowModal(false)}
          onCreated={(result) => {
            handleCreated(result);
            setShowModal(false);
          }}
        />
      )}
    </section>
  );
}
