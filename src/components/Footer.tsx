import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, BookOpen, GraduationCap, Mail, MapPin, Phone } from "lucide-react";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-brand-200 bg-brand-950 text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.4fr_.8fr_1fr] md:py-14">
        <div className="max-w-md">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl border-2 border-white/80 bg-white shadow-soft">
              <Image src="/thay-hoang-blue-avatar.png" alt="Thầy Hoàng Blue" fill sizes="48px" className="scale-[1.4] translate-y-2 object-contain" />
            </span>
            <span>
              <span className="block text-sm font-extrabold uppercase tracking-[.12em] text-brand-100">Học Toán THPT</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[.1em] text-white/60">Cùng Thầy Hoàng Blue</span>
            </span>
          </Link>
          <p className="mt-5 text-base font-semibold text-white">Học chắc hôm nay, tự tin ngày mai.</p>
          <p className="mt-2 text-xs leading-6 text-white/60">Không gian học tập, luyện đề và theo dõi tiến bộ dành cho học sinh THPT.</p>
        </div>

        <div>
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[.18em] text-brand-300">Khám phá</p>
          <nav className="space-y-3 text-sm text-white/70" aria-label="Liên kết cuối trang">
            <Link href="/#kho-de" className="flex items-center gap-2.5 transition hover:text-white"><BookOpen size={16} />Kho đề luyện tập</Link>
            <Link href="/student/classes" className="flex items-center gap-2.5 transition hover:text-white"><GraduationCap size={16} />Lớp học của tôi</Link>
            <Link href="/student/history" className="flex items-center gap-2.5 transition hover:text-white"><span aria-hidden="true" className="w-4 text-center">↻</span>Lịch sử làm bài</Link>
          </nav>
        </div>

        <div>
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[.18em] text-brand-300">Liên hệ & góp ý</p>
          <div className="space-y-3 text-sm text-white/70">
            <a href="mailto:mrhoangblue@gmail.com" className="flex items-center gap-2.5 transition hover:text-white"><Mail size={16} />mrhoangblue@gmail.com<ArrowUpRight size={13} /></a>
            <a href="tel:0962543567" className="flex items-center gap-2.5 transition hover:text-white"><Phone size={16} />0962 543 567</a>
            <p className="flex items-start gap-2.5 leading-6"><MapPin size={16} className="mt-1 shrink-0" />Trường TH, THCS – THPT Hoàng Gia (Royal School)</p>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-5 text-[11px] text-white/45 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© 2026 Thầy Hoàng Blue. Trang web lưu hành nội bộ.</span>
          <span>Ôn tập Toán · Luyện đề · Theo dõi tiến bộ</span>
        </div>
      </div>
    </footer>
  );
}
