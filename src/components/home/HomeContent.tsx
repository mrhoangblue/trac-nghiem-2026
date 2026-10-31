"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, BookOpenCheck, Check, ChevronRight, Clock3, FileQuestion, Inbox, LockKeyhole, RotateCcw, Search, Sparkles, Target, TrendingUp, Trophy } from "lucide-react";
import { GRADE_LEVELS } from "@/components/Sidebar";
import { gradeHref } from "@/lib/seo";
import { useAuth } from "@/lib/AuthContext";

interface Exam {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  gradeLevel?: string;
  examType?: string;
  coverImageUrl?: string;
  duration?: number;
  requiresPassword?: boolean;
  /** Xem examAudience.ts. Kho đề chỉ nhận đề công khai ("all" | "both"). */
  targetType?: "all" | "classes" | "both";
  targetClassIds?: string[];
}

// ── Grade themes ──────────────────────────────────────────────────────────────

const GRADE_THEMES: Record<string, { gradient: string; tint: string; short: string }> = {
  "Lớp 10": { gradient: "from-sky-400 via-blue-500 to-indigo-500", tint: "text-blue-700 bg-blue-50", short: "10" },
  "Lớp 11": { gradient: "from-emerald-400 via-teal-500 to-cyan-600", tint: "text-teal-700 bg-teal-50", short: "11" },
  "Lớp 12": { gradient: "from-violet-500 via-purple-500 to-fuchsia-500", tint: "text-violet-700 bg-violet-50", short: "12" },
  "Thi Thử TN THPT": { gradient: "from-amber-400 via-orange-500 to-rose-500", tint: "text-orange-700 bg-orange-50", short: "TN" },
};
const FALLBACK_THEME = { gradient: "from-indigo-500 via-violet-500 to-purple-500", tint: "text-indigo-700 bg-indigo-50", short: "∑" };
const themeFor = (grade?: string | null) => (grade && GRADE_THEMES[grade]) || FALLBACK_THEME;

const TOPICS = [
  { symbol: "f(x)", label: "Hàm số" }, { symbol: "logₐ", label: "Mũ – Logarit" }, { symbol: "∫", label: "Nguyên hàm – Tích phân" },
  { symbol: "Oxyz", label: "Hình học không gian" }, { symbol: "P(A)", label: "Xác suất" }, { symbol: "x̄", label: "Thống kê" },
  { symbol: "sin", label: "Lượng giác" }, { symbol: "uₙ", label: "Dãy số – Cấp số" }, { symbol: "→", label: "Vectơ" },
];

// ── Scroll reveal ─────────────────────────────────────────────────────────────
// Elements marked data-reveal fade up once they enter the viewport. The
// container only hides them after JS runs, so content never depends on it.

function useReveal(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    root.classList.add("edu-reveal-ready");
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    root.querySelectorAll("[data-reveal]:not(.is-visible)").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);
  return ref;
}

