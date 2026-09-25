import Link from "next/link";
import { ArrowUpRight, Mail, Phone } from "lucide-react";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-200 bg-[#F5F1E8]">
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-8 px-5 py-10 sm:px-8 lg:flex-row">
        <div className="max-w-lg">
          <Link href="/" className="inline-flex items-center gap-3 text-earth">
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl bg-earth font-serif text-xl text-white">∑</span>
            <span className="text-sm font-extrabold tracking-wide">TOÁN THPT</span>
          </Link>
          <p className="mt-4 text-sm font-semibold text-gray-700">Học chắc hôm nay, tự tin ngày mai.</p>
          <p className="mt-2 text-xs leading-6 text-gray-500">Phát triển bởi Thầy Hoàng Blue · Giáo viên Trường TH, THCS – THPT Hoàng Gia (Royal School).</p>
        </div>
        <div>
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[.15em] text-earth">Liên hệ & góp ý</p>
          <a href="mailto:mrhoangblue@gmail.com" className="mb-3 flex items-center gap-2 text-xs text-gray-700 hover:text-earth"><Mail size={15} />mrhoangblue@gmail.com<ArrowUpRight size={13} /></a>
          <a href="tel:0962543567" className="flex items-center gap-2 text-xs text-gray-700 hover:text-earth"><Phone size={15} />0962 543 567</a>
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 border-t border-gray-200 px-5 py-5 text-[11px] text-gray-500 sm:px-8"><span>© 2026 Thầy Hoàng Blue. Trang web lưu hành nội bộ.</span><span>Ôn tập Toán · Dành cho học sinh THPT</span></div>
    </footer>
  );
}
