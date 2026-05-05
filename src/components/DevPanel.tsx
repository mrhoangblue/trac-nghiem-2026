"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/AuthContext";

const IS_DEV = process.env.NODE_ENV === "development";

type PanelTheme = "light" | "dark";

export default function DevPanel() {
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [panelTheme, setPanelTheme] = useState<PanelTheme>("light");
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Load saved theme preference
  useEffect(() => {
    const saved = localStorage.getItem("devpanel-theme") as PanelTheme | null;
    if (saved === "dark" || saved === "light") setPanelTheme(saved);
  }, []);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!IS_DEV || !user) return null;

  const toggleTheme = () => {
    const next: PanelTheme = panelTheme === "light" ? "dark" : "light";
    setPanelTheme(next);
    localStorage.setItem("devpanel-theme", next);
  };

  const resetCache = async () => {
    setResetting(true);
    setResetMsg("");
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      setResetMsg("✅ Cache cleared! Reloading…");
      setTimeout(() => window.location.reload(), 800);
    } catch {
      setResetMsg("❌ Lỗi khi reset cache.");
      setResetting(false);
    }
  };

  // ── Panel styles ──────────────────────────────────────────────────────────────
  const isDark = panelTheme === "dark";
  const panel = isDark
    ? "bg-[#1a1a1a] border-[#333] text-gray-100"
    : "bg-white border-gray-200 text-gray-800";
  const row = isDark
    ? "hover:bg-white/10 text-gray-200"
    : "hover:bg-gray-50 text-gray-700";
  const divider = isDark ? "border-[#333]" : "border-gray-100";
  const labelCls = isDark ? "text-gray-500" : "text-gray-400";
  const closeBtn = isDark ? "text-gray-500 hover:text-gray-200" : "text-gray-400 hover:text-gray-700";

  return (
    <div ref={panelRef} className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2">
      {/* Floating panel */}
      {open && (
        <div
          className={`w-72 rounded-2xl border shadow-2xl text-sm overflow-hidden transition-none ${panel}`}
        >
          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-3 border-b ${divider}`}>
            <span className="font-extrabold text-xs uppercase tracking-widest opacity-60">
              Dev Tools
            </span>
            <div className="flex items-center gap-2">
              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                title={isDark ? "Light mode" : "Dark mode"}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-base ${row}`}
              >
                {isDark ? "☀️" : "🌙"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xl leading-none transition-colors ${closeBtn}`}
              >
                ×
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-2">
            {/* Reset Cache — everyone */}
            <button
              onClick={resetCache}
              disabled={resetting}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left disabled:opacity-50 ${row}`}
            >
              <span className="text-base shrink-0">🔄</span>
              <div className="min-w-0">
                <p className="font-semibold text-sm">Reset Bundler Cache</p>
                {resetMsg && (
                  <p className="text-xs mt-0.5 opacity-70">{resetMsg}</p>
                )}
              </div>
            </button>

            {/* Admin-only section */}
            {isAdmin && (
              <>
                <div className={`my-2 border-t ${divider}`} />
                <p className={`text-[10px] font-extrabold uppercase tracking-widest px-3 pb-1 ${labelCls}`}>
                  Admin only
                </p>

                {/* Hide Dev Tools hint */}
                <div className={`flex items-start gap-3 px-3 py-2.5 rounded-xl ${row}`}>
                  <span className="text-base shrink-0 mt-0.5">👁️</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">Ẩn Dev Panel</p>
                    <p className="text-xs opacity-60 mt-0.5 leading-relaxed">
                      Set <code className="font-mono">devIndicators: false</code> trong{" "}
                      <code className="font-mono">next.config.ts</code>
                    </p>
                  </div>
                </div>

                {/* Restart dev server hint */}
                <div className={`flex items-start gap-3 px-3 py-2.5 rounded-xl ${row}`}>
                  <span className="text-base shrink-0 mt-0.5">⚡</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">Restart Dev Server</p>
                    <p className="text-xs opacity-60 mt-0.5 leading-relaxed">
                      Dùng terminal: <code className="font-mono">npm run dev</code>
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Dev Tools"
        className={`w-9 h-9 rounded-full shadow-lg flex items-center justify-center text-sm font-bold transition-all border ${
          open
            ? "bg-indigo-600 border-indigo-500 text-white scale-95"
            : isDark
            ? "bg-[#1a1a1a] border-[#444] text-gray-300 hover:border-indigo-400"
            : "bg-white border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600"
        }`}
      >
        ⚙
      </button>
    </div>
  );
}
