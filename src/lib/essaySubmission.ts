import "server-only";
import type { DocumentData, DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { createR2DownloadUrl } from "@/lib/r2Storage";
import type { AuthContextData } from "@/lib/verifyAuth";
import type { EssayFile, EssayFileView } from "@/utils/essayTypes";

/** Sau hạn nộp vẫn nhận "attach" thêm chừng này để ảnh đang tải dở không bị mất. */
export const ESSAY_ATTACH_GRACE_MS = 90 * 1000;

export interface LoadedSubmission {
  ref: DocumentReference;
  data: DocumentData;
  exam: DocumentData;
  isOwner: boolean;
  isGrader: boolean;
}

export function millis(value: unknown): number | null {
  return (value as { toMillis?: () => number } | null)?.toMillis?.() ?? null;
}

/** Học sinh chủ bài, hoặc giáo viên tác giả đề / admin. Người khác nhận null. */
export async function loadSubmissionForUser(submissionId: string, authUser: AuthContextData): Promise<LoadedSubmission | null> {
  const ref = adminDb.collection("submissions").doc(submissionId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() ?? {};
  const examSnapshot = await adminDb.collection("exams").doc(String(data.examId ?? "")).get();
  const exam = examSnapshot.data() ?? {};
  const email = authUser.email.toLowerCase();
  const isOwner = String(data.studentEmail ?? "").toLowerCase() === email;
  const isGrader = authUser.role === "admin"
    || (["mod", "admin"].includes(authUser.role) && String(exam.authorEmail ?? "").toLowerCase() === email);
  if (!isOwner && !isGrader) return null;
  return { ref, data, exam, isOwner, isGrader };
}

export function essayFiles(data: DocumentData): EssayFile[] {
  const files = (data.essay as { files?: unknown } | undefined)?.files;
  return Array.isArray(files) ? files.filter((file): file is EssayFile => typeof file?.key === "string") : [];
}

/**
 * Còn được thêm/xóa ảnh không: trong lúc làm bài, hoặc sau khi nộp Phần I–III
 * mà chưa bấm "Hoàn tất" và chưa hết thời gian bổ sung.
 */
export function uploadWindow(data: DocumentData, now = Date.now()): { open: boolean; deadline: number | null; finalized: boolean } {
  const essay = (data.essay ?? {}) as { uploadDeadline?: unknown; finalizedAt?: unknown };
  const deadline = millis(essay.uploadDeadline);
  const finalized = Boolean(essay.finalizedAt);
  if (data.status === "IN_PROGRESS") return { open: true, deadline: null, finalized: false };
  const open = data.status === "COMPLETED" && data.gradingStatus === "pending" && !finalized && deadline !== null && now < deadline;
  return { open, deadline, finalized };
}

export async function signEssayFiles(files: EssayFile[]): Promise<EssayFileView[]> {
  return Promise.all(files.map(async (file) => ({
    ...file,
    url: await createR2DownloadUrl(file.key, 30 * 60, file.kind === "pdf"),
  })));
}
