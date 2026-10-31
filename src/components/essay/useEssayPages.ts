"use client";

import { useEffect, useState } from "react";
import { loadPdfJs } from "@/lib/pdfjsLoader";
import { pageKey, type EssayFileView } from "@/utils/essayTypes";

export interface EssayPage {
  key: string;
  src: string;
  width: number;
  height: number;
  label: string;
}

const PDF_RENDER_WIDTH = 1400;

function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1000, height: image.naturalHeight || 1414 });
    image.onerror = () => resolve({ width: 1000, height: 1414 });
    image.src = src;
  });
}

/** Ảnh giữ nguyên; PDF được vẽ từng trang thành ảnh để chấm như ảnh chụp. */
async function expandFile(file: EssayFileView, index: number, objectUrls: string[]): Promise<EssayPage[]> {
  if (file.kind === "image") {
    const size = file.width && file.height ? { width: file.width, height: file.height } : await imageSize(file.url);
    return [{ key: pageKey(file.key, 0), src: file.url, ...size, label: `Ảnh ${index + 1}` }];
  }
  const { pdfjs, worker } = await loadPdfJs();
  const task = pdfjs.getDocument({ url: file.url, worker });
  const pdf = await task.promise;
  const pages: EssayPage[] = [];
  try {
    for (let number = 1; number <= Math.min(pdf.numPages, 40); number += 1) {
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PDF_RENDER_WIDTH / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      pages.push({ key: pageKey(file.key, number - 1), src: url, width: canvas.width, height: canvas.height, label: `PDF ${index + 1} · trang ${number}` });
    }
  } finally {
    void task.destroy();
  }
  return pages;
}

export function useEssayPages(files: EssayFileView[] | null) {
  const [state, setState] = useState<{ files: EssayFileView[] | null; pages: EssayPage[]; error: string }>({ files: null, pages: [], error: "" });

  useEffect(() => {
    if (!files) return;
    let cancelled = false;
    const objectUrls: string[] = [];
    void (async () => {
      try {
        const expanded = await Promise.all(files.map((file, index) => expandFile(file, index, objectUrls)));
        if (!cancelled) setState({ files, pages: expanded.flat(), error: "" });
      } catch (error) {
        console.error("Không mở được bài làm:", error);
        if (!cancelled) setState({ files, pages: [], error: "Không mở được một số file bài làm." });
      }
    })();
    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  return { pages: state.files === files ? state.pages : [], loading: Boolean(files) && state.files !== files, error: state.files === files ? state.error : "" };
}
