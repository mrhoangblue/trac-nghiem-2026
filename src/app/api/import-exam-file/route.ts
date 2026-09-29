import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyAuth } from "@/lib/verifyAuth";
import { importDocx, importPdf, importTex } from "@/lib/examFileImport";
import { downloadFromR2, getR2ObjectMetadata, getR2Status, uploadToR2 } from "@/lib/r2Storage";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const FILE_TYPES: Record<string, string> = {
  docx: DOCX_TYPE,
  pdf: "application/pdf",
  tex: "text/x-tex",
};

function createLocalAssetUploader() {
  const batchId = randomUUID();
  let sequence = 0;
  return async (asset: { bytes: Uint8Array; fileName: string; contentType: string }) => {
    sequence += 1;
    const safeName = asset.fileName.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-");
    const storedName = `${String(sequence).padStart(4, "0")}-${safeName || "asset"}`;
    const directory = path.join(process.cwd(), "public", "local-imports", batchId);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, storedName), asset.bytes);
    return `/local-imports/${batchId}/${storedName}`;
  };
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser || !["admin", "mod"].includes(authUser.role)) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    let fileName = "";
    let fileType = "";
    let fileSize = 0;
    let bytes: Uint8Array;
    let sourceObject: { key: string; url: string | null } | null = null;

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { key?: string; fileName?: string; contentType?: string; size?: number };
      if (!body.key?.startsWith("exam-imports/") || !body.fileName) {
        return NextResponse.json({ error: "INVALID_OBJECT_KEY" }, { status: 400 });
      }
      const metadata = await getR2ObjectMetadata(body.key);
      if (metadata.size <= 0 || metadata.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "FILE_SIZE_INVALID" }, { status: 413 });
      }
      fileName = body.fileName;
      fileType = body.contentType ?? "";
      fileSize = metadata.size;
      bytes = await downloadFromR2(body.key);
      sourceObject = { key: body.key, url: null };
    } else {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
      }
      fileName = file.name;
      fileType = file.type;
      fileSize = file.size;
      bytes = new Uint8Array(await file.arrayBuffer());
    }

    if (fileSize <= 0 || fileSize > MAX_FILE_SIZE || bytes.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "FILE_SIZE_INVALID" }, { status: 413 });
    }

    const extension = fileName.split(".").pop()?.toLowerCase();
    if (extension !== "docx" && extension !== "pdf" && extension !== "tex") {
      return NextResponse.json({ error: "FILE_TYPE_UNSUPPORTED" }, { status: 415 });
    }

    const r2 = getR2Status();
    const storageWarnings: string[] = [];
    const localAssetUploader = process.env.NODE_ENV !== "production" ? createLocalAssetUploader() : undefined;

    if (!sourceObject) {
      if (r2.configured) {
        sourceObject = await uploadToR2({
          body: bytes,
          contentType: fileType || FILE_TYPES[extension],
          fileName,
          folder: "exam-imports",
          metadata: { uploadedBy: authUser.uid },
        });
      } else {
        storageWarnings.push(`R2 chưa cấu hình: thiếu ${r2.missing.join(", ")}. File gốc chưa được lưu vào object storage.`);
      }
    }

    const result = extension === "docx"
      ? await importDocx(
          bytes,
          fileName,
          r2.configured && r2.publicAccessConfigured
            ? async (asset) => {
                const uploaded = await uploadToR2({
                  body: asset.bytes,
                  contentType: asset.contentType,
                  fileName: asset.fileName,
                  folder: "exam-assets",
                  metadata: { uploadedBy: authUser.uid, source: fileName },
                });
                return uploaded.url;
              }
            : localAssetUploader,
        )
      : extension === "pdf"
        ? await importPdf(bytes, fileName)
        : await importTex(bytes, fileName);

    if (r2.configured && !r2.publicAccessConfigured && extension === "docx") {
      storageWarnings.push(localAssetUploader
        ? "R2 thiếu R2_PUBLIC_BASE_URL nên localhost đang dùng kho ảnh cục bộ để kiểm thử."
        : "R2 đã có thông tin ghi file nhưng thiếu R2_PUBLIC_BASE_URL; ảnh trong DOCX chưa thể dùng trong đề.");
    } else if (!r2.configured && localAssetUploader && extension === "docx") {
      storageWarnings.push("Đang dùng kho ảnh cục bộ của localhost để kiểm thử; dữ liệu này không thay thế R2 khi triển khai production.");
    }

    return NextResponse.json({
      ...result,
      warnings: [...storageWarnings, ...result.warnings],
      sourceObject,
      storage: r2,
    });
  } catch (error) {
    console.error("Exam file import failed:", error);
    const message = error instanceof Error ? error.message : "IMPORT_FAILED";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
