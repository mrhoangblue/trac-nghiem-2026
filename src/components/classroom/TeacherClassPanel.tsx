"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import CreateClassModal from "./CreateClassModal";
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
  teacherName: string;
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

export default function TeacherClassPanel({ teacherId, teacherName }: Props) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!teacherId) { setLoading(false); return; }
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
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 text-sm whitespace-nowrap"
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
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl text-sm transition-colors"
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
                  ? "border-indigo-100 hover:border-indigo-300"
                  : "border-gray-100 opacity-60"
              }`}
            >
              {/* Class name + status badge */}
              <div className="flex items-start justify-between gap-2">
                <p className="font-extrabold text-gray-900 leading-snug text-sm">{cls.name}</p>
                <span
                  className={`shrink-0 text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                    cls.isActive
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {cls.isActive ? "Đang mở" : "Đã đóng"}
                </span>
              </div>

              {/* Code display */}
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl px-4 py-4 text-center">
                <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mb-1.5">
                  Mã lớp học
                </p>
                <p className="text-4xl font-black tracking-[0.3em] text-indigo-700 font-mono select-all">
                  {cls.classCode}
                </p>
              </div>

              {/* Footer: student count + copy button */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  👨‍🎓 <span className="font-semibold text-gray-700">{cls.studentCount}</span> học sinh
                </span>
                <button
                  onClick={() => copyCode(cls.id, cls.classCode)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                    copiedId === cls.id
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700"
                  }`}
                >
                  {copiedId === cls.id ? "✓ Đã sao chép" : "📋 Sao chép"}
                </button>
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

      {showModal && (
        <CreateClassModal
          teacherId={teacherId}
          teacherName={teacherName}
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
