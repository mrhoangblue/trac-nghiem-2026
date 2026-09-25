"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { flattenCourseResources } from "@/utils/courseProgress";
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
  coverImageUrl: string;
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
  progress: Record<string, string[]>;
}

interface CourseDraft {
  id?: string;
  title: string;
  description: string;
  coverImageUrl: string;
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
  const [uploadingResource, setUploadingResource] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courseDraft, setCourseDraft] = useState<CourseDraft | null>(null);
  const [lessonDraft, setLessonDraft] = useState<LessonDraft | null>(null);
  const [resourceDraft, setResourceDraft] = useState<ResourceDraft | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [activeResourceId, setActiveResourceId] = useState<string | null>(null);
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
          coverImageUrl: courseDraft.coverImageUrl,
          published: courseDraft.published,
        });
      } else {
        await mutate("POST", {
          title: courseDraft.title,
          description: courseDraft.description,
          coverImageUrl: courseDraft.coverImageUrl,
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

  const uploadResourceFile = async (file: File | null) => {
    if (!file || !user || !resourceDraft) return;
    setUploadingResource(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/storage/presign", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size, folder: "learning-materials" }),
      });
      const payload = (await response.json().catch(() => null)) as { uploadUrl?: string; url?: string; contentType?: string; error?: string } | null;
      if (!response.ok || !payload?.uploadUrl || !payload.url) {
        const messages: Record<string, string> = {
          R2_NOT_READY: "Cloudflare R2 chưa được cấu hình đầy đủ hoặc chưa có public URL.",
          FILE_SIZE_INVALID: "File phải nhỏ hơn 100 MB.",
          FILE_TYPE_UNSUPPORTED: "Định dạng file này chưa được hỗ trợ.",
        };
        throw new Error(messages[payload?.error ?? ""] ?? "Không thể upload file lên R2.");
      }
      const uploadResponse = await fetch(payload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": payload.contentType || "application/octet-stream" },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("R2 từ chối file. Hãy kiểm tra CORS và quyền ghi của bucket.");
      const inferredType: ClassResourceType = file.type.startsWith("video/")
        ? "video"
        : file.name.toLowerCase().endsWith(".pptx")
          ? "slides"
          : "pdf";
      setResourceDraft((current) => current ? {
        ...current,
        url: payload.url ?? current.url,
        type: inferredType,
        title: current.title || file.name.replace(/\.[^.]+$/, ""),
      } : current);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Không thể upload file.");
    } finally {
      setUploadingResource(false);
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

  const openCourse = (course: CourseView) => {
    const resources = flattenCourseResources(course.lessons);
    const completed = new Set(data?.progress[course.id] ?? []);
    const firstAvailable = resources.find((resource, index) =>
      !completed.has(resource.id) && resources.slice(0, index).every((item) => completed.has(item.id)),
    );
    setSelectedCourseId(course.id);
    setActiveResourceId(firstAvailable?.id ?? resources[0]?.id ?? null);
  };

  const completeResource = async (course: CourseView, resource: ClassCourseResource) => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(
        `/api/classes/${encodeURIComponent(classId)}/content/progress`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ courseId: course.id, resourceId: resource.id }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { completedResourceIds?: string[]; error?: string }
        | null;
      if (!response.ok || !Array.isArray(payload?.completedResourceIds)) {
        throw new Error(
          payload?.error === "PREREQUISITE_REQUIRED"
            ? "Bạn cần hoàn thành tài nguyên trước đó."
            : "Không thể lưu tiến độ. Vui lòng thử lại.",
        );
      }

      const resources = flattenCourseResources(course.lessons);
      const currentIndex = resources.findIndex((item) => item.id === resource.id);
      await loadContent();
      setActiveResourceId(resources[currentIndex + 1]?.id ?? resource.id);
    } catch (progressError) {
      setError(progressError instanceof Error ? progressError.message : "Không thể lưu tiến độ.");
    } finally {
      setSaving(false);
    }
  };

  const selectedCourse = useMemo(
    () => data?.courses.find((course) => course.id === selectedCourseId) ?? null,
    [data?.courses, selectedCourseId],
  );
  const activeResource = useMemo(
    () => selectedCourse
      ? flattenCourseResources(selectedCourse.lessons).find((resource) => resource.id === activeResourceId) ?? null
      : null,
    [activeResourceId, selectedCourse],
  );

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
  const isStudentViewer = data.viewerRole === "student";

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
              onClick={() => setCourseDraft({ title: "", description: "", coverImageUrl: "", published: true })}
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
              Ảnh minh họa khóa học
              <input
                type="url"
                value={courseDraft.coverImageUrl}
                onChange={(event) => setCourseDraft({ ...courseDraft, coverImageUrl: event.target.value })}
                maxLength={2000}
                placeholder="https://.../anh-khoa-hoc.jpg"
                className="mt-1.5 w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 font-normal outline-none focus:border-brand-500"
              />
              <span className="mt-1.5 block text-xs font-normal text-gray-400">Dán liên kết ảnh công khai. Để trống, hệ thống dùng ảnh nền mặc định.</span>
              {/^https?:\/\//i.test(courseDraft.coverImageUrl) && (
                <span className="mt-3 block h-36 rounded-2xl bg-brand-100 bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(courseDraft.coverImageUrl)})` }} role="img" aria-label="Xem trước ảnh minh họa" />
              )}
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
          <>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {data.courses.map((course) => {
                const resources = flattenCourseResources(course.lessons);
                const completed = new Set(data.progress[course.id] ?? []);
                const completedCount = resources.filter((resource) => completed.has(resource.id)).length;
                const progressPercent = resources.length ? Math.round((completedCount / resources.length) * 100) : 0;
                return (
                  <article key={course.id} className={`group overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${selectedCourseId === course.id ? "border-brand-400 ring-2 ring-brand-100" : "border-gray-200"}`}>
                    <div
                      className="relative h-44 bg-gradient-to-br from-brand-800 via-brand-600 to-sunset bg-cover bg-center"
                      style={course.coverImageUrl ? { backgroundImage: `linear-gradient(180deg, transparent 30%, rgba(69,35,15,.68)), url(${JSON.stringify(course.coverImageUrl)})` } : undefined}
                    >
                      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white">
                        <span className="rounded-full bg-black/30 px-3 py-1 text-xs font-bold backdrop-blur-sm">{course.lessons.length} bài học</span>
                        {canEdit && <span className={`rounded-full px-3 py-1 text-xs font-bold backdrop-blur-sm ${course.published ? "bg-success-600/90" : "bg-gray-700/90"}`}>{course.published ? "Đã xuất bản" : "Bản nháp"}</span>}
                      </div>
                    </div>
                    <div className="p-5">
                      <h3 className="line-clamp-2 text-xl font-extrabold leading-7 text-gray-900">{course.title}</h3>
                      <p className="mt-2 line-clamp-2 min-h-12 text-sm leading-6 text-gray-500">{course.description || "Lộ trình học tập được giáo viên thiết kế cho lớp."}</p>
                      {isStudentViewer && (
                        <div className="mt-4">
                          <div className="mb-1.5 flex justify-between text-xs font-semibold text-gray-500"><span>Tiến độ</span><span>{progressPercent}%</span></div>
                          <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-sunset transition-all" style={{ width: `${progressPercent}%` }} /></div>
                        </div>
                      )}
                      <div className="mt-5 flex items-center justify-between gap-2 border-t border-gray-100 pt-4">
                        <span className="text-xs text-gray-400">{resources.length} tài nguyên</span>
                        <div className="flex gap-2">
                          {canEdit && <button type="button" onClick={() => setCourseDraft({ id: course.id, title: course.title, description: course.description, coverImageUrl: course.coverImageUrl, published: course.published })} className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-200">Sửa</button>}
                          <button type="button" onClick={() => openCourse(course)} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">{canEdit ? "Quản lý" : progressPercent > 0 ? "Học tiếp" : "Bắt đầu"}</button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {selectedCourse && (() => {
              const resources = flattenCourseResources(selectedCourse.lessons);
              const completedIds = new Set(data.progress[selectedCourse.id] ?? []);
              const completedCount = resources.filter((resource) => completedIds.has(resource.id)).length;
              const progressPercent = resources.length ? Math.round((completedCount / resources.length) * 100) : 0;
              const activeIndex = resources.findIndex((resource) => resource.id === activeResource?.id);
              const activeCompleted = activeResource ? completedIds.has(activeResource.id) : false;
              return (
                <div className="mt-8 overflow-hidden rounded-[2rem] border border-brand-200 bg-white shadow-xl">
                  <div className="relative overflow-hidden bg-brand-900 px-6 py-7 text-white sm:px-8">
                    {selectedCourse.coverImageUrl && <div className="absolute inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage: `url(${JSON.stringify(selectedCourse.coverImageUrl)})` }} />}
                    <div className="relative flex flex-wrap items-start justify-between gap-5">
                      <div className="max-w-2xl">
                        <button type="button" onClick={() => { setSelectedCourseId(null); setActiveResourceId(null); }} className="mb-4 text-xs font-bold text-brand-100 hover:text-white">← Danh sách khóa học</button>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-200">Lộ trình học tuần tự</p>
                        <h3 className="mt-2 text-2xl font-extrabold sm:text-3xl">{selectedCourse.title}</h3>
                        {selectedCourse.description && <p className="mt-3 text-sm leading-7 text-brand-100">{selectedCourse.description}</p>}
                      </div>
                      {canEdit && (
                        <div className="flex gap-2">
                          <button onClick={() => setCourseDraft({ id: selectedCourse.id, title: selectedCourse.title, description: selectedCourse.description, coverImageUrl: selectedCourse.coverImageUrl, published: selectedCourse.published })} className="rounded-xl bg-white/15 px-4 py-2 text-sm font-bold hover:bg-white/25">Sửa khóa học</button>
                          <button disabled={saving} onClick={() => void deleteCourse(selectedCourse)} className="rounded-xl bg-danger-500/80 px-4 py-2 text-sm font-bold hover:bg-danger-500">Xóa</button>
                        </div>
                      )}
                    </div>
                    {isStudentViewer && (
                      <div className="relative mt-6 max-w-xl">
                        <div className="mb-2 flex justify-between text-xs font-bold text-brand-100"><span>{completedCount}/{resources.length} nội dung đã hoàn thành</span><span>{progressPercent}%</span></div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-sunset transition-all" style={{ width: `${progressPercent}%` }} /></div>
                      </div>
                    )}
                  </div>

                  {activeResource && (
                    <div className="border-b border-gray-200 bg-[#fffdf9] p-5 sm:p-7">
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Nội dung {activeIndex + 1}/{resources.length} · {RESOURCE_META[activeResource.type].label}</p>
                          <h4 className="mt-1 text-xl font-extrabold text-gray-900">{activeResource.title}</h4>
                          {activeResource.description && <p className="mt-2 text-sm leading-6 text-gray-500">{activeResource.description}</p>}
                        </div>
                        {activeCompleted && <span className="rounded-full bg-success-100 px-3 py-1.5 text-xs font-bold text-success-700">✓ Đã hoàn thành</span>}
                      </div>
                      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-inner">
                        {activeResource.embedUrl ? (
                          <iframe src={activeResource.embedUrl} title={activeResource.title} className="h-[440px] w-full sm:h-[620px]" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-downloads" referrerPolicy="strict-origin-when-cross-origin" />
                        ) : (
                          <div className="flex h-64 flex-col items-center justify-center gap-3 px-5 text-center text-gray-500"><span className="text-3xl">🔒</span><p className="text-sm font-semibold">Hoàn thành nội dung trước để mở tài liệu này.</p></div>
                        )}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        {activeResource.url ? <a href={activeResource.url} target="_blank" rel="noreferrer" className="text-sm font-bold text-brand-700 hover:underline">Mở liên kết gốc ↗</a> : <span />}
                        {isStudentViewer && (
                          <button type="button" disabled={saving || activeCompleted || !activeResource.embedUrl} onClick={() => void completeResource(selectedCourse, activeResource)} className="rounded-xl bg-gradient-to-r from-brand-700 to-brand-600 px-5 py-3 text-sm font-bold text-white shadow-sm disabled:bg-none disabled:bg-success-600 disabled:opacity-80">
                            {activeCompleted ? "✓ Đã học xong" : saving ? "Đang lưu tiến độ…" : activeIndex === resources.length - 1 ? "Hoàn thành khóa học" : "Đã học xong · Mở nội dung tiếp theo →"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 p-5 sm:p-7">
                    <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Chương trình học</p><h4 className="mt-1 text-xl font-extrabold text-gray-900">Nội dung khóa học</h4></div>{canEdit && <button type="button" onClick={() => setLessonDraft({ courseId: selectedCourse.id, title: "", description: "" })} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white">+ Bài học</button>}</div>
                    {selectedCourse.lessons.map((lesson, lessonIndex) => (
                      <section key={lesson.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50/60">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-5">
                          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">Bài học {lessonIndex + 1}</p><h5 className="mt-1 font-extrabold text-gray-900">{lesson.title}</h5>{lesson.description && <p className="mt-1 text-sm text-gray-500">{lesson.description}</p>}</div>
                          {canEdit && <div className="flex flex-wrap gap-1.5"><button disabled={saving || lessonIndex === 0} onClick={() => void lessonAction(selectedCourse.id, lesson, "move_lesson", "up")} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold disabled:opacity-30">↑</button><button disabled={saving || lessonIndex === selectedCourse.lessons.length - 1} onClick={() => void lessonAction(selectedCourse.id, lesson, "move_lesson", "down")} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold disabled:opacity-30">↓</button><button onClick={() => setLessonDraft({ courseId: selectedCourse.id, lessonId: lesson.id, title: lesson.title, description: lesson.description ?? "" })} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-brand-700">Sửa</button><button onClick={() => void lessonAction(selectedCourse.id, lesson, "delete_lesson")} className="rounded-lg bg-danger-50 px-3 py-1.5 text-xs font-bold text-danger-600">Xóa</button></div>}
                        </div>
                        <div className="divide-y divide-gray-100 bg-white">
                          {lesson.resources.map((resource, resourceIndex) => {
                            const globalIndex = resources.findIndex((item) => item.id === resource.id);
                            const completed = completedIds.has(resource.id);
                            const locked = isStudentViewer && !resources.slice(0, globalIndex).every((item) => completedIds.has(item.id));
                            const active = activeResourceId === resource.id;
                            return (
                              <div key={resource.id} className={`flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5 ${active ? "bg-brand-50" : ""}`}>
                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm ${completed ? "bg-success-100 text-success-700" : locked ? "bg-gray-100 text-gray-400" : "bg-brand-100 text-brand-700"}`}>{completed ? "✓" : locked ? "🔒" : RESOURCE_META[resource.type].icon}</span>
                                <button type="button" disabled={locked} onClick={() => setActiveResourceId(resource.id)} className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"><span className={`block truncate text-sm font-bold ${locked ? "text-gray-400" : "text-gray-800"}`}>{globalIndex + 1}. {resource.title}</span><span className="mt-0.5 block text-xs text-gray-400">{locked ? "Hoàn thành nội dung trước để mở khóa" : `${RESOURCE_META[resource.type].label} · ${resource.provider}`}</span></button>
                                {canEdit && <div className="flex gap-1"><button disabled={saving || resourceIndex === 0} onClick={() => void resourceAction(selectedCourse.id, lesson.id, resource.id, "move_resource", "up")} className="rounded-lg bg-gray-100 px-2 py-1.5 text-xs font-bold disabled:opacity-30">↑</button><button disabled={saving || resourceIndex === lesson.resources.length - 1} onClick={() => void resourceAction(selectedCourse.id, lesson.id, resource.id, "move_resource", "down")} className="rounded-lg bg-gray-100 px-2 py-1.5 text-xs font-bold disabled:opacity-30">↓</button><button onClick={() => setResourceDraft(resourceToDraft(selectedCourse.id, lesson.id, resource))} className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-bold text-brand-700">Sửa</button><button onClick={() => void resourceAction(selectedCourse.id, lesson.id, resource.id, "delete_resource")} className="rounded-lg bg-danger-50 px-2.5 py-1.5 text-xs font-bold text-danger-600">Xóa</button></div>}
                              </div>
                            );
                          })}
                          {lesson.resources.length === 0 && <p className="px-5 py-4 text-sm text-gray-400">Bài học chưa có tài nguyên.</p>}
                          {canEdit && <button type="button" onClick={() => setResourceDraft(resourceToDraft(selectedCourse.id, lesson.id))} className="m-3 rounded-xl border-2 border-dashed border-brand-200 px-4 py-2.5 text-sm font-bold text-brand-700 hover:bg-brand-50">+ Thêm nội dung</button>}
                        </div>
                      </section>
                    ))}
                    {selectedCourse.lessons.length === 0 && <div className="rounded-2xl border border-dashed border-gray-300 py-10 text-center text-sm text-gray-400">Khóa học chưa có bài học.</div>}
                  </div>
                </div>
              );
            })()}
          </>
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
            <label className={`block rounded-2xl border-2 border-dashed p-4 text-center text-sm font-bold transition ${uploadingResource ? "cursor-wait border-gray-200 bg-gray-50 text-gray-400" : "cursor-pointer border-brand-200 bg-brand-50/60 text-brand-700 hover:border-brand-400"}`}>
              {uploadingResource ? "Đang upload lên Cloudflare R2…" : "Upload file trực tiếp lên R2"}
              <span className="mt-1 block text-xs font-normal text-gray-500">PDF, DOCX, PPTX, MP4/WebM hoặc ảnh · tối đa 100 MB</span>
              <input
                type="file"
                accept=".pdf,.docx,.pptx,.mp4,.webm,.png,.jpg,.jpeg,.webp,.svg"
                disabled={uploadingResource}
                className="sr-only"
                onChange={(event) => {
                  void uploadResourceFile(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
            </label>
            <label className="block text-sm font-bold text-gray-700">Liên kết chia sẻ
              <input type="url" value={resourceDraft.url} onChange={(event) => setResourceDraft({ ...resourceDraft, url: event.target.value })} required placeholder="https://drive.google.com/... hoặc liên kết có quyền xem" className="mt-1.5 w-full rounded-xl border-2 border-gray-200 px-4 py-3 font-normal outline-none focus:border-brand-500" />
              <span className="mt-1.5 block text-xs font-normal leading-5 text-gray-400">Có thể upload lên R2 ở trên hoặc dán liên kết Google Drive, YouTube, Vimeo, Google Slides và nguồn công khai.</span>
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
