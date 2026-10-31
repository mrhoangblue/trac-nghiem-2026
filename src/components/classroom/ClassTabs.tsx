"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface ClassTab {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Số việc cần chú ý trong tab (bài chưa làm, yêu cầu chờ duyệt…); ẩn khi 0. */
  badge?: number;
  content: ReactNode;
}

// Tab đang mở nằm trên URL (?tab=…): tải lại trang, quay lại từ bài thi hay gửi
// link cho học sinh đều mở đúng tab.
const TAB_EVENT = "class-tab-change";

function subscribeTab(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(TAB_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(TAB_EVENT, onChange);
  };
}
const readTab = () => new URLSearchParams(window.location.search).get("tab");

/** Chuyển tab từ nơi khác trong trang (ví dụ nút "Xem tất cả" ở Tổng quan). */
export function selectClassTab(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", id);
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(TAB_EVENT));
}

/** Panels mount on first visit and stay mounted so switching tabs preserves drafts. */
export default function ClassTabs({ tabs, label }: { tabs: ClassTab[]; label: string }) {
  const prefix = useId();
  const urlTab = useSyncExternalStore(subscribeTab, readTab, () => null);
  const active = tabs.some((tab) => tab.id === urlTab) ? urlTab! : tabs[0].id;
  const [visited, setVisited] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const mounted = new Set([...visited, active]);

  // Tab vừa chọn luôn nằm trong vùng nhìn thấy của thanh cuộn ngang trên điện thoại.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  const select = (id: string) => {
    setVisited((current) => current.includes(active) ? current : [...current, active]);
    selectClassTab(id);
  };

  return <div className="min-w-0 space-y-5">
    <div className="sticky top-[4.5rem] z-20 -mx-4 px-4 sm:mx-0 sm:px-0">
      <div ref={listRef} role="tablist" aria-label={label} className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border border-gray-200 bg-white/90 p-1.5 shadow-[var(--shadow-soft)] backdrop-blur-xl">
        {tabs.map((tab, index) => {
          const selected = active === tab.id;
          const Icon = tab.icon;
          return <button key={tab.id} data-tab={tab.id} type="button" role="tab" id={`${prefix}-${tab.id}`} aria-controls={`${prefix}-${tab.id}-panel`} aria-selected={selected} tabIndex={selected ? 0 : -1}
            onClick={() => select(tab.id)} onKeyDown={(event) => {
              const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
              if (next < 0) return;
              event.preventDefault(); select(tabs[next].id); document.getElementById(`${prefix}-${tabs[next].id}`)?.focus();
            }} className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:flex-1 ${selected ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
            <Icon size={17} aria-hidden="true" className={selected ? "" : "text-gray-400"} />
            {tab.label}
            {Boolean(tab.badge) && <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold leading-none tabular-nums ${selected ? "bg-white/25 text-white" : "bg-rose-500 text-white"}`} aria-label={`${tab.badge} mục cần chú ý`}>{tab.badge}</span>}
          </button>;
        })}
      </div>
    </div>
    {tabs.map((tab) => <div key={tab.id} role="tabpanel" id={`${prefix}-${tab.id}-panel`} aria-labelledby={`${prefix}-${tab.id}`} hidden={active !== tab.id} tabIndex={0} className="min-w-0 focus-visible:outline-brand-600">{mounted.has(tab.id) ? tab.content : null}</div>)}
  </div>;
}
