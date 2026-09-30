"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

interface CommentView {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  authorRole: "teacher" | "student";
  createdAt: string | null;
}

interface Props {
  classId: string;
  courseId: string;
  lessonId: string;
  resourceId?: string;
  contextLabel?: string;
  defaultOpen?: boolean;
  persistent?: boolean;
}

function formatTime(value: string | null): string {
  if (!value) return "Vừa xong";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Vừa xong" : date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

export default function LessonDiscussion({ classId, courseId, lessonId, resourceId, contextLabel, defaultOpen = false, persistent = false }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(defaultOpen || persistent);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comments, setComments] = useState<CommentView[]>([]);
  const [viewerId, setViewerId] = useState("");
  const [canModerate, setCanModerate] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const endpoint = `/api/classes/${encodeURIComponent(classId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/comments${resourceId ? `?resourceId=${encodeURIComponent(resourceId)}` : ""}`;

  const loadComments = useCallback(async () => {
    if (!user || loading) return;
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await response.json() as { comments?: CommentView[]; viewerId?: string; canModerate?: boolean };
      if (!response.ok || !Array.isArray(payload.comments)) throw new Error("Không thể tải phần hỏi đáp.");
      setComments(payload.comments);
      setViewerId(payload.viewerId ?? "");
      setCanModerate(Boolean(payload.canModerate));
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không thể tải phần hỏi đáp.");
    } finally {
      setLoading(false);
    }
  }, [endpoint, loading, user]);

  useEffect(() => {
    if (!open || loaded || loading) return;
    queueMicrotask(() => void loadComments());
  }, [loadComments, loaded, loading, open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !draft.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const payload = await response.json() as { comment?: CommentView };
      if (!response.ok || !payload.comment) throw new Error("Không thể gửi câu hỏi.");
      setComments((current) => [...current, payload.comment!]);
      setDraft("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không thể gửi câu hỏi.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (commentId: string) => {
    if (!user || saving) return;
    setSaving(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const separator = endpoint.includes("?") ? "&" : "?";
      const response = await fetch(`${endpoint}${separator}commentId=${encodeURIComponent(commentId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Không thể xóa bình luận.");
      setComments((current) => current.filter((comment) => comment.id !== commentId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Không thể xóa bình luận.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`border-t border-gray-100 bg-[#fffdf9] ${persistent ? "flex h-full min-h-0 flex-col" : ""}`}>
      {persistent ? (
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-left text-sm font-bold text-brand-800 sm:px-5">
          <span className="flex min-w-0 items-center gap-2"><MessageCircle className="h-4 w-4 shrink-0" /><span className="truncate">Hỏi đáp{contextLabel ? ` · ${contextLabel}` : " bài học"}</span></span>
          <span className="text-xs text-gray-400">{loaded ? `${comments.length} trao đổi` : "Đang tải"}</span>
        </div>
      ) : (
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-bold text-brand-800 hover:bg-brand-50 sm:px-5">
        <span className="flex min-w-0 items-center gap-2"><MessageCircle className="h-4 w-4 shrink-0" /><span className="truncate">Hỏi đáp{contextLabel ? ` · ${contextLabel}` : " bài học"}</span></span>
        <span className="text-xs text-gray-400">{loaded ? `${comments.length} trao đổi` : open ? "Đang mở" : "Mở"}</span>
      </button>
      )}
      {open && (
        <div className={`border-t border-gray-100 ${persistent ? "flex min-h-0 flex-1 flex-col" : "space-y-3 px-4 py-4 sm:px-5"}`}>
          <div className={persistent ? "min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-5" : "contents"}>
            {loading && <p className="text-sm text-gray-400">Đang tải trao đổi…</p>}
            {!loading && comments.length === 0 && <p className="rounded-xl bg-white px-4 py-3 text-sm text-gray-400">Chưa có câu hỏi. Bạn có thể bắt đầu trao đổi về nội dung này.</p>}
            {comments.map((comment) => (
              <article key={comment.id} className="rounded-2xl border border-gray-100 bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-sm font-extrabold text-gray-800">{comment.authorName} {comment.authorRole === "teacher" && <span className="ml-1 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] uppercase text-brand-800">Giáo viên</span>}</p><p className="mt-0.5 text-[11px] text-gray-400">{formatTime(comment.createdAt)}</p></div>
                  {(canModerate || viewerId === comment.authorId) && <button type="button" disabled={saving} onClick={() => void remove(comment.id)} title="Xóa bình luận" className="rounded-lg p-2 text-gray-400 hover:bg-danger-50 hover:text-danger-600"><Trash2 className="h-4 w-4" /></button>}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{comment.body}</p>
              </article>
            ))}
          </div>
          <form onSubmit={submit} className={`flex items-end gap-2 ${persistent ? "shrink-0 border-t border-gray-100 bg-white/80 px-4 py-3 sm:px-5" : ""}`}>
            <label className="sr-only" htmlFor={`comment-${lessonId}-${resourceId ?? "lesson"}`}>Câu hỏi hoặc phản hồi</label>
            <textarea id={`comment-${lessonId}-${resourceId ?? "lesson"}`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1500} rows={persistent ? 1 : 2} placeholder="Đặt câu hỏi về nội dung đang xem…" className={`${persistent ? "min-h-11 resize-none" : "min-h-20 resize-y"} flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-400`} />
            <button disabled={saving || !draft.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-40" title="Gửi"><Send className="h-4 w-4" /></button>
          </form>
          {error && <p className={`text-xs font-semibold text-danger-600 ${persistent ? "shrink-0 px-4 pb-2 sm:px-5" : ""}`}>{error}</p>}
        </div>
      )}
    </div>
  );
}
