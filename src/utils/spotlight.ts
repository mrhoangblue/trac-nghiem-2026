import type { PointerEvent } from "react";

/** Ghi vị trí con trỏ vào --mx/--my để vệt sáng của `.edu-card` chạy theo. */
export function trackSpotlight(event: PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--mx", `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty("--my", `${event.clientY - rect.top}px`);
}
