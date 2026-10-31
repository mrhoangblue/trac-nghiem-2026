type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
export type SharedPdf = { pdfjs: PdfJs; worker: InstanceType<PdfJs["PDFWorker"]> };

let pdfjsPromise: Promise<SharedPdf> | null = null;

// Dùng bản legacy để chạy được trên Safari iOS cũ. Một PDFWorker dùng chung cho mọi tài liệu:
// truyền worker riêng vào getDocument thì đóng tài liệu cũ không hủy worker của tài liệu mới.
export function loadPdfJs(): Promise<SharedPdf> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => ({
      pdfjs,
      worker: pdfjs.PDFWorker.create({
        port: new Worker(new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url), { type: "module" }),
      }),
    }));
  }
  return pdfjsPromise;
}
