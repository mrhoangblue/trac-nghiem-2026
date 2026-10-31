"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist/types/src/display/api";
import { loadPdfJs } from "@/lib/pdfjsLoader";
import { Download, ExternalLink, Loader2, Maximize2, Minimize2, Minus, Plus, ScanLine } from "lucide-react";

const ZOOM_STEPS = [0.6, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

interface PageSize {
  width: number;
  height: number;
}

function PdfPage({
  pdf,
  pageNumber,
  size,
  width,
  onVisible,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  size: PageSize;
  width: number;
  onVisible: (pageNumber: number, ratio: number) => void;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(pageNumber <= 2);
  const [rendered, setRendered] = useState(false);
  const height = Math.round((width * size.height) / size.width);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const nearObserver = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setNear(true); },
      { rootMargin: "1200px 0px" },
    );
    const visibleObserver = new IntersectionObserver(
      ([entry]) => onVisible(pageNumber, entry.intersectionRatio),
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    nearObserver.observe(holder);
    visibleObserver.observe(holder);
    return () => {
      nearObserver.disconnect();
      visibleObserver.disconnect();
    };
  }, [onVisible, pageNumber]);

  useEffect(() => {
    if (!near || width <= 0) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    void (async () => {
      const page = await pdf.getPage(pageNumber);
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / size.width) * outputScale });
      const offscreen = document.createElement("canvas");
      offscreen.width = Math.floor(viewport.width);
      offscreen.height = Math.floor(viewport.height);
      task = page.render({ canvas: offscreen, viewport });
      try {
        await task.promise;
      } catch {
        return;
      }
      if (cancelled) return;
      // Vẽ xong mới thay ảnh để khi phóng to/thu nhỏ trang không bị nháy trắng.
      canvas.width = offscreen.width;
      canvas.height = offscreen.height;
      canvas.getContext("2d")?.drawImage(offscreen, 0, 0);
      setRendered(true);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, pdf, pageNumber, size.width, width]);

  return (
    <div
      ref={holderRef}
      data-page={pageNumber}
      className="relative mx-auto bg-white shadow-[0_1px_3px_rgb(16_24_40/.12),0_8px_24px_-12px_rgb(16_24_40/.25)]"
      style={{ width, height }}
    >
      <canvas ref={canvasRef} aria-label={`Trang ${pageNumber}`} className="block h-full w-full" />
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center bg-white text-xs font-semibold text-gray-400">
          <Loader2 size={18} aria-hidden="true" className="mr-2 animate-spin" />Trang {pageNumber}
        </div>
      )}
    </div>
  );
}

