"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Download, Link2, QrCode, Share2, X } from "lucide-react";

interface ExamShareDialogProps {
  examId: string;
  examTitle: string;
  onClose: () => void;
}

const PRODUCTION_ORIGIN = "https://toanthayhoang.bluemath.app";

function getExamUrl(examId: string): string {
  if (typeof window === "undefined") return `${PRODUCTION_ORIGIN}/quiz/${encodeURIComponent(examId)}`;
  const isLocal = ["localhost", "0.0.0.0", "127.0.0.1"].includes(window.location.hostname);
  const origin = isLocal ? PRODUCTION_ORIGIN : window.location.origin;
  return `${origin}/quiz/${encodeURIComponent(examId)}`;
}

export default function ExamShareDialog({ examId, examTitle, onClose }: ExamShareDialogProps) {
  const shareUrl = useMemo(() => getExamUrl(examId), [examId]);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(shareUrl, {
      width: 560,
      margin: 3,
      errorCorrectionLevel: "H",
      color: { dark: "#32190f", light: "#fffdf8" },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setMessage("Không thể tạo mã QR. Vui lòng dùng link trực tiếp.");
      });
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setMessage("Đã sao chép link làm bài.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage("Không thể tự sao chép. Hãy chọn và sao chép link bên trên.");
    }
  };

  const shareLink = async () => {
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({
        title: examTitle,
        text: `Mời bạn làm bài: ${examTitle}`,
        url: shareUrl,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Không mở được bảng chia sẻ. Link đã sẵn sàng để sao chép.");
    }
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const anchor = document.createElement("a");
    anchor.href = qrDataUrl;
    anchor.download = `ma-qr-${examId}.png`;
    anchor.click();
  };

  const shareQr = async () => {
    if (!qrDataUrl) return;
    try {
      const blob = await (await fetch(qrDataUrl)).blob();
      const file = new File([blob], `ma-qr-${examId}.png`, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: examTitle,
          text: `Quét mã QR để làm bài: ${examTitle}`,
          files: [file],
        });
        return;
      }
      downloadQr();
      setMessage("Thiết bị chưa hỗ trợ chia sẻ ảnh trực tiếp. Mã QR đã được tải xuống.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Không thể chia sẻ ảnh QR. Bạn vẫn có thể tải ảnh xuống.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1f120c]/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exam-share-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-[30px] border border-[#ead8bd] bg-[#fffdf8] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#eadfce] px-6 py-5 sm:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-700">Mời học sinh làm bài</p>
            <h2 id="exam-share-title" className="mt-1 text-xl font-black leading-snug text-[#28180f] sm:text-2xl">
              {examTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e5d7c5] bg-white text-gray-500 transition hover:border-brand-300 hover:text-brand-800"
            aria-label="Đóng cửa sổ chia sẻ"
          >
            <X size={19} />
          </button>
        </div>

        <div className="grid gap-7 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-black text-gray-800">
              <Link2 size={17} className="text-brand-700" /> Link làm bài
            </div>
            <div className="mt-3 flex items-stretch gap-2 rounded-2xl border border-[#e5d8c6] bg-white p-2">
              <input
                value={shareUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
                aria-label="Link làm bài"
                className="min-w-0 flex-1 bg-transparent px-2 text-sm text-gray-700 outline-none"
              />
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#f4ede3] px-4 py-2.5 text-sm font-bold text-brand-800 transition hover:bg-[#eadcc9]"
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}
                {copied ? "Đã chép" : "Sao chép"}
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-gray-500">
              Học sinh mở link hoặc quét QR để vào thẳng trang làm bài. Các điều kiện về mật khẩu và thời gian mở đề vẫn được áp dụng.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={shareLink}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-brand-900/10 transition hover:bg-brand-800"
              >
                <Share2 size={18} /> Chia sẻ link
              </button>
              <button
                type="button"
                onClick={shareQr}
                disabled={!qrDataUrl}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-5 py-3 text-sm font-black text-brand-800 transition hover:border-brand-400 disabled:opacity-50"
              >
                <QrCode size={18} /> Chia sẻ QR
              </button>
            </div>

            {message && (
              <p className="mt-4 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800" role="status">
                {message}
              </p>
            )}
          </div>

          <div className="flex flex-col items-center rounded-[24px] border border-[#e4d4be] bg-white p-4">
            <div className="flex min-h-[218px] w-full items-center justify-center overflow-hidden rounded-2xl bg-[#fffdf8]">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt={`Mã QR của đề ${examTitle}`} className="h-auto w-full max-w-[220px]" />
              ) : (
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-700" />
              )}
            </div>
            <button
              type="button"
              onClick={downloadQr}
              disabled={!qrDataUrl}
              className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-brand-700 hover:text-brand-900 disabled:opacity-50"
            >
              <Download size={16} /> Tải ảnh QR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
