"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpenCheck,
  Building2,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Mail,
  School,
  UsersRound,
} from "lucide-react";
import AdminGuard from "@/components/AdminGuard";
import { useAuth } from "@/lib/AuthContext";

interface LessonSummary {
  id: string;
  title: string;
  description: string;
  resourceCount: number;
}

interface CourseSummary {
  id: string;
  title: string;
  description: string;
  published: boolean;
  createdAt: string | null;
  lessons: LessonSummary[];
}

interface ClassSummary {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  studentCount: number;
  createdAt: string | null;
  courses: CourseSummary[];
}

interface TeacherSummary {
  uid: string;
  fullName: string;
  email: string;
  school: string;
  role: string;
}

interface TeachingSpaceResponse {
  teacher: TeacherSummary;
  classes: ClassSummary[];
}

export default function AdminUserTeachingSpacePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<TeachingSpaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!user || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const send = async (refresh: boolean) => fetch(
        `/api/admin/users/${encodeURIComponent(userId)}/classes`,
        {
          headers: { Authorization: `Bearer ${await user.getIdToken(refresh)}` },
          cache: "no-store",
        },
      );
      let response = await send(false);
      if (response.status === 401) response = await send(true);
      const payload = await response.json().catch(() => null) as TeachingSpaceResponse | { error?: string } | null;
      if (!response.ok || !payload || !("teacher" in payload)) {
        throw new Error(payload && "error" in payload ? payload.error : "LOAD_FAILED");
      }
      setData(payload);
    } catch (loadError) {
      console.error("Không thể tải không gian giảng dạy:", loadError);
      setError("Không thể tải lớp học và bài học của tài khoản này.");
    } finally {
      setLoading(false);
    }
  }, [user, userId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AdminGuard adminOnly>
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <Link href="/admin/users" className="inline-flex items-center gap-2 text-sm font-bold text-brand-700 hover:text-brand-900">
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách người dùng
        </Link>

        {loading ? (
          <div className="mt-8 space-y-5">
            <div className="h-44 animate-pulse rounded-[2rem] bg-white" />
            <div className="h-72 animate-pulse rounded-[2rem] bg-white" />
          </div>
        ) : error || !data ? (
          <div className="mt-8 rounded-[2rem] border border-danger-200 bg-danger-50 p-10 text-center">
            <p className="font-bold text-danger-700">{error}</p>
            <button onClick={() => void load()} className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-bold text-danger-700 shadow-sm">Tải lại</button>
          </div>
        ) : (
          <>
            <section className="relative mt-6 overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#34241c] via-[#633c27] to-[#a15b2d] p-7 text-white shadow-xl shadow-brand-900/10">
              <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full border-[32px] border-white/10" />
              <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-white/60">Không gian giảng dạy · Chỉ xem</p>
                  <h1 className="mt-3 text-3xl font-black">{data.teacher.fullName}</h1>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm text-white/80">
                    <span className="inline-flex items-center gap-2"><Mail className="h-4 w-4" />{data.teacher.email}</span>
                    {data.teacher.school && <span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4" />{data.teacher.school}</span>}
                  </div>
                </div>
                <div className="rounded-2xl bg-white/10 px-5 py-4 backdrop-blur">
                  <p className="text-3xl font-black">{data.classes.length}</p>
                  <p className="text-xs font-bold uppercase tracking-wider text-white/65">Lớp học đã tạo</p>
                </div>
              </div>
            </section>

            <div className="mt-8 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-600">Danh mục của giáo viên</p>
                <h2 className="mt-1 text-2xl font-black text-gray-950">Lớp, khóa học và bài học</h2>
              </div>
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-gray-500 shadow-sm">Không có quyền chỉnh sửa</span>
            </div>

            {data.classes.length === 0 ? (
              <div className="mt-5 rounded-[2rem] border-2 border-dashed border-gray-200 bg-white py-16 text-center">
                <School className="mx-auto h-11 w-11 text-brand-300" />
                <h3 className="mt-4 font-extrabold text-gray-900">Giáo viên chưa tạo lớp học</h3>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                {data.classes.map((classroom) => (
                  <article key={classroom.id} className="overflow-hidden rounded-[1.75rem] border border-[#eadfd5] bg-white shadow-sm">
                    <div className="flex flex-col justify-between gap-4 border-b border-[#f0e8e0] bg-[#fffaf5] p-6 sm:flex-row sm:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-black text-gray-950">{classroom.name}</h3>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${classroom.isActive ? "bg-success-100 text-success-700" : "bg-gray-100 text-gray-500"}`}>
                            {classroom.isActive ? "Đang hoạt động" : "Đã đóng"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">{classroom.description || "Chưa có mô tả lớp học."}</p>
                      </div>
                      <div className="flex gap-3 text-xs font-bold text-gray-600">
                        <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2"><UsersRound className="h-4 w-4 text-brand-600" />{classroom.studentCount} học sinh</span>
                        <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2"><GraduationCap className="h-4 w-4 text-brand-600" />{classroom.courses.length} khóa học</span>
                      </div>
                    </div>

                    <div className="space-y-3 p-5">
                      {classroom.courses.length === 0 ? (
                        <p className="rounded-2xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">Lớp chưa có khóa học.</p>
                      ) : classroom.courses.map((course) => {
                        const isOpen = Boolean(expanded[course.id]);
                        return (
                          <div key={course.id} className="overflow-hidden rounded-2xl border border-gray-100">
                            <button
                              type="button"
                              onClick={() => setExpanded((current) => ({ ...current, [course.id]: !isOpen }))}
                              className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-brand-50/40"
                            >
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><BookOpenCheck className="h-5 w-5" /></span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="font-extrabold text-gray-900">{course.title}</span>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${course.published ? "bg-success-100 text-success-700" : "bg-amber-100 text-amber-700"}`}>{course.published ? "Đã xuất bản" : "Bản nháp"}</span>
                                </span>
                                <span className="mt-1 block text-xs text-gray-500">{course.lessons.length} bài học · {course.description || "Chưa có mô tả"}</span>
                              </span>
                              {isOpen ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
                            </button>
                            {isOpen && (
                              <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
                                {course.lessons.length === 0 ? (
                                  <p className="py-4 text-center text-xs text-gray-400">Khóa học chưa có bài học.</p>
                                ) : (
                                  <ol className="space-y-2">
                                    {course.lessons.map((lesson, index) => (
                                      <li key={lesson.id || `${course.id}-${index}`} className="flex gap-3 rounded-xl bg-white p-3">
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-xs font-black text-brand-700">{index + 1}</span>
                                        <div>
                                          <p className="text-sm font-bold text-gray-800">{lesson.title}</p>
                                          <p className="mt-0.5 text-xs text-gray-500">{lesson.description || "Không có mô tả"} · {lesson.resourceCount} học liệu</p>
                                        </div>
                                      </li>
                                    ))}
                                  </ol>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AdminGuard>
  );
}
