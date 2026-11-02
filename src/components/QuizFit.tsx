"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Dưới chiều cao này (điện thoại nằm ngang, cửa sổ rất thấp) cột câu hỏi trở
// về chiều cao tự nhiên và trang cuộn như bình thường.
const MIN_STAGE_HEIGHT = 420;
// Chữ đề không nhỏ hơn 80% cỡ đã chọn (88% trên điện thoại để vẫn dễ đọc);
// nếu vẫn chưa vừa thì thẻ câu hỏi cuộn, có vệt mờ ở đáy báo còn nội dung.
const minFit = () => (window.innerWidth < 640 ? 0.88 : 0.8);
// Hình vẽ co tối đa còn 45% chiều cao mặc định.
const MIN_FIGURE = 0.45;
// Chênh lệch nhỏ hơn mức này (thanh công cụ trình duyệt, làm tròn pixel) thì bỏ qua.
const JITTER_PX = 3;
// Lưới an toàn: quá số lần co lại này trong 1 giây là đang bị vòng lặp, ngừng
// tự co cho tới khi cửa sổ thật sự đổi kích thước.
const MAX_FITS_PER_SECOND = 6;

/**
 * Cột câu hỏi cao đúng phần màn hình còn lại dưới đầu trang, để thanh tiêu đề,
 * thẻ câu hỏi và thanh điều hướng cùng nằm trong một màn hình.
 */
export function FitStage({ className = "", children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = ref.current;
    if (!stage) return;
    let current: number | null = null;
    const measure = () => {
      const top = stage.getBoundingClientRect().top + window.scrollY;
      const available = Math.floor(window.innerHeight - top - 12);
      const next = available >= MIN_STAGE_HEIGHT ? available : null;
      // Không đặt lại khi chỉ lệch vài pixel: tránh vòng lặp đo → đổi chiều cao
      // → trang cuộn/thanh cuộn hiện → đo lại (gây giật trên một số máy Mac).
      if (next !== null && current !== null && Math.abs(next - current) < JITTER_PX) return;
      if (next === current) return;
      current = next;
      if (next === null) stage.style.removeProperty("--stage-h");
      else stage.style.setProperty("--stage-h", `${next}px`);
    };
    measure();
    // Banner phía trên (chế độ học sinh, cảnh báo…) đổi chiều cao thì đo lại.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return <div ref={ref} className={`quiz-stage ${className}`}>{children}</div>;
}

/**
 * Thẻ câu hỏi tự co: khi nội dung cao hơn khung, giảm dần --fit (cỡ chữ) và
 * --fig (hình vẽ co nhanh hơn chữ) cho tới khi vừa, thay vì bắt học sinh cuộn.
 *
 * Chỉ tính lại khi khung đổi kích thước hoặc nội dung thật sự đổi (đổi chữ,
 * ảnh/hình TikZ tải xong, phông chữ tải xong). Không theo dõi kích thước của
 * chính nội dung, vì việc co chữ làm nội dung đổi kích thước và tự kích hoạt
 * lại, gây vòng lặp nhấp nháy.
 */
export function FitCard({ className = "", children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const content = box.firstElementChild;
    let frame = 0;
    let lastWidth = -1;
    let lastHeight = -1;
    let recent: number[] = [];
    let frozen = false;

    const markOverflow = () => {
      box.toggleAttribute("data-more", box.scrollHeight - box.clientHeight - box.scrollTop > 4);
    };
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const now = performance.now();
        recent = recent.filter((time) => now - time < 1000);
        recent.push(now);
        if (frozen || recent.length > MAX_FITS_PER_SECOND) {
          frozen = true;
          markOverflow();
          return;
        }
        let scale = 1;
        let figure = 1;
        const apply = () => {
          box.style.setProperty("--fit", String(scale));
          box.style.setProperty("--fig", String(figure));
        };
        const overflowing = () => box.scrollHeight > box.clientHeight + 1;
        apply();
        const floor = minFit();
        while (overflowing() && scale > floor) {
          scale = Math.round((scale - 0.04) * 100) / 100;
          figure = Math.max(MIN_FIGURE, 1 - (1 - scale) * 2.75);
          apply();
        }
        // Chữ đã ở mức nhỏ nhất mà vẫn chưa vừa: thu tiếp riêng hình vẽ.
        while (overflowing() && figure > MIN_FIGURE) {
          figure = Math.max(MIN_FIGURE, Math.round((figure - 0.1) * 100) / 100);
          apply();
        }
        lastWidth = box.clientWidth;
        lastHeight = box.clientHeight;
        markOverflow();
      });
    };
    const onBoxResize = () => {
      if (Math.abs(box.clientWidth - lastWidth) < JITTER_PX && Math.abs(box.clientHeight - lastHeight) < JITTER_PX) return;
      fit();
    };
    const onWindowResize = () => {
      frozen = false;
      recent = [];
      fit();
    };

    fit();
    const resizeObserver = new ResizeObserver(onBoxResize);
    resizeObserver.observe(box);
    const mutationObserver = new MutationObserver(fit);
    if (content) mutationObserver.observe(content, { childList: true, subtree: true, characterData: true });
    // Ảnh hình vẽ tải xong làm câu hỏi cao lên: sự kiện load không nổi bọt nên bắt ở pha capture.
    box.addEventListener("load", fit, true);
    box.addEventListener("scroll", markOverflow, { passive: true });
    window.addEventListener("resize", onWindowResize);
    void document.fonts?.ready.then(fit);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      box.removeEventListener("load", fit, true);
      box.removeEventListener("scroll", markOverflow);
      window.removeEventListener("resize", onWindowResize);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      <div>{children}</div>
    </div>
  );
}
