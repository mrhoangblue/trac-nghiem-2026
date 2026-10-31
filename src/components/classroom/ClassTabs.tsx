"use client";

import { useId, useState, type ReactNode } from "react";

export interface ClassTab { id: string; label: string; content: ReactNode }

/** Panels mount on first visit and stay mounted so switching tabs preserves drafts. */
export default function ClassTabs({ tabs, label }: { tabs: ClassTab[]; label: string }) {
  const prefix = useId();
  const [active, setActive] = useState(tabs[0].id);
  const [visited, setVisited] = useState<string[]>([tabs[0].id]);
  const select = (id: string) => {
    setActive(id);
    setVisited((current) => current.includes(id) ? current : [...current, id]);
  };
  return <div className="min-w-0 space-y-5">
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 rounded-2xl border border-gray-200 bg-white/85 p-1.5 shadow-[var(--shadow-soft)] backdrop-blur-xl">
      {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`${prefix}-${tab.id}`} aria-controls={`${prefix}-${tab.id}-panel`} aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1}
        onClick={() => select(tab.id)} onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault(); select(tabs[next].id); document.getElementById(`${prefix}-${tabs[next].id}`)?.focus();
        }} className={`min-h-11 flex-auto rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${active === tab.id ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <div key={tab.id} role="tabpanel" id={`${prefix}-${tab.id}-panel`} aria-labelledby={`${prefix}-${tab.id}`} hidden={active !== tab.id} tabIndex={0} className="min-w-0 focus-visible:outline-brand-600">{visited.includes(tab.id) ? tab.content : null}</div>)}
  </div>;
}
