"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import type {
  ClassCourseLesson,
  ClassCourseResource,
  ClassExamStatus,
  ClassExamSummary,
  ClassResourceType,
} from "@/utils/classroomTypes";

interface CourseView {
  id: string;
  title: string;
  description: string;
  published: boolean;
  lessons: ClassCourseLesson[];
  createdAt: string | null;
  updatedAt: string | null;
}

interface ContentResponse {
  class: { id: string; name: string; description: string; teacherName: string };
  viewerRole: "teacher" | "student";
  courses: CourseView[];
  exams: ClassExamSummary[];
}

interface CourseDraft {
  id?: string;
  title: string;
  description: string;
  published: boolean;
}

interface ResourceDraft {
  courseId: string;
  lessonId: string;
  resourceId?: string;
  title: string;
  description: string;
  type: ClassResourceType;
  url: string;
}

interface LessonDraft {
  courseId: string;
  lessonId?: string;
  title: string;
  description: string;
}

interface Props {
  classId: string;
  teacherMode?: boolean;
  showClassHeader?: boolean;
}

const STATUS_META: Record<ClassExamStatus, { label: string; classes: string; order: number }> = {
  open: { label: "Đang mở", classes: "bg-success-100 text-success-700", order: 0 },
  upcoming: { label: "Sắp mở", classes: "bg-brand-100 text-brand-800", order: 1 },
  closed: { label: "Đã đóng", classes: "bg-gray-100 text-gray-600", order: 2 },
};

const RESOURCE_META: Record<ClassResourceType, { label: string; icon: string }> = {
  pdf: { label: "PDF / tài liệu", icon: "📄" },
  video: { label: "Video", icon: "▶️" },
  slides: { label: "PPTX / Slides", icon: "📊" },
};