export default function PdfViewer({ url, title, contained = false }: { url: string; title: string; contained?: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const visibility = useRef(new Map<number, number>());
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [failed, setFailed] = useState(false);
  const [frameWidth, setFrameWidth] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(ZOOM_STEPS.indexOf(1));
  const [currentPage, setCurrentPage] = useState(1);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    void (async () => {
      try {
        const { pdfjs, worker } = await loadPdfJs();
        loadingTask = pdfjs.getDocument({ url, worker });
        const loaded = await loadingTask.promise;
        const pageSizes = await Promise.all(
          Array.from({ length: loaded.numPages }, async (_, index) => {
            const page = await loaded.getPage(index + 1);
            const viewport = page.getViewport({ scale: 1 });
            return { width: viewport.width, height: viewport.height };
          }),
        );
        if (cancelled) return;
        setSizes(pageSizes);
        setPdf(loaded);
      } catch (error) {
        console.error("PDF viewer failed:", error);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [url]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let timer = 0;
    const observer = new ResizeObserver(([entry]) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setFrameWidth(Math.floor(entry.contentRect.width)), 120);
    });
    observer.observe(frame);
    setFrameWidth(Math.floor(frame.getBoundingClientRect().width));
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [focusMode]);

  useEffect(() => {
    if (!focusMode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setFocusMode(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [focusMode]);

  // Giữ nguyên trang đang đọc khi phóng to/thu nhỏ hoặc bật/tắt toàn màn hình.
  const anchorPage = useRef(1);
  const layoutKey = useRef("");

  const handleVisible = useCallback((pageNumber: number, ratio: number) => {
    visibility.current.set(pageNumber, ratio);
    let best = 1;
    let bestRatio = -1;
    visibility.current.forEach((value, key) => {
      if (value > bestRatio || (value === bestRatio && key < best)) {
        best = key;
        bestRatio = value;
      }
    });
    if (bestRatio > 0) {
      anchorPage.current = best;
      setCurrentPage(best);
    }
  }, []);

  const goToPage = (pageNumber: number) => {
    const target = scrollRef.current?.querySelector<HTMLElement>(`[data-page="${pageNumber}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const zoom = ZOOM_STEPS[zoomIndex];
  const fitWidth = Math.max(frameWidth - (frameWidth < 640 ? 16 : 48), 200);
  const pageWidth = Math.round(Math.min(fitWidth, focusMode ? 1100 : 980) * zoom);
  const scrollsInside = contained || focusMode;

  useLayoutEffect(() => {
    if (!pdf) return;
    const key = `${pageWidth}:${focusMode}`;
    const previous = layoutKey.current;
    layoutKey.current = key;
    if (!previous || previous === key || anchorPage.current <= 1) return;
    const container = scrollRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-page="${anchorPage.current}"]`);
    if (!container || !target) return;
    if (scrollsInside) container.scrollTop = target.offsetTop - 12;
    else target.scrollIntoView({ block: "start" });
  }, [focusMode, pageWidth, pdf, scrollsInside]);

  if (failed) {
    return (
      <div className="flex h-full min-h-[420px] flex-col">
        <iframe src={`${url}#toolbar=1&navpanes=0&view=FitH`} title={title} className="min-h-[420px] w-full flex-1 bg-white" />
        <p className="border-t border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          Không xem được trực tiếp?{" "}
          <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">Mở PDF trong tab mới</a>
        </p>
      </div>
    );
  }

  const viewer = (
    <div
      ref={frameRef}
      className={focusMode
        ? "fixed inset-0 z-[70] flex flex-col bg-[#E9EBF3]"
        : `flex flex-col bg-[#E9EBF3] ${contained ? "h-full min-h-0" : ""}`}
      role={focusMode ? "dialog" : undefined}
      aria-modal={focusMode || undefined}
      aria-label={focusMode ? `Đọc toàn màn hình: ${title}` : undefined}
    >
      <div className={`z-10 flex shrink-0 items-center gap-1.5 border-b border-gray-200 bg-white/90 px-2 py-1.5 backdrop-blur-md sm:gap-2 sm:px-3 ${scrollsInside ? "" : "sticky top-16"}`}>
        <div className="flex items-center rounded-xl bg-gray-100 p-0.5">
          <button type="button" aria-label="Thu nhỏ" disabled={zoomIndex === 0} onClick={() => setZoomIndex((index) => Math.max(0, index - 1))} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-700 transition hover:bg-white disabled:opacity-30"><Minus size={16} aria-hidden="true" /></button>
          <button type="button" aria-label="Vừa khung" title="Vừa khung" onClick={() => setZoomIndex(ZOOM_STEPS.indexOf(1))} className="flex h-9 min-w-14 items-center justify-center rounded-lg px-1.5 font-display text-xs font-bold tabular-nums text-gray-700 transition hover:bg-white">{Math.round(zoom * 100)}%</button>
          <button type="button" aria-label="Phóng to" disabled={zoomIndex === ZOOM_STEPS.length - 1} onClick={() => setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-700 transition hover:bg-white disabled:opacity-30"><Plus size={16} aria-hidden="true" /></button>
        </div>
        {focusMode
          ? <span className="ml-1 hidden min-w-0 truncate font-display text-sm font-bold text-gray-800 md:block">{title}</span>
          : <span className="ml-1 hidden items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-gray-500 xl:inline-flex"><ScanLine size={14} aria-hidden="true" />Cuộn để đọc tiếp</span>}
        <span className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
          <span className="sr-only">Đến trang</span>
          <select
            value={currentPage}
            onChange={(event) => goToPage(Number(event.target.value))}
            disabled={!pdf}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 font-display text-xs font-bold tabular-nums text-gray-800 outline-none focus:border-brand-400"
          >
            {sizes.map((_, index) => <option key={index} value={index + 1}>Trang {index + 1}</option>)}
            {!pdf && <option value={1}>Trang 1</option>}
          </select>
          <span className="hidden whitespace-nowrap tabular-nums sm:inline">/ {sizes.length || "…"}</span>
        </label>
        <a href={url} target="_blank" rel="noreferrer" download aria-label="Tải PDF" title="Tải PDF" className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100"><Download size={16} aria-hidden="true" /></a>
        <a href={url} target="_blank" rel="noreferrer" aria-label="Mở trong tab mới" title="Mở trong tab mới" className="hidden h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 sm:flex"><ExternalLink size={16} aria-hidden="true" /></a>
        <button
          type="button"
          onClick={() => setFocusMode((value) => !value)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-600 px-2.5 text-xs font-semibold text-white transition hover:bg-brand-700"
        >
          {focusMode ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}
          <span className="hidden sm:inline">{focusMode ? "Thoát toàn màn hình" : "Toàn màn hình"}</span>
          <span className="sr-only sm:hidden">{focusMode ? "Thoát toàn màn hình" : "Toàn màn hình"}</span>
        </button>
      </div>

      <div
        ref={scrollRef}
        className={`relative ${scrollsInside ? "min-h-0 flex-1 overflow-auto overscroll-contain" : "overflow-x-auto"}`}
      >
        {!pdf ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-sm font-semibold text-gray-500">
            <Loader2 size={24} aria-hidden="true" className="animate-spin text-brand-500" />
            Đang mở tài liệu…
          </div>
        ) : (
          <div className="flex w-max min-w-full flex-col items-center gap-3 px-2 py-3 sm:gap-4 sm:px-6 sm:py-5">
            {sizes.map((size, index) => (
              <PdfPage key={index} pdf={pdf} pageNumber={index + 1} size={size} width={pageWidth} onVisible={handleVisible} />
            ))}
            <p className="pb-2 pt-1 text-xs font-semibold text-gray-400">Hết tài liệu · {sizes.length} trang</p>
          </div>
        )}
      </div>

    </div>
  );

  // Portal ra body để lớp toàn màn hình không bị khối cha (backdrop-filter, overflow) giới hạn.
  return focusMode ? createPortal(viewer, document.body) : viewer;
}
