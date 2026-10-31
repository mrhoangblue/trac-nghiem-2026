import type { ParsedQuestion } from "@/utils/latexParser";

export interface FileImportResponse {
  title?: string;
  questions?: ParsedQuestion[];
  latex?: string;
  warnings?: string[];
  stats?: {
    questionCount: number;
    equationCount: number;
    imageCount: number;
    pageCount?: number;
  };
  sourceObject?: { key: string; url: string | null } | null;
  error?: string;
}

const EXAM_FILE_EXTENSIONS = ["docx", "pdf", "tex"];

export type ImportedExamFile = FileImportResponse & { questions: ParsedQuestion[]; latex: string };

/** Tải file đề lên R2 (hoặc qua máy chủ khi R2 chặn) rồi nhận về câu hỏi và mã LaTeX đã nhận diện. */
export async function importExamFile(file: File, token: string): Promise<ImportedExamFile> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!EXAM_FILE_EXTENSIONS.includes(extension)) {
    throw new Error(`File "${file.name}" không được hỗ trợ. Chỉ nhận DOCX, PDF hoặc TEX (file .doc cũ cần lưu lại thành .docx).`);
  }
  if (file.size <= 0 || file.size > 25 * 1024 * 1024) throw new Error("File phải lớn hơn 0 và nhỏ hơn 25 MB.");
  const importThroughServer = async () => {
    const formData = new FormData();
    formData.set("file", file);
    return fetch("/api/import-exam-file", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
  };
  const presignResponse = await fetch("/api/storage/presign", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size, folder: "exam-imports" }),
  });
  const presigned = (await presignResponse.json().catch(() => null)) as { uploadUrl?: string; key?: string; contentType?: string; error?: string } | null;
  let response: Response;
  if (presignResponse.ok && presigned?.uploadUrl && presigned.key) {
    try {
      const directUpload = await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": presigned.contentType || "application/octet-stream" },
        body: file,
      });
      if (!directUpload.ok) throw new Error(`R2_UPLOAD_${directUpload.status}`);
      response = await fetch("/api/import-exam-file", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ key: presigned.key, fileName: file.name, contentType: file.type, size: file.size }),
      });
    } catch (directUploadError) {
      // Local Next.js can accept the full 25 MB. On Vercel, keep the fallback
      // below its request body limit; larger files require R2 bucket CORS.
      const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
      if (isLocalhost || file.size <= 4 * 1024 * 1024) {
        response = await importThroughServer();
      } else {
        console.error("Direct R2 upload failed:", directUploadError);
        throw new Error(
          "R2 đang chặn upload trực tiếp từ trình duyệt. Hãy cho phép origin của website trong CORS bucket R2, rồi thử lại file lớn này.",
        );
      }
    }
  } else if (presignResponse.status === 401) {
    throw new Error("Phiên đăng nhập đã hết hạn hoặc tài khoản không có quyền tạo đề. Hãy tải lại trang rồi thử lại.");
  } else if (presigned?.error === "FILE_SIZE_INVALID") {
    throw new Error("File phải nhỏ hơn 25 MB.");
  } else if (presigned?.error === "FILE_TYPE_UNSUPPORTED") {
    throw new Error("Chỉ hỗ trợ file DOCX, PDF hoặc TEX.");
  } else {
    // R2 chưa cấu hình hoặc tạm lỗi: gửi file thẳng qua máy chủ.
    console.error("R2 presign failed:", presignResponse.status, presigned?.error);
    response = await importThroughServer();
  }
  const payload = (await response.json().catch(() => null)) as FileImportResponse | null;
  if (!response.ok || !payload?.questions || typeof payload.latex !== "string") {
    const messages: Record<string, string> = {
      FILE_SIZE_INVALID: "File phải nhỏ hơn 25 MB.",
      FILE_TYPE_UNSUPPORTED: "Chỉ hỗ trợ file DOCX, PDF hoặc TEX.",
      DOCX_INVALID: "File DOCX không hợp lệ hoặc đã bị hỏng.",
      IMPORT_TIMEOUT: "File có quá nhiều công thức hoặc hình ảnh nên xử lý quá thời gian. Hãy thử lại sau khi tối ưu file.",
    };
    throw new Error(messages[payload?.error ?? ""] ?? payload?.error ?? "Không thể đọc file đề thi.");
  }
  return payload as ImportedExamFile;
}
