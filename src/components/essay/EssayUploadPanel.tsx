"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Camera, FileText, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { ESSAY_MAX_FILES } from "@/utils/examStructure";
import type { EssayFileView, EssayUploadState } from "@/utils/essayTypes";

const MAX_EDGE = 2000;
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

interface PreparedFile {
  blob: Blob;
  contentType: string;
  width?: number;
  height?: number;
  name: string;
}

/**
 * Ảnh điện thoại 4–8 MB được xoay đúng chiều và thu về cạnh dài 2000px, JPEG
 * 0,82 ngay trên máy (còn khoảng 300–500 KB) trước khi tải thẳng lên R2.
 */
async function prepareFile(file: File): Promise<PreparedFile> {
  if (file.type === "application/pdf") return { blob: file, contentType: file.type, name: file.name };
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("CANVAS_UNAVAILABLE");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("ENCODE_FAILED");
  return { blob, contentType: "image/jpeg", width, height, name: file.name };
}

const ERROR_MESSAGES: Record<string, string> = {
  UPLOAD_CLOSED: "Đã hết thời gian nộp bài tự luận.",
  TOO_MANY_FILES: `Tối đa ${ESSAY_MAX_FILES} trang.`,
  FILE_TYPE_UNSUPPORTED: "Chỉ nhận ảnh (JPG, PNG, WebP, HEIC) hoặc PDF.",
  FILE_SIZE_INVALID: "File quá lớn: ảnh tối đa 8 MB, PDF tối đa 20 MB.",
  R2_NOT_READY: "Kho lưu trữ chưa sẵn sàng, hãy báo giáo viên.",
};

