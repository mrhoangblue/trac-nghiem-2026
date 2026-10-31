import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  ESSAY_ATTACH_GRACE_MS,
  essayFiles,
  loadSubmissionForUser,
  millis,
  signEssayFiles,
  uploadWindow,
} from "@/lib/essaySubmission";
import { createR2UploadUrl, deleteFromR2, getR2ObjectMetadata, getR2Status } from "@/lib/r2Storage";
import { verifyAuth } from "@/lib/verifyAuth";
import { ESSAY_MAX_FILES } from "@/utils/examStructure";
import type { EssayAnnotations, EssayFile, EssayGrading, EssayUploadState } from "@/utils/essayTypes";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const CONTENT_TYPES: Record<string, { kind: EssayFile["kind"]; extension: string }> = {
  "image/jpeg": { kind: "image", extension: "jpg" },
  "image/webp": { kind: "image", extension: "webp" },
  "image/png": { kind: "image", extension: "png" },
  "application/pdf": { kind: "pdf", extension: "pdf" },
};

type Params = { params: Promise<{ submissionId: string }> };

interface EssayActionBody {
  action?: "presign" | "attach" | "remove" | "reorder" | "finalize";
  contentType?: string;
  size?: number;
  key?: string;
  keys?: string[];
  width?: number;
  height?: number;
  name?: string;
}

