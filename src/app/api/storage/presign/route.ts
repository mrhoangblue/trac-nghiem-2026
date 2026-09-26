import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/verifyAuth";
import { createR2UploadUrl, getR2Status } from "@/lib/r2Storage";

export const runtime = "nodejs";

const LEARNING_EXTENSIONS = new Set(["pdf", "docx", "pptx", "mp4", "webm", "png", "jpg", "jpeg", "webp", "svg"]);
const EXAM_EXTENSIONS = new Set(["docx", "pdf", "tex"]);
const EXAM_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "svg"]);
const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp4: "video/mp4",
  webm: "video/webm",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  tex: "text/x-tex",
};

export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser || !["admin", "mod"].includes(authUser.role)) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const body = (await request.json()) as {
      fileName?: string;
      contentType?: string;
      size?: number;
      folder?: "exam-imports" | "exam-assets" | "learning-materials";
    };
    const fileName = body.fileName?.trim() ?? "";
    const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
    const folder = body.folder;
    const maxSize = folder === "exam-imports"
      ? 25 * 1024 * 1024
      : folder === "exam-assets"
        ? 8 * 1024 * 1024
        : 100 * 1024 * 1024;
    const allowed = folder === "exam-imports"
      ? EXAM_EXTENSIONS
      : folder === "exam-assets"
        ? EXAM_IMAGE_EXTENSIONS
        : LEARNING_EXTENSIONS;
    if (!folder || !fileName || !allowed.has(extension)) {
      return NextResponse.json({ error: "FILE_TYPE_UNSUPPORTED" }, { status: 415 });
    }
    if (!Number.isFinite(body.size) || Number(body.size) <= 0 || Number(body.size) > maxSize) {
      return NextResponse.json({ error: "FILE_SIZE_INVALID" }, { status: 413 });
    }

    const status = getR2Status();
    if (!status.configured || (folder !== "exam-imports" && !status.publicAccessConfigured)) {
      return NextResponse.json(
        { error: "R2_NOT_READY", missing: status.missing, needsPublicBaseUrl: !status.publicAccessConfigured },
        { status: 503 },
      );
    }

    const signed = await createR2UploadUrl({
      fileName,
      contentType: CONTENT_TYPES[extension] ?? "application/octet-stream",
      folder,
    });
    return NextResponse.json({ ...signed, contentType: CONTENT_TYPES[extension] ?? "application/octet-stream" });
  } catch (error) {
    console.error("R2 presign failed:", error);
    return NextResponse.json({ error: "PRESIGN_FAILED" }, { status: 500 });
  }
}