export default function EssayUploadPanel({
  submissionId,
  getToken,
  locked = false,
  onFilesChange,
  onStateLoaded,
}: {
  submissionId: string | null;
  getToken: () => Promise<string>;
  /** Hết giờ hoặc đã bấm Hoàn tất: chỉ xem, không sửa. */
  locked?: boolean;
  onFilesChange?: (count: number) => void;
  onStateLoaded?: (state: EssayUploadState) => void;
}) {
  const [files, setFiles] = useState<EssayFileView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pickerRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const onFilesChangeRef = useRef(onFilesChange);
  const onStateLoadedRef = useRef(onStateLoaded);
  useEffect(() => { onFilesChangeRef.current = onFilesChange; onStateLoadedRef.current = onStateLoaded; });

  const updateFiles = useCallback((next: EssayFileView[]) => {
    setFiles(next);
    onFilesChangeRef.current?.(next.length);
  }, []);

  const call = useCallback(async (body: Record<string, unknown>) => {
    if (!submissionId) throw new Error("NO_SUBMISSION");
    const response = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/essay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null) as { files?: EssayFileView[]; key?: string; uploadUrl?: string; error?: string } | null;
    if (!response.ok) throw new Error(payload?.error ?? "REQUEST_FAILED");
    return payload ?? {};
  }, [getToken, submissionId]);

  useEffect(() => {
    if (!submissionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/essay`, {
          headers: { Authorization: `Bearer ${await getToken()}` },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null) as EssayUploadState | null;
        if (!cancelled && response.ok && payload) {
          updateFiles(payload.files);
          onStateLoadedRef.current?.(payload);
        }
      } catch (loadError) {
        console.warn("Không tải được bài tự luận:", loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken, submissionId, updateFiles]);

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length || locked) return;
    setError("");
    const selected = Array.from(list).slice(0, Math.max(0, ESSAY_MAX_FILES - files.length));
    let latest = files;
    for (const [index, file] of selected.entries()) {
      setBusy(`Đang tải trang ${index + 1}/${selected.length}…`);
      try {
        const prepared = await prepareFile(file);
        const signed = await call({ action: "presign", contentType: prepared.contentType, size: prepared.blob.size });
        if (!signed.uploadUrl || !signed.key) throw new Error("REQUEST_FAILED");
        const put = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": prepared.contentType }, body: prepared.blob });
        if (!put.ok) throw new Error("PUT_FAILED");
        const attached = await call({ action: "attach", key: signed.key, width: prepared.width, height: prepared.height, name: prepared.name });
        latest = attached.files ?? latest;
        updateFiles(latest);
      } catch (uploadError) {
        const code = uploadError instanceof Error ? uploadError.message : "";
        setError(ERROR_MESSAGES[code] ?? `Không tải được "${file.name}". Kiểm tra mạng rồi thử lại.`);
        if (code === "UPLOAD_CLOSED") break;
      }
    }
    setBusy(null);
  };

  const remove = async (key: string) => {
    setBusy("Đang xóa…");
    setError("");
    try {
      const result = await call({ action: "remove", key });
      updateFiles(result.files ?? files.filter((file) => file.key !== key));
    } catch (removeError) {
      setError(ERROR_MESSAGES[removeError instanceof Error ? removeError.message : ""] ?? "Không xóa được trang này.");
    } finally {
      setBusy(null);
    }
  };

  const move = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= files.length) return;
    const next = [...files];
    [next[index], next[target]] = [next[target], next[index]];
    updateFiles(next);
    try {
      await call({ action: "reorder", keys: next.map((file) => file.key) });
    } catch {
      updateFiles(files);
      setError("Không đổi được thứ tự trang.");
    }
  };

  if (!submissionId) return null;

  return (
    <section aria-label="Nộp bài làm tự luận" className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-sm font-bold text-gray-900">Bài làm tự luận</p>
          <p className="mt-0.5 text-xs leading-5 text-gray-600">Một khung chung cho cả Phần IV. Chụp lần lượt từng trang giấy, đúng thứ tự.</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">{files.length}/{ESSAY_MAX_FILES} trang</span>
      </div>

      {!locked && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => cameraRef.current?.click()} disabled={Boolean(busy)} className="edu-btn inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-white disabled:opacity-60">
            <Camera size={18} aria-hidden="true" />Chụp ảnh
          </button>
          <button type="button" onClick={() => pickerRef.current?.click()} disabled={Boolean(busy)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-3 text-sm font-semibold text-violet-700 transition hover:border-violet-300 disabled:opacity-60">
            <ImagePlus size={18} aria-hidden="true" />Chọn ảnh/PDF
          </button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(event) => { void handleFiles(event.target.files); event.target.value = ""; }} />
          <input ref={pickerRef} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} onChange={(event) => { void handleFiles(event.target.files); event.target.value = ""; }} />
        </div>
      )}

      {(busy || loading) && (
        <p role="status" className="mt-3 flex items-center gap-2 text-xs font-semibold text-violet-700"><Loader2 size={14} className="animate-spin" aria-hidden="true" />{busy ?? "Đang tải bài đã nộp…"}</p>
      )}
      {error && (
        <p role="alert" className="mt-3 flex items-start gap-1.5 text-xs font-semibold text-rose-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>
      )}

      {files.length > 0 ? (
        <ol className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {files.map((file, index) => (
            <li key={file.key} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="relative aspect-[3/4] bg-gray-50">
                {file.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={file.url} alt={`Trang ${index + 1}`} className="h-full w-full object-contain" loading="lazy" />
                ) : (
                  <a href={file.url} target="_blank" rel="noreferrer" className="flex h-full flex-col items-center justify-center gap-2 text-gray-500">
                    <FileText size={32} aria-hidden="true" /><span className="max-w-full truncate px-2 text-xs">{file.name ?? "PDF"}</span>
                  </a>
                )}
                <span className="absolute left-1.5 top-1.5 rounded-md bg-gray-900/75 px-1.5 py-0.5 text-[11px] font-bold text-white">{index + 1}</span>
              </div>
              {!locked && (
                <div className="flex items-center justify-between border-t border-gray-100 px-1 py-1">
                  <button type="button" onClick={() => void move(index, -1)} disabled={index === 0 || Boolean(busy)} aria-label={`Đưa trang ${index + 1} lên trước`} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowLeft size={16} aria-hidden="true" /></button>
                  <button type="button" onClick={() => void remove(file.key)} disabled={Boolean(busy)} aria-label={`Xóa trang ${index + 1}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-30"><Trash2 size={16} aria-hidden="true" /></button>
                  <button type="button" onClick={() => void move(index, 1)} disabled={index === files.length - 1 || Boolean(busy)} aria-label={`Đưa trang ${index + 1} ra sau`} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowRight size={16} aria-hidden="true" /></button>
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : !loading && (
        <p className="mt-3 rounded-xl border border-dashed border-violet-200 bg-white px-3 py-5 text-center text-xs text-gray-500">Chưa có trang nào. {locked ? "" : "Bạn có thể nộp ngay hoặc sau khi bấm Nộp bài (có thêm 5 phút)."}</p>
      )}
    </section>
  );
}
