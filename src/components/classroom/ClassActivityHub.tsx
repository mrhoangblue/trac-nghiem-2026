"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CalendarClock, ClipboardList, FileDown, Send, Upload, Users } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import type { AssignmentFileView, ClassAnnouncementView, ClassAssignmentView } from "@/utils/classroomTypes";

interface Props {
  classId: string;
  teacherMode?: boolean;
  section?: "announcements" | "assignments";
}

interface ActivityResponse {
  viewerRole: "teacher" | "student";
  announcements: ClassAnnouncementView[];
  assignments: ClassAssignmentView[];
}

interface SubmissionDraft {
  files: AssignmentFileView[];
  note: string;
}

function formatDate(value: string | null): string {
  if (!value) return "Không giới hạn";
  return new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function localDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function ClassActivityHub({ classId, teacherMode = false, section }: Props) {
  const { user } = useAuth();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [announcement, setAnnouncement] = useState({ title: "", body: "" });
  const [assignment, setAssignment] = useState({ title: "", description: "", dueAt: "" });
  const [assignmentFile, setAssignmentFile] = useState<AssignmentFileView | null>(null);
  const [uploading, setUploading] = useState("");
  const [submissionDrafts, setSubmissionDrafts] = useState<Record<string, SubmissionDraft>>({});
  const [deadlineDrafts, setDeadlineDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/classes/${encodeURIComponent(classId)}/activity`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json() as ActivityResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Không thể tải hoạt động lớp học.");
      setData(payload);
      setDeadlineDrafts((current) => Object.fromEntries(payload.assignments.map((item) => [item.id, current[item.id] ?? localDateTime(item.dueAt)])));
      return true;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không thể tải hoạt động lớp học.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [classId, user]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const uploadFile = async (file: File, purpose: "assignment" | "submission", assignmentId?: string): Promise<AssignmentFileView> => {
    if (!user) throw new Error("Phiên đăng nhập đã hết hạn.");
    const token = await user.getIdToken();
    const response = await fetch(`/api/classes/${encodeURIComponent(classId)}/activity/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ purpose, assignmentId, fileName: file.name, size: file.size }),
    });
    const payload = await response.json() as { key?: string; uploadUrl?: string; contentType?: string; serverFallbackMaxBytes?: number; error?: string };
    if (!response.ok || !payload.key || !payload.uploadUrl || !payload.contentType) {
      const messages: Record<string, string> = {
        PDF_REQUIRED: "Đề bài giáo viên giao phải là file PDF.",
        FILE_TYPE_UNSUPPORTED: "Bài nộp chỉ nhận PDF, PNG, JPG hoặc WebP.",
        FILE_SIZE_INVALID: "Mỗi file phải nhỏ hơn 25 MB.",
        ASSIGNMENT_CLOSED: "Bài tập đã hết hạn hoặc đã khóa.",
      };
      throw new Error(messages[payload.error ?? ""] ?? "Không thể chuẩn bị vùng upload R2.");
    }
    try {
      const uploadResponse = await fetch(payload.uploadUrl, { method: "PUT", headers: { "Content-Type": payload.contentType }, body: file });
      if (!uploadResponse.ok) throw new Error(`R2_UPLOAD_${uploadResponse.status}`);
      return { key: payload.key, name: file.name, contentType: payload.contentType, size: file.size };
    } catch (directUploadError) {
      const fallbackLimit = payload.serverFallbackMaxBytes ?? 0;
      if (file.size > fallbackLimit) {
        console.error("Direct assignment upload failed:", directUploadError);
        throw new Error("R2 đang chặn upload trực tiếp từ tên miền này. File lớn hơn 4 MB cần thêm tên miền website vào CORS của bucket R2.");
      }

      const formData = new FormData();
      formData.set("file", file);
      formData.set("purpose", purpose);
      if (assignmentId) formData.set("assignmentId", assignmentId);
      const fallbackResponse = await fetch(`/api/classes/${encodeURIComponent(classId)}/activity/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const fallback = await fallbackResponse.json().catch(() => null) as { key?: string; contentType?: string; error?: string } | null;
      if (!fallbackResponse.ok || !fallback?.key || !fallback.contentType) {
        const fallbackMessages: Record<string, string> = {
          DIRECT_UPLOAD_REQUIRED: "File lớn hơn 4 MB cần upload trực tiếp; hãy thêm tên miền website vào CORS của bucket R2.",
          R2_NOT_READY: "R2 chưa được cấu hình đầy đủ trên máy chủ.",
          UPLOAD_PREPARE_FAILED: "Máy chủ chưa thể upload file lên R2.",
        };
        throw new Error(fallbackMessages[fallback?.error ?? ""] ?? "Không thể upload file bài tập lên R2.");
      }
      return { key: fallback.key, name: file.name, contentType: fallback.contentType, size: file.size };
    }
  };

  const mutate = async (method: "POST" | "PATCH", body: Record<string, unknown>) => {
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/classes/${encodeURIComponent(classId)}/activity`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        const messages: Record<string, string> = { ASSIGNMENT_CLOSED: "Bài tập đã hết hạn hoặc giáo viên đã khóa nhận bài." };
        throw new Error(messages[payload?.error ?? ""] ?? "Không thể lưu thay đổi.");
      }
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không thể lưu thay đổi.");
      throw saveError;
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <div className="rounded-3xl border border-gray-200 bg-white px-6 py-10 text-center text-sm font-semibold text-gray-500">Đang tải thông báo và bài tập…</div>;
  if (!data) return <div className="rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{error || "Không thể tải hoạt động lớp học."}</div>;
  const isTeacher = teacherMode && data.viewerRole === "teacher";

  return (
    <div className="space-y-8">
      {section !== "assignments" && <section id="class-announcements" aria-labelledby="announcement-heading" className="overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-amber-100 bg-gradient-to-r from-amber-50 via-orange-50/70 to-white px-5 py-5 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-500 text-white shadow-sm"><Bell size={21} /></span>
            <div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-amber-700">Ưu tiên đầu lớp</p><h2 id="announcement-heading" className="text-xl font-extrabold text-gray-950">Thông báo</h2></div>
          </div>
          {isTeacher && <button onClick={() => setAnnouncementOpen((value) => !value)} className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-700">+ Tạo thông báo</button>}
        </div>
        {announcementOpen && isTeacher && (
          <form className="grid gap-3 border-b border-amber-100 bg-amber-50/40 p-5 sm:p-7" onSubmit={async (event) => { event.preventDefault(); await mutate("POST", { action: "create_announcement", ...announcement }); setAnnouncement({ title: "", body: "" }); setAnnouncementOpen(false); }}>
            <input required maxLength={160} value={announcement.title} onChange={(event) => setAnnouncement({ ...announcement, title: event.target.value })} placeholder="Tiêu đề thông báo" className="rounded-xl border-2 border-amber-100 bg-white px-4 py-3 font-bold outline-none focus:border-amber-400" />
            <textarea rows={3} maxLength={3000} value={announcement.body} onChange={(event) => setAnnouncement({ ...announcement, body: event.target.value })} placeholder="Nội dung cần nhắc học sinh…" className="resize-y rounded-xl border-2 border-amber-100 bg-white px-4 py-3 text-sm outline-none focus:border-amber-400" />
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setAnnouncementOpen(false)} className="px-4 py-2 text-sm font-bold text-gray-500">Hủy</button><button disabled={saving} className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">Đăng thông báo</button></div>
          </form>
        )}
        <div className="divide-y divide-gray-100">
          {data.announcements.slice(0, 8).map((item) => (
            <article key={item.id} className="flex gap-3 px-5 py-4 sm:px-7">
              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.kind === "assignment" ? "bg-brand-600" : "bg-amber-500"}`} />
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold text-gray-900">{item.title}</h3>{item.kind === "assignment" && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-700">Bài tập</span>}</div>{item.body && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-600">{item.body}</p>}<p className="mt-1 text-[11px] text-gray-400">{formatDate(item.createdAt)}</p></div>
            </article>
          ))}
          {data.announcements.length === 0 && <p className="px-7 py-8 text-center text-sm text-gray-400">Chưa có thông báo nào.</p>}
        </div>
      </section>}

      {section !== "announcements" && <section id="class-assignments" aria-labelledby="assignment-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[.18em] text-brand-700">Giao và nhận bài</p><h2 id="assignment-heading" className="mt-1 text-2xl font-extrabold text-gray-950">Bài tập rèn luyện</h2><p className="mt-1 text-sm text-gray-500">Xem đề ngay tại đây và nộp PDF hoặc ảnh bài làm cho giáo viên.</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={loading} onClick={() => void load()} className="min-h-11 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 disabled:opacity-50">{loading ? "Đang tải…" : "Cập nhật danh sách"}</button>{isTeacher && <button onClick={() => setAssignmentOpen((value) => !value)} className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-800">+ Giao bài tập</button>}</div>
        </div>
        {error && <p role="alert" className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-700">{error}</p>}
        {assignmentOpen && isTeacher && (
          <form className="space-y-4 rounded-3xl border border-brand-200 bg-brand-50/40 p-5 shadow-sm sm:p-7" onSubmit={async (event) => { event.preventDefault(); if (!assignmentFile) { setError("Vui lòng upload file PDF đề bài."); return; } await mutate("POST", { action: "create_assignment", ...assignment, dueAt: assignment.dueAt ? new Date(assignment.dueAt).toISOString() : null, attachment: assignmentFile }); setAssignment({ title: "", description: "", dueAt: "" }); setAssignmentFile(null); setAssignmentOpen(false); }}>
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-gray-700">Tên bài tập<input required maxLength={160} value={assignment.title} onChange={(event) => setAssignment({ ...assignment, title: event.target.value })} className="mt-1.5 w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 font-normal outline-none focus:border-brand-500" /></label><label className="text-sm font-bold text-gray-700">Hạn nộp<input type="datetime-local" value={assignment.dueAt} onChange={(event) => setAssignment({ ...assignment, dueAt: event.target.value })} className="mt-1.5 w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 font-normal outline-none focus:border-brand-500" /></label></div>
            <label className="block text-sm font-bold text-gray-700">Yêu cầu bài tập<textarea rows={3} maxLength={3000} value={assignment.description} onChange={(event) => setAssignment({ ...assignment, description: event.target.value })} className="mt-1.5 w-full resize-y rounded-xl border-2 border-gray-200 bg-white px-4 py-3 font-normal outline-none focus:border-brand-500" /></label>
            <label className={`block cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center text-sm font-bold ${uploading === "assignment" ? "border-gray-200 text-gray-400" : "border-brand-200 bg-white text-brand-700 hover:border-brand-400"}`}>{uploading === "assignment" ? "Đang upload PDF lên R2…" : assignmentFile ? `✓ ${assignmentFile.name}` : "Upload file PDF đề bài"}<input type="file" accept=".pdf,application/pdf" className="sr-only" disabled={uploading === "assignment"} onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setUploading("assignment"); setError(""); try { setAssignmentFile(await uploadFile(file, "assignment")); } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Upload thất bại."); } finally { setUploading(""); } }} /></label>
            <p className="text-xs text-gray-500">LaTeX–TikZ → PDF chưa bật trong bản này để tránh lỗi biên dịch trên Vercel.</p>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setAssignmentOpen(false)} className="px-4 py-2 text-sm font-bold text-gray-500">Hủy</button><button disabled={saving || uploading !== ""} className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">Giao bài và tạo thông báo</button></div>
          </form>
        )}

        <div className="grid gap-4">
          {data.assignments.map((item) => {
            const draft = submissionDrafts[item.id] ?? { files: [], note: "" };
            return (
              <article key={item.id} className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
                <div className="p-5 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${item.status === "open" ? "bg-success-100 text-success-700" : "bg-gray-100 text-gray-600"}`}>{item.status === "open" ? "Đang nhận bài" : "Đã khóa"}</span>{item.mySubmission && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">✓ Đã nộp</span>}</div><h3 className="mt-3 text-xl font-extrabold text-gray-950">{item.title}</h3>{item.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{item.description}</p>}</div><div className="rounded-2xl bg-brand-50 px-4 py-3 text-sm font-bold text-brand-800"><CalendarClock className="mr-2 inline h-4 w-4" />{formatDate(item.dueAt)}</div></div>
                  {item.attachment && <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" disabled={loading} aria-expanded={previewId === item.id} aria-controls={`assignment-preview-${item.id}`} onClick={async () => {
                        if (previewId === item.id) { setPreviewId(null); return; }
                        if (await load()) setPreviewId(item.id);
                      }} className="min-h-11 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{previewId === item.id ? "Thu gọn đề bài" : loading ? "Đang tải…" : "Xem đề bài tại đây"}</button>
                      <a href={item.attachment.downloadUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-200 px-4 py-2.5 text-sm font-bold text-brand-700"><FileDown size={17} />Mở tab riêng</a>
                    </div>
                    {previewId === item.id && <div id={`assignment-preview-${item.id}`} className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2">
                        <p className="min-w-0 break-words text-xs text-gray-600">{item.attachment.name}</p>
                        <button type="button" disabled={loading} onClick={() => void load()} className="min-h-11 px-2 text-xs font-bold text-brand-700">Tải lại PDF</button>
                      </div>
                      <iframe key={item.attachment.downloadUrl} src={`${item.attachment.downloadUrl}#toolbar=1&navpanes=0&view=FitH`} title={`Đề bài: ${item.title}`} className="h-[75dvh] min-h-[480px] w-full bg-white sm:min-h-[640px]" allowFullScreen referrerPolicy="no-referrer" />
                      <p className="bg-white px-3 py-2 text-xs leading-5 text-gray-500">Cuộn bên trong khung để đọc. Nếu trình duyệt không hiển thị PDF, chọn “Mở tab riêng”. Liên kết xem có hiệu lực 1 giờ; chọn “Tải lại PDF” khi cần.</p>
                    </div>}
                  </div>}

                  {isTeacher ? (
                    <div className="mt-5 grid gap-4 border-t border-gray-100 pt-5 lg:grid-cols-[1fr_auto]">
                      <details className="rounded-2xl bg-gray-50 p-4"><summary className="cursor-pointer list-none font-bold text-gray-800"><Users className="mr-2 inline h-4 w-4" />Đã nộp {item.submittedCount}/{item.totalStudents} học sinh</summary><div className="mt-4 space-y-3">{item.submissions?.map((submission) => <div key={submission.id} className="rounded-xl border border-gray-100 bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-bold text-gray-900">{submission.studentName}</p><p className="text-xs text-gray-400">{formatDate(submission.submittedAt)}</p></div><div className="flex flex-wrap gap-2">{submission.files.map((file, index) => <a key={file.key} href={file.downloadUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700">File {index + 1}</a>)}</div></div>{submission.note && <p className="mt-2 text-sm text-gray-600">{submission.note}</p>}</div>)}{item.submissions?.length === 0 && <p className="text-sm text-gray-400">Chưa có học sinh nộp bài.</p>}<div className="border-t border-gray-200 pt-3"><p className="text-xs font-bold uppercase tracking-wider text-danger-600">Chưa nộp ({item.missingStudents?.length ?? 0})</p><p className="mt-2 text-sm leading-6 text-gray-600">{item.missingStudents?.map((student) => student.studentName).join(", ") || "Không có"}</p></div></div></details>
                      <div className="flex flex-col gap-2"><input type="datetime-local" value={deadlineDrafts[item.id] ?? ""} onChange={(event) => setDeadlineDrafts((current) => ({ ...current, [item.id]: event.target.value }))} className="rounded-xl border border-gray-200 px-3 py-2 text-sm" /><button disabled={saving} onClick={() => void mutate("PATCH", { action: "update_deadline", assignmentId: item.id, dueAt: deadlineDrafts[item.id] ? new Date(deadlineDrafts[item.id]).toISOString() : null })} className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-bold text-white">Gia hạn / mở lại</button><button disabled={saving} onClick={() => void mutate("PATCH", { action: "toggle_assignment", assignmentId: item.id, acceptingSubmissions: !item.acceptingSubmissions })} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-600">{item.acceptingSubmissions ? "Khóa nhận bài" : "Mở nhận bài"}</button></div>
                    </div>
                  ) : item.status === "open" ? (
                    <div className="mt-5 space-y-3 border-t border-gray-100 pt-5">
                      {item.mySubmission && <p className="rounded-xl bg-success-50 px-4 py-3 text-sm font-semibold text-success-700">Đã nộp lúc {formatDate(item.mySubmission.submittedAt)}. Nộp lại sẽ thay thế lần nộp trước.</p>}
                      <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-sm font-bold ${uploading === item.id ? "border-gray-200 text-gray-400" : "border-brand-200 text-brand-700 hover:bg-brand-50"}`}><Upload size={18} />{uploading === item.id ? "Đang upload…" : draft.files.length ? `Đã chọn ${draft.files.length} file` : "Chọn PDF hoặc ảnh bài làm"}<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading === item.id} onChange={async (event) => { const files = Array.from(event.target.files ?? []).slice(0, 10); event.target.value = ""; if (!files.length) return; setUploading(item.id); setError(""); try { const uploaded: AssignmentFileView[] = []; for (const file of files) uploaded.push(await uploadFile(file, "submission", item.id)); setSubmissionDrafts((current) => ({ ...current, [item.id]: { ...draft, files: uploaded } })); } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Upload thất bại."); } finally { setUploading(""); } }} /></label>
                      <textarea rows={2} maxLength={1500} value={draft.note} onChange={(event) => setSubmissionDrafts((current) => ({ ...current, [item.id]: { ...draft, note: event.target.value } }))} placeholder="Ghi chú cho giáo viên (không bắt buộc)…" className="w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-brand-400" />
                      <div className="flex justify-end"><button disabled={saving || draft.files.length === 0} onClick={async () => { await mutate("POST", { action: "submit_assignment", assignmentId: item.id, files: draft.files, note: draft.note }); setSubmissionDrafts((current) => ({ ...current, [item.id]: { files: [], note: "" } })); }} className="inline-flex items-center gap-2 rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"><Send size={16} />Nộp bài</button></div>
                    </div>
                  ) : <p className="mt-5 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-500">Bài tập đã hết hạn hoặc giáo viên đã khóa nhận bài.</p>}
                </div>
              </article>
            );
          })}
          {data.assignments.length === 0 && <div className="rounded-3xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-400"><ClipboardList className="mx-auto mb-3 h-8 w-8" />Chưa có bài tập được giao cho lớp này.</div>}
        </div>
      </section>}
    </div>
  );
}