function trackSpotlight(e: PointerEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - rect.top}px`);
}

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div role="status" aria-label="Đang tải danh sách đề thi" className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((item) => <div key={item} aria-hidden="true" className="min-h-[22rem] overflow-hidden rounded-3xl border border-edu-line bg-white motion-safe:animate-pulse">
        <div className="h-32 bg-gradient-to-br from-indigo-100 to-violet-100" />
        <div className="space-y-4 p-6"><div className="h-4 w-24 rounded-full bg-edu-surface" /><div className="h-6 w-4/5 rounded-full bg-edu-surface" /><div className="h-12 rounded-xl bg-edu-surface" /><div className="h-12 rounded-2xl bg-indigo-50" /></div>
      </div>)}
      <span className="sr-only">Đang tải danh sách đề thi…</span>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-indigo-200 bg-edu-surface px-6 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30"><Inbox size={28} aria-hidden="true" /></span>
      <h2 className="font-display text-2xl font-bold">
        {filtered ? "Không có đề thi nào trong mục này" : "Chưa có bài thi nào"}
      </h2>
      {filtered && (
        <Link href="/#kho-de" className="inline-flex items-center gap-1.5 text-sm font-semibold text-edu-indigo underline-offset-4 hover:underline">
          Xem tất cả đề thi <ArrowRight size={15} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

// ── Exam Card ─────────────────────────────────────────────────────────────────

function ExamCard({ exam, index }: { exam: Exam; index: number }) {
  const theme = themeFor(exam.gradeLevel);

  return (
    <article data-reveal style={delay((index % 3) * 90)} onPointerMove={trackSpotlight} className="edu-card group flex flex-col overflow-hidden rounded-3xl">
      <div className={`relative h-36 shrink-0 overflow-hidden bg-gradient-to-br ${theme.gradient}`}>
        {exam.coverImageUrl ? (
          <Image src={exam.coverImageUrl} alt={`Ảnh minh họa ${exam.title}`} fill unoptimized sizes="(max-width: 768px) 100vw, 33vw" className="object-cover transition duration-700 group-hover:scale-105" />
        ) : (
          <>
            <div aria-hidden="true" className="edu-dots absolute inset-0 opacity-60 mix-blend-overlay" />
            <div aria-hidden="true" className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-2xl transition-transform duration-700 group-hover:scale-125" />
            <span aria-hidden="true" className="absolute -bottom-5 right-5 font-display text-[6rem] font-extrabold leading-none text-white/25 transition-transform duration-500 group-hover:-translate-y-1.5">{theme.short}</span>
          </>
        )}
        <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-edu-ink shadow-sm backdrop-blur">{exam.gradeLevel || "Môn Toán"}</span>
      </div>
      <div className="relative z-[3] flex flex-1 flex-col p-6">
        <span className={`mb-3 w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${theme.tint}`}>{exam.examType || "Đề ôn tập"}</span>
        <h3 className="line-clamp-2 min-h-[3.5rem] font-display text-lg font-bold leading-7 transition-colors group-hover:text-edu-indigo">{exam.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-edu-muted">{exam.description || "Luyện tập có mục tiêu, xem kết quả và củng cố phần kiến thức còn yếu."}</p>
        <div className="mt-auto pt-5">
          <div className="mb-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-edu-muted">
            <span className="inline-flex items-center gap-1.5"><FileQuestion size={16} aria-hidden="true" />{exam.questionCount ?? 0} câu</span>
            <span className="inline-flex items-center gap-1.5"><Clock3 size={16} aria-hidden="true" />{exam.duration || 90} phút</span>
            {exam.requiresPassword && <span className="inline-flex items-center gap-1.5"><LockKeyhole size={15} aria-hidden="true" />Có mật khẩu</span>}
          </div>
          <Link href={`/quiz/${exam.id}`} className="flex min-h-12 w-full items-center justify-between rounded-2xl bg-edu-surface px-5 text-sm font-semibold text-edu-ink transition-all duration-300 after:absolute after:inset-0 after:content-[''] group-hover:bg-gradient-to-r group-hover:from-indigo-600 group-hover:to-violet-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-indigo-500/30">
            <span>Bắt đầu làm bài</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-edu-indigo shadow-sm transition-transform duration-300 group-hover:translate-x-1"><ArrowRight size={16} aria-hidden="true" /></span>
          </Link>
        </div>
      </div>
    </article>
  );
}

// ── Hero visual ───────────────────────────────────────────────────────────────
// Floating cards illustrate the product loop (question → progress → solution).

function HeroVisual() {
  return (
    <div className="edu-rise relative mx-auto w-full max-w-[30rem] px-6 pb-14 pt-8 sm:px-12" style={delay(200)}>
      <div aria-hidden="true" className="absolute inset-x-10 bottom-10 top-6 rounded-[3rem] bg-gradient-to-br from-indigo-500 via-violet-500 to-sky-400 opacity-30 blur-3xl" />
      <div className="relative aspect-[4/5] overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-400 shadow-[var(--shadow-edu-lift)] ring-8 ring-white/70">
        <div aria-hidden="true" className="edu-dots absolute inset-0 opacity-70 mix-blend-overlay" />
        <div aria-hidden="true" className="absolute -left-16 top-10 h-64 w-64 rounded-full border-[28px] border-white/10" />
        <Image
          src="/thay-hoang-blue-portrait.png"
          alt="Thầy Hoàng Blue"
          fill
          sizes="(max-width: 640px) 85vw, 420px"
          className="object-cover object-[center_18%]"
          priority
        />
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-indigo-950/80 to-transparent" />
        <div className="absolute bottom-12 left-6 text-white sm:bottom-6">
          <p className="text-xs font-medium text-indigo-100">Giáo viên đồng hành</p>
          <p className="font-display text-2xl font-bold">Thầy Hoàng Blue</p>
        </div>
      </div>

      <div aria-hidden="true" className="edu-glass edu-float absolute -left-6 top-24 hidden w-56 rounded-2xl p-4 sm:block">
        <p className="text-xs font-semibold text-edu-indigo">Câu 3 · Lớp 12</p>
        <p className="mt-1 text-sm font-semibold">Đạo hàm của y = x³ là</p>
        <div className="mt-3 space-y-1.5 text-sm">
          <span className="flex items-center justify-between rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2 font-semibold text-white shadow-md shadow-emerald-500/30">A. 3x²<Check size={16} strokeWidth={3} /></span>
          <span className="block rounded-xl bg-white/80 px-3 py-2 text-edu-muted">B. x²</span>
        </div>
      </div>

      <div aria-hidden="true" className="edu-glass edu-float-slow absolute -right-1 top-2 flex items-center gap-3 rounded-2xl p-3 pr-4 sm:-right-4">
        <svg width="56" height="56" viewBox="0 0 100 100" className="-rotate-90">
          <defs><linearGradient id="edu-ring-g" x1="0" x2="1"><stop offset="0" stopColor="#4F46E5" /><stop offset="1" stopColor="#0EA5E9" /></linearGradient></defs>
          <circle cx="50" cy="50" r="42" fill="none" stroke="#E0E7FF" strokeWidth="11" />
          <circle cx="50" cy="50" r="42" fill="none" stroke="url(#edu-ring-g)" strokeWidth="11" strokeLinecap="round" className="edu-ring" />
        </svg>
        <div>
          <p className="text-xs text-edu-muted">Tiến độ ôn tập</p>
          <p className="font-display text-xl font-extrabold">78%</p>
        </div>
      </div>

      <div aria-hidden="true" className="edu-glass edu-float absolute -right-1 bottom-4 flex items-center gap-2.5 rounded-2xl px-4 py-3 sm:right-2" style={{ animationDelay: "-3s" }}>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-orange-500/30"><Trophy size={18} /></span>
        <div><p className="text-sm font-bold">Lời giải từng bước</p><p className="text-xs text-edu-muted">Hiểu vì sao đúng, vì sao sai</p></div>
      </div>
    </div>
  );
}

// ── Home content (reads search params) ───────────────────────────────────────

export default function HomeContent({ grade = null, type = null, heading, description }: { grade?: string | null; type?: string | null; heading?: string; description?: string }) {
  const { user, login, loading: authLoading } = useAuth();
  const [search, setSearch] = useState("");

  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
      setExams([]);
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/exams/catalog", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Không thể tải danh sách đề thi.");
        const payload = await response.json();
        if (!controller.signal.aborted) setExams(payload.exams);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Không thể tải đề thi.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [user]);

  const filtered = exams.filter((e) => {
    if (search.trim() && !e.title.toLocaleLowerCase("vi").includes(search.trim().toLocaleLowerCase("vi"))) return false;
    if (grade && e.gradeLevel !== grade) return false;
    if (type && e.examType !== type) return false;
    return true;
  });

  const filterLabel = grade ? `${grade}${type ? ` · ${type}` : ""}` : "Tất cả đề thi";
  const revealRef = useReveal(`${authLoading}-${!!user}-${loading}-${error}-${filtered.map((e) => e.id).join(",")}`);

  return (
    <div ref={revealRef} className="home-edu w-full overflow-hidden">
      {/* ── Hero ── */}
      <section className="relative">
        <div className="edu-aurora" aria-hidden="true"><span /><span /><span /></div>
        <div className="edu-dots absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:py-24">
          <div>
            <span className="edu-rise edu-glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white"><Sparkles size={13} aria-hidden="true" /></span>
              Toán THPT · Lớp 10 đến thi tốt nghiệp
            </span>
            <h1 className="edu-rise mt-6 max-w-2xl font-display text-[2.5rem] font-extrabold leading-[1.12] tracking-tight sm:text-6xl lg:text-[4rem]" style={delay(80)}>
              {heading || <>Học Toán thông minh,<br /><span className="edu-gradient-text">tiến bộ mỗi ngày.</span></>}
            </h1>
            <p className="edu-rise mt-6 max-w-xl text-base leading-7 text-edu-muted sm:text-lg sm:leading-8" style={delay(160)}>{description || "Luyện đề đúng trọng tâm, làm bài có tính giờ và xem lời giải từng bước. Mỗi lần làm là một lần biết chính xác mình cần ôn gì tiếp theo."}</p>
            <div className="edu-rise mt-8 flex flex-col gap-3 sm:flex-row sm:items-center" style={delay(240)}>
              <a href="#kho-de" className="edu-btn inline-flex min-h-14 items-center justify-center gap-2.5 rounded-2xl px-7 text-base font-semibold text-white">Bắt đầu luyện đề <ArrowRight size={19} aria-hidden="true" /></a>
              {user
                ? <Link href="/student/history" className="inline-flex min-h-14 items-center justify-center gap-1.5 rounded-2xl border border-edu-line bg-white/70 px-6 text-base font-semibold backdrop-blur transition hover:border-indigo-200 hover:bg-white hover:shadow-[var(--shadow-edu)]">Xem tiến bộ của tôi <ChevronRight size={17} aria-hidden="true" /></Link>
                : <button onClick={login} className="inline-flex min-h-14 items-center justify-center gap-1.5 rounded-2xl border border-edu-line bg-white/70 px-6 text-base font-semibold backdrop-blur transition hover:border-indigo-200 hover:bg-white hover:shadow-[var(--shadow-edu)]">Đăng nhập miễn phí <ArrowUpRight size={17} aria-hidden="true" /></button>}
            </div>
            <dl className="edu-rise mt-10 grid grid-cols-3 gap-4 sm:flex sm:gap-8" style={delay(320)}>
              {[{ value: "3", label: "dạng câu hỏi mới" }, { value: String(GRADE_LEVELS.length), label: "khối lớp & thi thử" }, { value: "24/7", label: "luyện theo nhịp riêng" }].map(({ value, label }) => (
                <div key={label} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <dt className="order-2 max-w-[6.5rem] text-sm leading-5 text-edu-muted">{label}</dt>
                  <dd className="font-display text-3xl font-extrabold text-edu-indigo">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* ── Topics marquee ── */}
      <div className="edu-marquee-mask relative border-y border-edu-line bg-edu-surface/60 py-5" aria-hidden="true">
        <div className="edu-marquee flex w-max gap-3">
          {[...TOPICS, ...TOPICS].map((t, i) => (
            <span key={i} className="flex items-center gap-2.5 whitespace-nowrap rounded-full border border-edu-line bg-white px-4 py-2 text-sm font-medium shadow-sm">
              <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-edu-indigo">{t.symbol}</span>{t.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Exam library ── */}
      <section id="kho-de" className="relative mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24" aria-labelledby="exam-library-title">
        <div data-reveal className="mb-8 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-edu-indigo"><span className="h-px w-8 bg-gradient-to-r from-indigo-500 to-violet-500" />Luyện tập theo mục tiêu</p>
            <h2 id="exam-library-title" className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Kho đề <span className="edu-gradient-text">dành cho bạn</span></h2>
          </div>
          <label className="group flex min-h-14 w-full items-center gap-3 rounded-2xl border border-edu-line bg-white px-5 shadow-[var(--shadow-edu)] transition focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-100 lg:max-w-sm">
            <Search size={20} aria-hidden="true" className="text-edu-muted transition-colors group-focus-within:text-edu-indigo" />
            <span className="sr-only">Tìm kiếm đề thi</span>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm theo tên đề thi…" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-edu-muted" />
          </label>
        </div>

        <nav data-reveal style={delay(80)} aria-label="Lọc theo khối lớp" className="mb-10 flex flex-wrap gap-2 rounded-[1.25rem] border border-edu-line bg-edu-surface p-1.5 sm:w-fit">
          {["Tất cả", ...GRADE_LEVELS].map(label => {
            const all = label === "Tất cả";
            const active = all ? !grade : grade === label;
            return (
              <Link
                key={label}
                href={all ? "/#kho-de" : `${gradeHref(label)}#kho-de`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-2xl px-5 text-sm font-semibold transition-all duration-300 sm:flex-none ${active ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30" : "text-edu-muted hover:bg-white hover:text-edu-ink hover:shadow-sm"}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mb-6 flex items-center justify-between gap-3">
          <h3 className="font-display text-xl font-bold">{filterLabel}</h3>
          {user && !loading && !error && <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-edu-indigo">{filtered.length} đề thi</span>}
        </div>

        {authLoading ? <Spinner /> : !user ? (
          <div data-reveal className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 px-6 py-14 text-center text-white shadow-[var(--shadow-edu-lift)] sm:py-16">
            <div aria-hidden="true" className="edu-dots absolute inset-0 opacity-50 mix-blend-overlay" />
            <span aria-hidden="true" className="edu-float absolute left-[8%] top-8 font-display text-6xl font-extrabold text-white/15">π</span>
            <span aria-hidden="true" className="edu-float-slow absolute bottom-6 right-[10%] font-display text-7xl font-extrabold text-white/15">∑</span>
            <span aria-hidden="true" className="edu-float-slow absolute right-[22%] top-6 font-display text-4xl font-extrabold text-white/10">√x</span>
            <span className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur"><BookOpenCheck size={28} aria-hidden="true" /></span>
            <h3 className="relative font-display text-3xl font-extrabold sm:text-4xl">Bài luyện tập đang chờ bạn</h3>
            <p className="relative mx-auto mt-3 max-w-md text-base leading-7 text-indigo-100">Đăng nhập bằng Google để xem đề thi, làm bài và lưu lại kết quả ôn tập của bạn.</p>
            <button onClick={login} className="relative mt-8 inline-flex min-h-14 items-center gap-2 rounded-2xl bg-white px-7 text-base font-semibold text-edu-indigo shadow-xl shadow-indigo-900/30 transition hover:-translate-y-0.5 hover:shadow-2xl">Đăng nhập bằng Google <ArrowRight size={18} aria-hidden="true" /></button>
          </div>
        ) : loading ? <Spinner /> : error ? (
          <div role="alert" className="rounded-3xl border border-danger-200 bg-danger-50 px-6 py-10 text-center">
            <p className="text-base font-semibold text-danger-700">{error}</p>
            <button onClick={() => window.location.reload()} className="mx-auto mt-5 flex min-h-12 items-center gap-2 rounded-xl border border-danger-200 bg-white px-5 text-sm font-semibold text-danger-700"><RotateCcw size={16} aria-hidden="true" />Tải lại trang</button>
          </div>
        ) : filtered.length === 0 ? <EmptyState filtered={!!grade || !!search} /> : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((exam, i) => <ExamCard key={exam.id} exam={exam} index={i} />)}</div>
        )}
      </section>

      {/* ── How it works ── */}
      <section className="relative bg-edu-surface" aria-labelledby="learning-path-title">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
          <div data-reveal className="mx-auto mb-14 max-w-2xl text-center">
            <p className="mb-3 text-sm font-semibold text-edu-indigo">Một vòng học khép kín</p>
            <h2 id="learning-path-title" className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Luyện, hiểu và <span className="edu-gradient-text">tiến bộ</span></h2>
            <p className="mt-4 text-base leading-7 text-edu-muted">Ba bước đơn giản giúp bạn luôn biết mình đang ở đâu và cần làm gì tiếp theo.</p>
          </div>
          <div className="relative">
          <div aria-hidden="true" className="absolute left-[16%] right-[16%] top-[3.75rem] hidden h-0.5 bg-gradient-to-r from-sky-300 via-violet-300 to-emerald-300 md:block" />
          <ol className="relative grid gap-6 md:grid-cols-3">
            {[
              { Icon: Target, gradient: "from-sky-400 to-indigo-500", shadow: "shadow-indigo-500/30", title: "Chọn đúng mục tiêu", text: "Lọc theo khối lớp và dạng đề để bắt đầu từ phần kiến thức bạn cần nhất." },
              { Icon: Clock3, gradient: "from-violet-500 to-fuchsia-500", shadow: "shadow-violet-500/30", title: "Làm bài tập trung", text: "Đồng hồ, tiến độ và bảng câu hỏi rõ ràng, không xao nhãng khi làm bài." },
              { Icon: TrendingUp, gradient: "from-emerald-400 to-teal-500", shadow: "shadow-emerald-500/30", title: "Xem lại và củng cố", text: "Đọc lời giải từng bước, nhận ra lỗi sai và luyện lại đúng chỗ còn yếu." },
            ].map(({ Icon, gradient, shadow, title, text }, i) => (
              <li key={title} data-reveal style={delay(i * 120)} onPointerMove={trackSpotlight} className="edu-card rounded-3xl p-7 text-center">
                <div className="relative z-[3]">
                  <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ring-8 ring-edu-surface ${gradient} ${shadow}`}><Icon size={26} aria-hidden="true" /></span>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-edu-muted">Bước {i + 1}</p>
                  <h3 className="mt-1 font-display text-xl font-bold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-edu-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
          </div>
        </div>
      </section>
    </div>
  );
}
