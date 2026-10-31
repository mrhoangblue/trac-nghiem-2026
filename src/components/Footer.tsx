import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, BookOpen, GraduationCap, History, Mail, Phone } from "lucide-react";

export default function Footer() {
  return (
    <footer className="relative mt-auto overflow-hidden bg-[#0B0F2E] text-white">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-indigo-600/25 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 right-0 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />

      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_.8fr_1fr] md:py-16">
        <div className="max-w-md">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="relative h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-400 via-violet-400 to-sky-300 p-[2px]">
              <span className="relative block h-full w-full overflow-hidden rounded-[14px] bg-white">
                <Image src="/thay-hoang-blue-avatar.png" alt="Thầy Hoàng Blue" fill sizes="48px" className="translate-y-2 scale-[1.4] object-contain" />
              </span>
            </span>
            <span>
              <span className="block font-display text-lg font-extrabold tracking-tight">Học Toán THPT</span>
              <span className="mt-0.5 block text-xs text-indigo-200/70">cùng Thầy Hoàng Blue</span>
            </span>
          </Link>
          <p className="mt-6 font-display text-xl font-bold">
            Học chắc hôm nay, <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-sky-300 bg-clip-text text-transparent">tự tin ngày mai.</span>
          </p>
          <p className="mt-2 text-sm leading-6 text-indigo-100/60">Không gian học tập, luyện đề và theo dõi tiến bộ dành cho học sinh THPT.</p>
        </div>

        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-indigo-300">Khám phá</p>
          <nav className="space-y-1 text-sm text-indigo-100/75" aria-label="Liên kết cuối trang">
            {[
              { href: "/#kho-de", Icon: BookOpen, label: "Kho đề luyện tập" },
              { href: "/student/classes", Icon: GraduationCap, label: "Lớp học của tôi" },
              { href: "/student/history", Icon: History, label: "Lịch sử làm bài" },
            ].map(({ href, Icon, label }) => (
              <Link key={href} href={href} className="group flex min-h-10 items-center gap-3 transition hover:text-white">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10 transition group-hover:bg-indigo-500/30"><Icon size={15} aria-hidden="true" /></span>
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-indigo-300">Liên hệ & góp ý</p>
          <div className="space-y-1 text-sm text-indigo-100/75">
            <a href="mailto:mrhoangblue@gmail.com" className="group flex min-h-10 items-center gap-3 transition hover:text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10 transition group-hover:bg-indigo-500/30"><Mail size={15} aria-hidden="true" /></span>
              mrhoangblue@gmail.com<ArrowUpRight size={13} aria-hidden="true" className="opacity-60" />
            </a>
            <a href="tel:0962543567" className="group flex min-h-10 items-center gap-3 transition hover:text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10 transition group-hover:bg-indigo-500/30"><Phone size={15} aria-hidden="true" /></span>
              0962 543 567
            </a>
          </div>
        </div>
      </div>
      <div className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-indigo-100/50 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© 2026 Thầy Hoàng Blue. Trang web lưu hành nội bộ.</span>
          <span>Ôn tập Toán · Luyện đề · Theo dõi tiến bộ</span>
        </div>
      </div>
    </footer>
  );
}
