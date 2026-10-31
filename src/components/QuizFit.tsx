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

/**
 * Cột câu hỏi cao đúng phần màn hình còn lại dưới đầu trang, để thanh tiêu đề,
 * thẻ câu hỏi và thanh điều hướng cùng nằm trong một màn hình.
 */
export function FitStage({ className = "", children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = ref.current;
    if (!stage) return;
    const measure = () => {
      const top = stage.getBoundingClientRect().top + window.scrollY;
      const available = Math.floor(window.innerHeight - top - 12);
      if (available >= MIN_STAGE_HEIGHT) stage.style.setProperty("--stage-h", `${available}px`);
      else stage.style.removeProperty("--stage-h");
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
 */
export function FitCard({ className = "", children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const content = box.firstElementChild;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
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
        markOverflow();
      });
    };
    const markOverflow = () => {
      box.toggleAttribute("data-more", box.scrollHeight - box.clientHeight - box.scrollTop > 4);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    if (content) observer.observe(content);
    // Ảnh hình vẽ tải xong làm câu hỏi cao lên: sự kiện load không nổi bọt nên bắt ở pha capture.
    box.addEventListener("load", fit, true);
    box.addEventListener("scroll", markOverflow, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      box.removeEventListener("load", fit, true);
      box.removeEventListener("scroll", markOverflow);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      <div>{children}</div>
    </div>
  );
}
