import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

/** Đầu trang lớp học, dùng chung cho học sinh và giáo viên. */
export default function ClassHero({ name, subtitle, description, back, children }: {
  name: string;
  subtitle?: ReactNode;
  description?: string;
  /** Nút quay lại danh sách lớp, gộp vào đầu trang thay cho link riêng phía trên. */
  back?: { href: string; label: string };
  /** Chip/hành động, nằm bên phải tên lớp trên màn rộng. */
  children?: ReactNode;
}) {
  const meta = [subtitle, description].filter(Boolean);
  return (
    <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 px-4 py-3.5 text-white shadow-[var(--shadow-lift)] sm:px-5 sm:py-4">
      <div aria-hidden="true" className="edu-dots absolute inset-0 opacity-40 mix-blend-overlay" />
      <div aria-hidden="true" className="absolute -right-16 -top-24 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
      <span aria-hidden="true" className="absolute -bottom-6 right-4 font-display text-7xl font-extrabold text-white/10">∑</span>
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-72 items-center gap-3">
          {back && (
            <Link href={back.href} aria-label={`Quay lại ${back.label}`} title={back.label} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-md transition hover:-translate-x-0.5 hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <ArrowLeft size={19} aria-hidden="true" />
            </Link>
          )}
          <div className="min-w-0">
            {back && (
              <nav aria-label="Đường dẫn" className="flex items-center gap-1 text-[11px] font-semibold text-indigo-100">
                <Link href={back.href} className="hover:text-white hover:underline">{back.label}</Link>
                <ChevronRight size={12} aria-hidden="true" className="opacity-70" />
                <span aria-current="page" className="text-white/70">Lớp học</span>
              </nav>
            )}
            <h1 className="truncate font-display text-xl font-extrabold leading-tight tracking-tight sm:text-2xl" title={name}>{name}</h1>
            {meta.length > 0 && (
              <p className="mt-0.5 truncate text-xs text-white/80" title={typeof description === "string" ? description : undefined}>
                {meta.map((item, index) => <span key={index}>{index > 0 && " · "}{item}</span>)}
              </p>
            )}
          </div>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">{children}</div>}
      </div>
    </header>
  );
}

/** Chip trong suốt trên nền gradient của đầu trang lớp. */
export function HeroChip({ children, tone = "glass" }: { children: ReactNode; tone?: "glass" | "warn" }) {
  return (
    <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 ${tone === "warn" ? "bg-amber-300 font-bold text-amber-950" : "bg-white/15 ring-1 ring-white/25 backdrop-blur-md"}`}>
      {children}
    </span>
  );
}