function formatDate(value: string | null): string {
  if (!value) return "Chưa có thời gian";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có thời gian";
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resourceToDraft(
  courseId: string,
  lessonId: string,
  resource?: ClassCourseResource,
): ResourceDraft {
  return {
    courseId,
    lessonId,
    resourceId: resource?.id,
    title: resource?.title ?? "",
    description: resource?.description ?? "",
    type: resource?.type ?? "pdf",
    url: resource?.url ?? "",
  };
}

export default function ClassLearningContent({
  classId,
  teacherMode = false,
  showClassHeader = false,
}: Props) {
  const { user } = useAuth();
  const [data, setData] = useState<ContentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courseDraft, setCourseDraft] = useState<CourseDraft | null>(null);
  const [lessonDraft, setLessonDraft] = useState<LessonDraft | null>(null);
  const [resourceDraft, setResourceDraft] = useState<ResourceDraft | null>(null);
  const [examFilter, setExamFilter] = useState<"all" | ClassExamStatus>("all");
  const [examSort, setExamSort] = useState<"status" | "newest" | "oldest">("status");

  const loadContent = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/classes/${encodeURIComponent(classId)}/content`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as ContentResponse | { error?: string } | null;
      if (!response.ok || !payload || !("courses" in payload)) {
        throw new Error(response.status === 403 ? "Bạn không có quyền xem nội dung lớp này." : "Không thể tải nội dung lớp học.");
      }
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không thể tải nội dung lớp học.");
    } finally {
      setLoading(false);
    }
  }, [classId, user]);

  useEffect(() => {
    queueMicrotask(() => void loadContent());
  }, [loadContent]);

  const mutate = async (method: "POST" | "PATCH" | "DELETE", body?: object, query = "") => {
    if (!user) throw new Error("Phiên đăng nhập đã hết hạn.");
    const token = await user.getIdToken();
    const response = await fetch(
      `/api/classes/${encodeURIComponent(classId)}/content${query}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      const messages: Record<string, string> = {
        INVALID_URL: "Liên kết không hợp lệ. Hãy dùng liên kết http hoặc https có quyền xem.",
        RESOURCE_LIMIT: "Mỗi bài học hỗ trợ tối đa 100 tài nguyên.",
        LESSON_LIMIT: "Mỗi khóa học hỗ trợ tối đa 100 bài học.",
        LESSON_NOT_FOUND: "Không tìm thấy bài học. Vui lòng tải lại trang.",
        FORBIDDEN: "Bạn không có quyền thay đổi nội dung lớp này.",
        INVALID_INPUT: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.",
      };
      throw new Error(messages[payload?.error ?? ""] ?? "Không thể lưu thay đổi. Vui lòng thử lại.");
    }
  };

  const saveCourse = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!courseDraft?.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (courseDraft.id) {
        await mutate("PATCH", {
          action: "update_course",
          courseId: courseDraft.id,
          title: courseDraft.title,
          description: courseDraft.description,
          published: courseDraft.published,
        });
      } else {
        await mutate("POST", {
          title: courseDraft.title,
          description: courseDraft.description,
          published: courseDraft.published,
        });
      }
      setCourseDraft(null);
      await loadContent();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không thể lưu khóa học.");
    } finally {
      setSaving(false);
    }
  };

  const saveResource = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resourceDraft?.title.trim() || !resourceDraft.url.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await mutate("PATCH", {
        action: "save_resource",
        courseId: resourceDraft.courseId,
        lessonId: resourceDraft.lessonId,
        resourceId: resourceDraft.resourceId,
        title: resourceDraft.title,
        description: resourceDraft.description,
        type: resourceDraft.type,
        url: resourceDraft.url,
      });
      setResourceDraft(null);
      await loadContent();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không thể lưu tài nguyên.");
    } finally {
      setSaving(false);
    }
  };

  const saveLesson = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!lessonDraft?.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await mutate("PATCH", {
        action: "save_lesson",
        courseId: lessonDraft.courseId,
        lessonId: lessonDraft.lessonId,
        title: lessonDraft.title,
        description: lessonDraft.description,
      });
      setLessonDraft(null);
      await loadContent();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không thể lưu bài học.");
    } finally {
      setSaving(false);
    }
  };

  const deleteCourse = async (course: CourseView) => {
    if (!window.confirm(`Xóa khóa học “${course.title}” và toàn bộ tài nguyên bên trong?`)) return;
    setSaving(true);
    try {
      await mutate("DELETE", undefined, `?courseId=${encodeURIComponent(course.id)}`);
      await loadContent();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Không thể xóa khóa học.");
    } finally {
      setSaving(false);
    }
  };

  const resourceAction = async (
    courseId: string,
    lessonId: string,
    resourceId: string,
    action: "delete_resource" | "move_resource",
    direction?: "up" | "down",
  ) => {
    if (action === "delete_resource" && !window.confirm("Xóa tài nguyên này khỏi khóa học?")) return;
    setSaving(true);
    try {
      await mutate("PATCH", { action, courseId, lessonId, resourceId, direction });
      await loadContent();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Không thể cập nhật tài nguyên.");
    } finally {
      setSaving(false);
    }
  };

  const lessonAction = async (
    courseId: string,
    lesson: ClassCourseLesson,
    action: "delete_lesson" | "move_lesson",
    direction?: "up" | "down",
  ) => {
    if (
      action === "delete_lesson" &&
      !window.confirm(`Xóa bài học “${lesson.title}” cùng ${lesson.resources.length} tài nguyên bên trong?`)
    ) return;
    setSaving(true);
    try {
      await mutate("PATCH", { action, courseId, lessonId: lesson.id, direction });
      await loadContent();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Không thể cập nhật bài học.");
    } finally {
      setSaving(false);
    }
  };

  const visibleExams = useMemo(() => {
    const filtered = (data?.exams ?? []).filter((exam) => examFilter === "all" || exam.status === examFilter);
    return [...filtered].sort((a, b) => {
      const createdA = a.createdAt ? Date.parse(a.createdAt) : 0;
      const createdB = b.createdAt ? Date.parse(b.createdAt) : 0;
      if (examSort === "newest") return createdB - createdA;
      if (examSort === "oldest") return createdA - createdB;
      return STATUS_META[a.status].order - STATUS_META[b.status].order || createdB - createdA;
    });
  }, [data?.exams, examFilter, examSort]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-sm font-semibold text-gray-500">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
        Đang tải không gian học tập…
      </div>
    );
  }

  if (!data) {
    return <div className="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-sm text-danger-700">{error}</div>;
  }

  const canEdit = teacherMode && data.viewerRole === "teacher";

  return (
    <div className="space-y-8">
      {showClassHeader && (
        <header className="rounded-3xl bg-gradient-to-r from-brand-700 to-brand-600 p-7 text-white shadow-lg sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-100">Không gian lớp học</p>
          <h1 className="mt-2 text-3xl font-extrabold">{data.class.name}</h1>
          <p className="mt-2 text-sm text-brand-100">Giáo viên: {data.class.teacherName || "—"}</p>
          {data.class.description && <p className="mt-4 max-w-2xl text-sm leading-7 text-white/85">{data.class.description}</p>}
        </header>
      )}

      {error && (
        <div className="rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</div>
      )}

      <section className="space-y-4" aria-labelledby="course-section-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Tài liệu học tập</p>
            <h2 id="course-section-title" className="mt-1 text-2xl font-extrabold text-gray-900">Khóa học trong lớp</h2>
            <p className="mt-1 text-sm text-gray-500">Có thể tổ chức theo chương, chủ đề hoặc bất kỳ lộ trình nào phù hợp.</p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setCourseDraft({ title: "", description: "", published: true })}
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700"
            >
              + Tạo khóa học
            </button>
          )}
        </div>

        {courseDraft && (
          <form onSubmit={saveCourse} className="space-y-4 rounded-3xl border-2 border-brand-200 bg-brand-50/50 p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-extrabold text-brand-900">{courseDraft.id ? "Chỉnh sửa khóa học" : "Khóa học mới"}</h3>
              <button type="button" onClick={() => setCourseDraft(null)} className="text-sm font-bold text-gray-500">Đóng</button>
            </div>
            <label className="block text-sm font-bold text-gray-700">
              Tên khóa học
              <input
                value={courseDraft.title}
                onChange={(event) => setCourseDraft({ ...courseDraft, title: event.target.value })}
                maxLength={120}
                required
                placeholder="Ví dụ: Chương 1 – Hàm số"
                className="mt-1.5 w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 font-normal outline-none focus:border-brand-500"
              />
            </label>
            <label className="block text-sm font-bold text-gray-700">
              Mô tả
              <textarea
                value={courseDraft.description}
                onChange={(event) => setCourseDraft({ ...courseDraft, description: event.target.value })}
                maxLength={1000}
                rows={3}
                className="mt-1.5 w-full resize-none rounded-xl border-2 border-gray-200 bg-white px-4 py-3 font-normal outline-none focus:border-brand-500"
              />
            </label>
            <label className="flex items-center gap-3 text-sm font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={courseDraft.published}
                onChange={(event) => setCourseDraft({ ...courseDraft, published: event.target.checked })}
                className="h-4 w-4 accent-brand-600"
              />
              Xuất bản để học sinh nhìn thấy
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCourseDraft(null)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-white">Hủy</button>
              <button disabled={saving} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Đang lưu…" : "Lưu khóa học"}</button>
            </div>
          </form>
        )}

        {data.courses.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
            <div className="text-4xl">📚</div>
            <p className="mt-3 font-bold text-gray-700">Chưa có khóa học nào</p>
            <p className="mt-1 text-sm text-gray-400">{canEdit ? "Hãy tạo khóa học đầu tiên và thêm tài liệu cho học sinh." : "Giáo viên chưa xuất bản nội dung học tập."}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {data.courses.map((course) => (
              <article key={course.id} className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 px-5 py-5 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-extrabold text-gray-900">{course.title}</h3>
                      {canEdit && (
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${course.published ? "bg-success-100 text-success-700" : "bg-gray-100 text-gray-500"}`}>
                          {course.published ? "Đã xuất bản" : "Bản nháp"}
                        </span>
                      )}
                    </div>
                    {course.description && <p className="mt-2 text-sm leading-6 text-gray-500">{course.description}</p>}
                    <p className="mt-2 text-xs text-gray-400">
                      {course.lessons.length} bài học · {course.lessons.reduce((sum, lesson) => sum + lesson.resources.length, 0)} tài nguyên · Tạo {formatDate(course.createdAt)}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCourseDraft({ id: course.id, title: course.title, description: course.description, published: course.published })}
                        className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-200"
                      >Sửa</button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void deleteCourse(course)}
                        className="rounded-lg bg-danger-50 px-3 py-2 text-xs font-bold text-danger-600 hover:bg-danger-100"
                      >Xóa</button>
                    </div>
                  )}
                </div>

                <div className="space-y-4 p-5 sm:p-6">
                  {course.lessons.map((lesson, lessonIndex) => (
                    <section key={lesson.id} className="overflow-hidden rounded-2xl border border-brand-100 bg-brand-50/30">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-100 px-4 py-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">Bài học {lessonIndex + 1}</p>
                          <h4 className="mt-1 text-lg font-extrabold text-gray-900">{lesson.title}</h4>
                          {lesson.description && <p className="mt-1 text-sm leading-6 text-gray-500">{lesson.description}</p>}
                          <p className="mt-1 text-xs text-gray-400">{lesson.resources.length} tài nguyên</p>
                        </div>
                        {canEdit && (
                          <div className="flex flex-wrap gap-1.5">
                            <button disabled={saving || lessonIndex === 0} onClick={() => void lessonAction(course.id, lesson, "move_lesson", "up")} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold disabled:opacity-30">↑</button>
                            <button disabled={saving || lessonIndex === course.lessons.length - 1} onClick={() => void lessonAction(course.id, lesson, "move_lesson", "down")} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold disabled:opacity-30">↓</button>
                            <button onClick={() => setLessonDraft({ courseId: course.id, lessonId: lesson.id, title: lesson.title, description: lesson.description ?? "" })} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-brand-700">Sửa</button>
                            <button onClick={() => void lessonAction(course.id, lesson, "delete_lesson")} className="rounded-lg bg-danger-50 px-3 py-1.5 text-xs font-bold text-danger-600">Xóa</button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3 p-4">
                        {lesson.resources.map((resource, index) => (
                          <details key={resource.id} className="group rounded-2xl border border-gray-200 bg-white open:shadow-sm">
                            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-lg">{RESOURCE_META[resource.type].icon}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-bold text-gray-900">{resource.title}</span>
                                <span className="mt-0.5 block text-xs text-gray-400">{RESOURCE_META[resource.type].label} · {resource.provider}</span>
                              </span>
                              <span className="text-gray-400 transition group-open:rotate-180">⌄</span>
                            </summary>
                            <div className="border-t border-gray-100 p-4">
                              {resource.description && <p className="mb-4 text-sm leading-6 text-gray-600">{resource.description}</p>}
                              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
                                <iframe
                                  src={resource.embedUrl}
                                  title={resource.title}
                                  className="h-[420px] w-full sm:h-[520px]"
                                  loading="lazy"
                                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                                  allowFullScreen
                                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-downloads"
                                  referrerPolicy="strict-origin-when-cross-origin"
                                />
                              </div>
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                <a href={resource.url} target="_blank" rel="noreferrer" className="text-sm font-bold text-brand-700 hover:underline">Mở liên kết gốc ↗</a>
                                {canEdit && (
                                  <div className="flex flex-wrap gap-1.5">
                                    <button disabled={saving || index === 0} onClick={() => void resourceAction(course.id, lesson.id, resource.id, "move_resource", "up")} className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-bold disabled:opacity-30">↑</button>
                                    <button disabled={saving || index === lesson.resources.length - 1} onClick={() => void resourceAction(course.id, lesson.id, resource.id, "move_resource", "down")} className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-bold disabled:opacity-30">↓</button>
                                    <button onClick={() => setResourceDraft(resourceToDraft(course.id, lesson.id, resource))} className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700">Sửa</button>
                                    <button onClick={() => void resourceAction(course.id, lesson.id, resource.id, "delete_resource")} className="rounded-lg bg-danger-50 px-3 py-1.5 text-xs font-bold text-danger-600">Xóa</button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </details>
                        ))}

                        {lesson.resources.length === 0 && <p className="py-3 text-center text-sm text-gray-400">Bài học chưa có tài nguyên.</p>}
                        {canEdit && (
                          <button type="button" onClick={() => setResourceDraft(resourceToDraft(course.id, lesson.id))} className="w-full rounded-xl border-2 border-dashed border-brand-200 bg-white py-3 text-sm font-bold text-brand-700 transition hover:bg-brand-50">
                            + Thêm PDF, video hoặc PPTX vào bài học
                          </button>
                        )}
                      </div>
                    </section>
                  ))}

                  {course.lessons.length === 0 && <p className="py-5 text-center text-sm text-gray-400">Khóa học chưa có bài học.</p>}
                  {canEdit && (
                    <button type="button" onClick={() => setLessonDraft({ courseId: course.id, title: "", description: "" })} className="w-full rounded-xl border-2 border-dashed border-brand-300 py-3 text-sm font-bold text-brand-800 transition hover:bg-brand-50">
                      + Tạo bài học mới
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {lessonDraft && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Biểu mẫu bài học">
          <form onSubmit={saveLesson} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-3xl border-2 border-brand-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-extrabold text-gray-900">{lessonDraft.lessonId ? "Chỉnh sửa bài học" : "Bài học mới"}</h3>
              <button type="button" onClick={() => setLessonDraft(null)} className="text-sm font-bold text-gray-500">Đóng</button>
            </div>
            <label className="block text-sm font-bold text-gray-700">
              Tên bài học
              <input
                value={lessonDraft.title}
                onChange={(event) => setLessonDraft({ ...lessonDraft, title: event.target.value })}
                maxLength={160}
                required
                placeholder="Ví dụ: Bài 1 – Sự đồng biến và nghịch biến"
                className="mt-1.5 w-full rounded-xl border-2 border-gray-200 px-4 py-3 font-normal outline-none focus:border-brand-500"
              />
            </label>
            <label className="block text-sm font-bold text-gray-700">
              Mô tả bài học
              <textarea
                value={lessonDraft.description}
                onChange={(event) => setLessonDraft({ ...lessonDraft, description: event.target.value })}
                maxLength={1000}
                rows={3}
                placeholder="Mục tiêu, nội dung hoặc hướng dẫn học…"
                className="mt-1.5 w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 font-normal outline-none focus:border-brand-500"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setLessonDraft(null)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-gray-600">Hủy</button>
              <button disabled={saving} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Đang lưu…" : "Lưu bài học"}</button>
            </div>
          </form>
          </div>
        )}

        {resourceDraft && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Biểu mẫu tài nguyên">
          <form onSubmit={saveResource} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-3xl border-2 border-brand-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-extrabold text-gray-900">{resourceDraft.resourceId ? "Chỉnh sửa tài nguyên" : "Thêm tài nguyên"}</h3>
              <button type="button" onClick={() => setResourceDraft(null)} className="text-sm font-bold text-gray-500">Đóng</button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold text-gray-700">Loại tài nguyên
                <select value={resourceDraft.type} onChange={(event) => setResourceDraft({ ...resourceDraft, type: event.target.value as ClassResourceType })} className="mt-1.5 w-full rounded-xl border-2 border-gray-200 px-4 py-3 font-normal outline-none focus:border-brand-500">
                  <option value="pdf">PDF / tài liệu</option>
                  <option value="video">Video</option>
                  <option value="slides">PPTX / Google Slides</option>
                </select>
              </label>
              <label className="text-sm font-bold text-gray-700">Tên tài nguyên
                <input value={resourceDraft.title} onChange={(event) => setResourceDraft({ ...resourceDraft, title: event.target.value })} maxLength={160} required className="mt-1.5 w-full rounded-xl border-2 border-gray-200 px-4 py-3 font-normal outline-none focus:border-brand-500" />
              </label>
            </div>
            <label className="block text-sm font-bold text-gray-700">Liên kết chia sẻ
              <input type="url" value={resourceDraft.url} onChange={(event) => setResourceDraft({ ...resourceDraft, url: event.target.value })} required placeholder="https://drive.google.com/... hoặc liên kết có quyền xem" className="mt-1.5 w-full rounded-xl border-2 border-gray-200 px-4 py-3 font-normal outline-none focus:border-brand-500" />
              <span className="mt-1.5 block text-xs font-normal leading-5 text-gray-400">Hỗ trợ xem nhúng Google Drive, YouTube, Vimeo, Google Slides và các liên kết công khai cho phép iframe.</span>
            </label>
            <label className="block text-sm font-bold text-gray-700">Mô tả
              <textarea value={resourceDraft.description} onChange={(event) => setResourceDraft({ ...resourceDraft, description: event.target.value })} maxLength={1000} rows={2} className="mt-1.5 w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 font-normal outline-none focus:border-brand-500" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setResourceDraft(null)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-gray-600">Hủy</button>
              <button disabled={saving} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Đang lưu…" : "Lưu tài nguyên"}</button>
            </div>
          </form>
          </div>
        )}
      </section>

      <section className="space-y-4 border-t border-gray-200 pt-8" aria-labelledby="exam-section-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Được giao cho lớp</p>
            <h2 id="exam-section-title" className="mt-1 text-2xl font-extrabold text-gray-900">Bài kiểm tra và bài thi</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={examFilter} onChange={(event) => setExamFilter(event.target.value as "all" | ClassExamStatus)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-brand-500">
              <option value="all">Tất cả trạng thái</option>
              <option value="open">Đang mở</option>
              <option value="upcoming">Sắp mở</option>
              <option value="closed">Đã đóng</option>
            </select>
            <select value={examSort} onChange={(event) => setExamSort(event.target.value as "status" | "newest" | "oldest")} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-brand-500">
              <option value="status">Theo trạng thái</option>
              <option value="newest">Mới tạo trước</option>
              <option value="oldest">Cũ tạo trước</option>
            </select>
          </div>
        </div>

        {visibleExams.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-400">Không có bài kiểm tra trong bộ lọc này.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {visibleExams.map((exam) => {
              const status = STATUS_META[exam.status];
              const studentCanStart = exam.status === "open";
              const href = canEdit
                ? `/admin/exam/${exam.id}`
                : exam.submitted && exam.submissionId
                  ? `/student/review/${exam.submissionId}`
                  : `/quiz/${exam.id}`;
              return (
                <article key={exam.id} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.classes}`}>{status.label}</span>
                    {exam.submitted && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">Đã nộp{typeof exam.totalScore === "number" ? ` · ${exam.totalScore} điểm` : ""}</span>}
                  </div>
                  <h3 className="mt-4 text-lg font-extrabold text-gray-900">{exam.title}</h3>
                  {exam.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-500">{exam.description}</p>}
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-gray-500">
                    <div><dt className="font-bold text-gray-700">Số câu</dt><dd>{exam.questionCount}</dd></div>
                    <div><dt className="font-bold text-gray-700">Thời lượng</dt><dd>{exam.duration ? `${exam.duration} phút` : "Không giới hạn"}</dd></div>
                    <div><dt className="font-bold text-gray-700">Mở đề</dt><dd>{exam.startTime ? formatDate(exam.startTime) : "Ngay lập tức"}</dd></div>
                    <div><dt className="font-bold text-gray-700">Đóng đề</dt><dd>{exam.endTime ? formatDate(exam.endTime) : "Không giới hạn"}</dd></div>
                  </dl>
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
                    <span className="text-xs text-gray-400">Tạo {formatDate(exam.createdAt)}</span>
                    {(canEdit || studentCanStart || exam.submitted) ? (
                      <Link href={href} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">
                        {canEdit ? "Xem bài thi" : exam.submitted ? "Xem kết quả" : "Làm bài"}
                      </Link>
                    ) : (
                      <span className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-bold text-gray-400">{exam.status === "upcoming" ? "Chưa mở" : "Đã đóng"}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
