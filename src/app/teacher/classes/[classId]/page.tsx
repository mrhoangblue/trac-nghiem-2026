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

        const row = { ...cd, id: cref.id };

        if (!isAdmin && cd.teacherId !== user.uid) {
          if (!cancelled) setError("Bạn không có quyền xem lớp này.");
          return;
        }

        if (!cancelled) setClassData(row);

        const ids = cd.studentIds ?? [];
        const rows: StudentRow[] = [];

        if (ids.length > 0) {
          const batches = chunkIds(ids, FIRESTORE_IN_LIMIT);
          for (const batch of batches) {
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
      } catch {
        if (!cancelled) setError("Không thể tải dữ liệu.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [classId, user?.uid, isAdmin]);

  return (
    <AdminGuard>
      <div className="max-w-5xl mx-auto px-4 py-10 w-full">
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/teacher/classes"
            className="text-indigo-600 hover:text-indigo-800 font-semibold"
          >
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
            <header className="mb-8 rounded-3xl bg-gradient-to-r from-indigo-600 to-blue-700 text-white p-8 shadow-lg">
              <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-1">
                Lớp học
              </p>
              <h1 className="text-3xl font-extrabold">{classData.name}</h1>
              <div className="mt-4 inline-flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="text-sm text-indigo-100 font-medium">
                  Mã lớp:{" "}
                  <strong className="text-white tracking-[0.35em] text-lg font-black font-mono">
                    {classData.classCode}
                  </strong>
                </span>
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                  {students.length} học sinh đã vào lớp
                </span>
              </div>
            </header>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50">
                <h2 className="font-extrabold text-gray-900">Danh sách học sinh</h2>
                <p className="text-gray-500 text-sm mt-0.5">
                  Chọn một dòng để xem các bài thi của học sinh (đối với đề bạn là tác giả).
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
                          <td className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">
                            {s.fullName}
                          </td>
                          <td className="px-4 py-4 text-gray-500 text-xs">{s.email || "—"}</td>
                          <td className="px-4 py-4 text-gray-600 text-xs">{s.school || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </AdminGuard>
  );
}
