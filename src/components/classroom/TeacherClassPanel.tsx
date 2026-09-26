"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, GraduationCap, Plus, Trash2, UsersRound } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import CreateClassModal from "./CreateClassModal";
import { deleteClass } from "@/lib/classroomService";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import type { ClassDoc } from "@/utils/classroomTypes";

interface ClassRow {
  id: string;
  name: string;
  classCode: string;
  description: string;
  studentCount: number;
  maxStudents?: number;
  isActive: boolean;
}

const THEMES = [
  { gradient: "from-[#7f3e1c] to-[#c46a2d]", pale: "bg-[#fff6ed]", label: "text-[#8e451f]" },
  { gradient: "from-[#285c63] to-[#428890]", pale: "bg-[#effafb]", label: "text-[#285c63]" },
  { gradient: "from-[#5c5378] to-[#81789e]", pale: "bg-[#f6f3fb]", label: "text-[#5c5378]" },
  { gradient: "from-[#667039] to-[#909955]", pale: "bg-[#f7f8ed]", label: "text-[#667039]" },
];

function Skeleton() {
  return <div className="h-72 animate-pulse rounded-[1.7rem] bg-white shadow-sm" />;
}

export default function TeacherClassPanel({ teacherId }: { teacherId: string }) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ClassRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!teacherId) return;
    let cancelled = false;
    getDocs(query(collection(db, "classes"), where("teacherId", "==", teacherId)))
      .then((snapshot) => {
        if (cancelled) return;
        const rows = snapshot.docs.map((item) => {
          const data = item.data() as ClassDoc;
          return {
            id: item.id,
            name: data.name,
            classCode: data.classCode,
            description: data.description ?? "",
            studentCount: data.studentIds?.length ?? 0,
            maxStudents: data.maxStudents,
            isActive: data.isActive,
          };
        });
        rows.sort((a, b) => a.name.localeCompare(b.name, "vi"));
        setClasses(rows);
      })
      .catch((error) => console.error("Failed to load classes:", error))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teacherId]);

  const handleConfirmDelete = async () => {
    if (!pendingDelete || !user || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteClass(pendingDelete.id, await user.getIdToken());
      if (!result.success) {
        setDeleteError(result.error === "FORBIDDEN" ? "Bạn không có quyền xóa lớp này." : "Không thể xóa lớp. Vui lòng thử lại.");
        return;
      }
      setClasses((current) => current.filter((item) => item.id !== pendingDelete.id));
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="mt-8">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand-600">Không gian giảng dạy</p>
          <h2 className="mt-1 text-2xl font-black text-gray-950">Lớp học của tôi</h2>
          <p className="mt-1 text-sm text-gray-500">{loading ? "Đang tải…" : `${classes.length} lớp học · Mã và link mời được đặt an toàn bên trong từng lớp.`}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-lg">
          <Plus className="h-4 w-4" />Tạo lớp mới
        </button>
      </div>

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <Skeleton key={item} />)}</div>
      ) : classes.length === 0 ? (
        <div className="rounded-[2rem] border-2 border-dashed border-gray-200 bg-white py-16 text-center">
          <BookOpenCheck className="mx-auto h-12 w-12 text-brand-400" />
          <h3 className="mt-4 text-lg font-extrabold text-gray-900">Bắt đầu với lớp học đầu tiên</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">Tạo lớp để giao đề, xây khóa học và quản lý tiến độ của học sinh.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((cls, index) => {
            const theme = THEMES[index % THEMES.length];
            const occupancy = cls.maxStudents ? Math.min(100, Math.round(cls.studentCount / cls.maxStudents * 100)) : 0;
            return (
              <article key={cls.id} className="group overflow-hidden rounded-[1.7rem] border border-gray-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                <div className={`relative min-h-36 bg-gradient-to-br ${theme.gradient} p-5 text-white`}>
                  <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full border-[20px] border-white/10" />
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest backdrop-blur">{cls.isActive ? "Đang hoạt động" : "Đã đóng"}</span>
                    <GraduationCap className="h-6 w-6 text-white/75" />
                  </div>
                  <h3 className="mt-5 line-clamp-2 text-xl font-black leading-snug">{cls.name}</h3>
                </div>
                <div className="p-5">
                  <p className="line-clamp-2 min-h-10 text-sm leading-5 text-gray-500">{cls.description || "Không gian học tập, học liệu và bài kiểm tra của lớp."}</p>
                  <div className={`mt-4 rounded-2xl ${theme.pale} p-3`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className={`flex items-center gap-1.5 font-bold ${theme.label}`}><UsersRound className="h-4 w-4" />{cls.studentCount} học sinh</span>
                      {cls.maxStudents && <span className="text-gray-500">Tối đa {cls.maxStudents}</span>}
                    </div>
                    {cls.maxStudents && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white"><div className={`h-full bg-gradient-to-r ${theme.gradient}`} style={{ width: `${occupancy}%` }} /></div>}
                  </div>
                  <div className="mt-5 flex items-center justify-between">
                    <Link href={`/teacher/classes/${cls.id}`} className="inline-flex items-center gap-1.5 text-sm font-extrabold text-brand-700">Mở lớp <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>
                    <button onClick={() => { setDeleteError(null); setPendingDelete(cls); }} className="rounded-lg p-2 text-gray-300 transition hover:bg-danger-50 hover:text-danger-600" aria-label={`Xóa lớp ${cls.name}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-50 text-danger-600"><Trash2 className="h-5 w-5" /></div>
            <h3 className="mt-4 text-xl font-black text-gray-900">Xóa lớp “{pendingDelete.name}”?</h3>
            <p className="mt-2 text-sm leading-6 text-gray-500">Học liệu, danh sách thành viên và tiến độ liên quan sẽ bị xóa. Hành động này không thể hoàn tác.</p>
            {deleteError && <p className="mt-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-700">{deleteError}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button disabled={deleting} onClick={() => setPendingDelete(null)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100">Hủy</button>
              <button disabled={deleting} onClick={handleConfirmDelete} className="rounded-xl bg-danger-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{deleting ? "Đang xóa…" : "Xóa lớp"}</button>
            </div>
          </div>
        </div>
      )}

      {showModal && <CreateClassModal onClose={() => setShowModal(false)} onCreated={(result) => {
        setClasses((current) => [...current, { id: result.classId, name: result.name, classCode: result.classCode, description: "", studentCount: 0, isActive: true }]);
        setShowModal(false);
      }} />}
    </section>
  );
}
