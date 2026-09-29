import { NextRequest, NextResponse } from "next/server";
import { getR2Status, uploadToR2, type R2ObjectFolder } from "@/lib/r2Storage";
import { verifyAuth } from "@/lib/verifyAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_EXTENSIONS: Record<string, Set<string>> = {
  "learning-materials": new Set(["pdf", "doc", "docx", "ppt", "pptx", "png", "jpg", "jpeg", "webp", "svg"]),
  "course-assets": new Set(["png", "jpg", "jpeg", "webp"]),
};
const MAX_FILE_SIZES: Record<string, number> = {
  "learning-materials": 100 * 1024 * 1024,
  "course-assets": 8 * 1024 * 1024,
};

export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser || !["admin", "mod"].includes(authUser.role)) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const folder = String(formData.get("folder") ?? "");
    if (!(file instanceof File) || !(folder in ALLOWED_EXTENSIONS)) {
      return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS[folder].has(extension)) {
      return NextResponse.json({ error: "FILE_TYPE_UNSUPPORTED" }, { status: 415 });
    }
    const configuredLimit = MAX_FILE_SIZES[folder];
    const serverLimit = process.env.VERCEL ? 4 * 1024 * 1024 : configuredLimit;
    if (file.size <= 0 || file.size > configuredLimit) {
      return NextResponse.json({ error: "FILE_SIZE_INVALID" }, { status: 413 });
    }
    if (file.size > serverLimit) {
      return NextResponse.json({ error: "DIRECT_UPLOAD_REQUIRED" }, { status: 413 });
    }

    const r2 = getR2Status();
    if (!r2.configured || !r2.publicAccessConfigured) {
      return NextResponse.json({ error: "R2_NOT_READY", missing: r2.missing }, { status: 503 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const uploaded = await uploadToR2({
      body: bytes,
      contentType: file.type || "application/octet-stream",
      fileName: file.name,
      folder: folder as R2ObjectFolder,
      metadata: { uploadedBy: authUser.uid, uploadMode: "server-fallback" },
    });
    if (!uploaded.url) {
      return NextResponse.json({ error: "R2_PUBLIC_URL_MISSING" }, { status: 503 });
    }
    return NextResponse.json({
      ...uploaded,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    });
  } catch (error) {
    console.error("Server-side R2 upload failed:", error);
    return NextResponse.json({ error: "UPLOAD_FAILED" }, { status: 500 });
  }
}