/**
 * GET: ảnh/PDF bài làm (link ký tạm thời). Phiếu điểm và nét chấm chỉ trả cho
 * học sinh khi giáo viên đã chấm xong; giáo viên luôn nhận đủ.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser?.email) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    const { submissionId } = await params;
    const loaded = await loadSubmissionForUser(submissionId, authUser);
    if (!loaded) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const { data, isGrader } = loaded;
    const window = uploadWindow(data);
    const gradingStatus = data.gradingStatus === "pending" || data.gradingStatus === "graded" ? data.gradingStatus : null;
    const state: EssayUploadState = {
      submissionId,
      files: await signEssayFiles(essayFiles(data)),
      uploadDeadlineMillis: window.deadline,
      uploadOpen: window.open,
      finalized: window.finalized,
      gradingStatus,
    };
    const revealGrading = isGrader || gradingStatus === "graded";
    let grading: EssayGrading | null = null;
    let annotations: EssayAnnotations | null = null;
    if (revealGrading) {
      const stored = (data.grading ?? null) as (EssayGrading & { gradedAt?: unknown }) | null;
      grading = stored ? { ...stored, gradedAt: millis(stored.gradedAt) } : null;
      const annotationSnapshot = await adminDb.collection("essay_annotations").doc(submissionId).get();
      annotations = (annotationSnapshot.data()?.pages ?? null) as EssayAnnotations | null;
    }
    // Giáo viên cần thêm thông tin học sinh và điểm tự động để chấm.
    const submission = isGrader ? {
      examId: String(data.examId ?? ""),
      studentName: String(data.studentName ?? ""),
      studentEmail: String(data.studentEmail ?? ""),
      submittedAtMillis: millis(data.submittedAt),
      scores: data.scores ?? null,
      isTeacherPreview: Boolean(data.isTeacherPreview),
    } : null;
    return NextResponse.json({ ...state, grading, annotations, submission }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET essay failed:", error);
    return NextResponse.json({ error: "ESSAY_LOAD_FAILED" }, { status: 500 });
  }
}

/** Học sinh tải lên, xóa, sắp xếp ảnh bài làm và bấm "Hoàn tất". */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser?.email) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    const { submissionId } = await params;
    const loaded = await loadSubmissionForUser(submissionId, authUser);
    if (!loaded?.isOwner) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const body = await request.json().catch(() => ({})) as EssayActionBody;
    const { ref, data } = loaded;
    const window = uploadWindow(data);
    const files = essayFiles(data);

    if (body.action === "presign") {
      if (!window.open) return NextResponse.json({ error: "UPLOAD_CLOSED" }, { status: 409 });
      if (files.length >= ESSAY_MAX_FILES) return NextResponse.json({ error: "TOO_MANY_FILES" }, { status: 409 });
      const type = CONTENT_TYPES[String(body.contentType ?? "")];
      if (!type) return NextResponse.json({ error: "FILE_TYPE_UNSUPPORTED" }, { status: 415 });
      const size = Number(body.size ?? 0);
      const maxBytes = type.kind === "pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
      if (!Number.isFinite(size) || size <= 0 || size > maxBytes) return NextResponse.json({ error: "FILE_SIZE_INVALID", maxBytes }, { status: 413 });
      if (!getR2Status().configured) return NextResponse.json({ error: "R2_NOT_READY" }, { status: 503 });
      // submissionId nằm trong tên object để "attach" chỉ nhận đúng file của bài này.
      const signed = await createR2UploadUrl({
        fileName: `${submissionId}-page.${type.extension}`,
        contentType: String(body.contentType),
        folder: "essay-submissions",
        metadata: { submissionId, uploadedBy: authUser.uid },
      });
      return NextResponse.json({ key: signed.key, uploadUrl: signed.uploadUrl, contentType: body.contentType });
    }

    if (body.action === "attach") {
      const key = String(body.key ?? "");
      const deadlineOk = window.open || (window.deadline !== null && !window.finalized && Date.now() < window.deadline + ESSAY_ATTACH_GRACE_MS);
      if (!deadlineOk) return NextResponse.json({ error: "UPLOAD_CLOSED" }, { status: 409 });
      if (!key.startsWith("essay-submissions/") || !key.includes(`-${submissionId}-page.`) || key.includes("..")) {
        return NextResponse.json({ error: "INVALID_KEY" }, { status: 400 });
      }
      if (files.some((file) => file.key === key)) return NextResponse.json({ files: await signEssayFiles(files) });
      if (files.length >= ESSAY_MAX_FILES) return NextResponse.json({ error: "TOO_MANY_FILES" }, { status: 409 });
      const metadata = await getR2ObjectMetadata(key).catch(() => null);
      const type = CONTENT_TYPES[metadata?.contentType ?? ""];
      if (!metadata || !type || metadata.size <= 0) return NextResponse.json({ error: "UPLOAD_NOT_FOUND" }, { status: 404 });
      const dimension = (value: unknown) => {
        const parsed = Math.round(Number(value));
        return Number.isFinite(parsed) && parsed > 0 && parsed < 20000 ? parsed : undefined;
      };
      const file: EssayFile = {
        key,
        kind: type.kind,
        contentType: metadata.contentType ?? "application/octet-stream",
        size: metadata.size,
        ...(dimension(body.width) ? { width: dimension(body.width) } : {}),
        ...(dimension(body.height) ? { height: dimension(body.height) } : {}),
        ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim().slice(0, 120) } : {}),
      };
      // arrayUnion để nhiều ảnh tải song song không ghi đè lẫn nhau.
      await ref.update({ "essay.files": FieldValue.arrayUnion(file), "essay.uploadedAt": FieldValue.serverTimestamp() });
      return NextResponse.json({ files: await signEssayFiles(essayFiles((await ref.get()).data() ?? {})) });
    }

    if (body.action === "remove") {
      if (!window.open) return NextResponse.json({ error: "UPLOAD_CLOSED" }, { status: 409 });
      const key = String(body.key ?? "");
      const target = files.find((file) => file.key === key);
      if (!target) return NextResponse.json({ files: await signEssayFiles(files) });
      const next = files.filter((file) => file !== target);
      await ref.update({ "essay.files": FieldValue.arrayRemove(target) });
      await deleteFromR2(key).catch((error) => console.error("Delete essay page failed:", error));
      return NextResponse.json({ files: await signEssayFiles(next) });
    }

    if (body.action === "reorder") {
      if (!window.open) return NextResponse.json({ error: "UPLOAD_CLOSED" }, { status: 409 });
      const order = Array.isArray(body.keys) ? body.keys.map(String) : [];
      const byKey = new Map(files.map((file) => [file.key, file]));
      if (order.length !== files.length || order.some((key) => !byKey.has(key))) {
        return NextResponse.json({ error: "INVALID_ORDER" }, { status: 400 });
      }
      const next = order.map((key) => byKey.get(key) as EssayFile);
      await ref.update({ "essay.files": next });
      return NextResponse.json({ files: await signEssayFiles(next) });
    }

    if (body.action === "finalize") {
      if (data.status !== "COMPLETED" || data.gradingStatus !== "pending") {
        return NextResponse.json({ error: "NOT_IN_UPLOAD_STAGE" }, { status: 409 });
      }
      if (!window.finalized) await ref.update({ "essay.finalizedAt": FieldValue.serverTimestamp() });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    console.error("POST essay failed:", error);
    return NextResponse.json({ error: "ESSAY_UPDATE_FAILED" }, { status: 500 });
  }
}
