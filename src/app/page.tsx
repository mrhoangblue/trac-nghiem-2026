"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BookOpen, ChevronRight, GraduationCap, Search, Shapes, FileText, RotateCcw } from "lucide-react";
import { GRADE_LEVELS } from "@/components/Sidebar";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";

interface Exam {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  gradeLevel?: string;
  examType?: string;
  coverImageUrl?: string;
  /** "all" = mọi học sinh; "classes" = chỉ HS thuộc targetClassIds. Mặc định "all". */
  targetType?: "all" | "classes";
  targetClassIds?: string[];
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
        <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-gray-500 font-medium animate-pulse">Đang tải danh sách bài thi…</p>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
      <div className="w-20 h-20 bg-brand-50 rounded-2xl flex items-center justify-center text-4xl shadow-sm">
        📭
      </div>
      <h2 className="text-xl font-bold text-gray-800">
        {filtered ? "Không có đề thi nào trong mục này" : "Chưa có bài thi nào"}
      </h2>
      {filtered && (
        <Link href="/" className="text-sm text-brand-600 hover:underline font-medium">
          ← Xem tất cả đề thi
        </Link>
      )}
    </div>
  );
}

// ── Exam Card ─────────────────────────────────────────────────────────────────

function ExamCard({ exam }: { exam: Exam }) {
  return (
    <article className="exam-card group flex flex-col overflow-hidden rounded-3xl bg-white transition-all duration-200">
      {exam.coverImageUrl && (
        <div className="relative aspect-[16/7] overflow-hidden bg-brand-50">
          <Image src={exam.coverImageUrl} alt={`Ảnh minh họa ${exam.title}`} fill unoptimized sizes="(max-width: 768px) 100vw, 33vw" className="object-cover transition duration-300 group-hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-earth"><FileText size={23} /></span>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">{exam.gradeLevel || "Môn Toán"}</span>
      </div>
      <p className="mb-2 text-xs font-semibold text-brand-700">{exam.examType || "Đề ôn tập"}</p>
      <h3 className="mb-3 text-lg font-bold leading-relaxed text-gray-900">{exam.title}</h3>
      <p className="mb-6 line-clamp-2 text-sm leading-7 text-gray-500">{exam.description || "Đọc kỹ câu hỏi và chọn đáp án phù hợp để hoàn thành bài ôn tập."}</p>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-gray-100 pt-5">
        <span className="text-xs font-medium text-gray-500">{exam.questionCount ?? 0} câu hỏi</span>
        <Link href={`/quiz/${exam.id}`} className="inline-flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand-800 transition hover:bg-brand-100">
          Làm bài <ArrowRight size={16} />
        </Link>
      </div>
      </div>
    </article>
  );
}

function TeacherPortrait() {
  return (
    <div className="relative mx-auto w-full max-w-[25rem] px-7 py-8 sm:px-8" aria-label="Thầy Hoàng Blue">
      <div className="absolute inset-x-10 bottom-10 top-12 rotate-[-5deg] rounded-[2.75rem] border-[10px] border-white bg-brand-100 shadow-soft" />
      <div className="absolute right-1 top-4 h-24 w-24 rounded-full border border-brand-200 bg-brand-50/80" />
      <div className="absolute right-5 top-8 h-14 w-14 rounded-full border border-white bg-sunset/15" />

      <div className="relative ml-auto aspect-[4/5] w-[92%] rotate-[1.5deg] overflow-hidden rounded-[2.5rem] border-[10px] border-white bg-white shadow-lift">
        <Image
          src="/thay-hoang-blue-portrait.png"
          alt="Thầy Hoàng Blue"
          fill
          sizes="(max-width: 640px) 82vw, (max-width: 1024px) 390px, 380px"
          className="object-cover object-[center_18%]"
          priority
        />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-brand-950/75 via-brand-900/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-brand-100">Giáo viên đồng hành</p>
          <p className="mt-1 text-lg font-extrabold">Thầy Hoàng Blue</p>
        </div>
      </div>

      <div className="absolute bottom-3 left-0 rotate-[-4deg] rounded-2xl border-4 border-white bg-earth px-4 py-3 text-white shadow-soft">
        <span className="font-serif text-xl">∑</span>
        <span className="ml-2 text-[11px] font-bold">Hiểu bản chất</span>
      </div>
      <div className="absolute right-0 top-24 rotate-[5deg] rounded-2xl border-4 border-white bg-white px-4 py-2.5 shadow-soft">
        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700">Toán THPT</span>
        <span className="ml-2 text-sunset">✦</span>
      </div>
    </div>
  );
}

// ── Home content (reads search params) ───────────────────────────────────────

function HomeContent() {
  const searchParams = useSearchParams();
  const grade = searchParams.get("grade");
  const type = searchParams.get("type");

  const { user, isMod, login } = useAuth();
  const [search, setSearch] = useState("");

  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Tập classId mà học sinh hiện tại đang tham gia. null = chưa tải xong.
  const [myClassIds, setMyClassIds] = useState<string[] | null>(null);

  useEffect(() => {
    const fetchExams = async () => {
      try {
        const snapshot = await getDocs(collection(db, "exams"));
        const data = snapshot.docs.map((d: QueryDocumentSnapshot<DocumentData>) => {
          const raw = d.data();
          return {
            id: d.id,
            title: raw.title ?? "Bài thi không có tên",
            description: raw.description ?? "",
            questionCount: Array.isArray(raw.questions)
              ? raw.questions.length
              : (raw.questionCount ?? 0),
            gradeLevel: raw.gradeLevel ?? undefined,
            examType: raw.examType ?? undefined,
            coverImageUrl: raw.coverImageUrl ?? undefined,
            targetType: raw.targetType ?? "all",
            targetClassIds: Array.isArray(raw.targetClassIds) ? raw.targetClassIds : [],
          } as Exam;
        });
        setExams(data);
      } catch (err) {
        console.error("Lỗi khi tải danh sách bài thi:", err);
        setError("Không thể tải dữ liệu. Vui lòng thử lại sau.");
      } finally {
        setLoading(false);
      }
    };
    if (user) fetchExams();
  }, [user]);

  // Tải danh sách lớp học sinh đang tham gia — để lọc đề giao riêng cho lớp.
  // admin/mod và người chưa đăng nhập không cần tải: filter coi myClassIds=null như [].
  useEffect(() => {
    if (isMod || !user?.uid) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "classes"), where("studentIds", "array-contains", user.uid))
        );
        if (!cancelled) setMyClassIds(snap.docs.map((d) => d.id));
      } catch (err) {
        console.error("Lỗi tải lớp của học sinh:", err);
        if (!cancelled) setMyClassIds([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, isMod]);

  // Đề "giao cho lớp" chỉ hiện với HS thuộc lớp đó (admin/mod thấy tất cả).
  const visibleToUser = (e: Exam): boolean => {
    if (isMod) return true;
    if (e.targetType !== "classes") return true; // "all" hoặc legacy → mọi người
    const targets = e.targetClassIds ?? [];
    if (targets.length === 0) return true; // cấu hình lớp nhưng chưa chọn lớp nào
    const mine = myClassIds ?? [];
    return targets.some((id) => mine.includes(id));
  };

  const filtered = exams.filter((e) => {
    if (!visibleToUser(e)) return false;
    if (search.trim() && !e.title.toLocaleLowerCase("vi").includes(search.trim().toLocaleLowerCase("vi"))) return false;
    if (grade && e.gradeLevel !== grade) return false;
    if (type && e.examType !== type) return false;
    return true;
  });

  const filterLabel = grade ? `${grade}${type ? ` · ${type}` : ""}` : "Tất cả đề thi";

  return (
    <div className="w-full">
      <section className="home-hero border-b border-gray-200">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1.12fr_.88fr] lg:py-20">
          <div>
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[.15em] text-brand-800 shadow-sm"><span className="h-1.5 w-1.5 rounded-full bg-sunset" />Học đúng trọng tâm · Tiến bộ mỗi ngày</span>
            <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.18] tracking-tight text-brand-950 sm:text-5xl lg:text-[3.4rem]">Học Toán có lộ trình.<br /><span className="text-brand-600">Tiến bộ nhìn thấy được.</span></h1>
            <p className="mt-5 max-w-xl text-sm leading-8 text-gray-600 sm:text-base">Học theo lớp, luyện đúng dạng bài và xem lại lời giải sau mỗi lần làm. Mỗi kết quả đều giúp bạn biết bước tiếp theo cần cải thiện.</p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <a href="#kho-de" className="sunset-button inline-flex items-center gap-3 rounded-2xl px-6 py-3.5 text-base font-bold transition">Chọn đề để luyện <ArrowRight size={19} /></a>
              {user ? <Link href="/student/history" className="inline-flex items-center gap-2 rounded-xl px-2 py-3 text-sm font-semibold text-earth">Xem tiến bộ của tôi <ChevronRight size={16} /></Link> : <button onClick={login} className="rounded-xl px-2 py-3 text-sm font-semibold text-earth">Đăng nhập để bắt đầu <span aria-hidden="true">↗</span></button>}
            </div>
            <div className="mt-9 grid max-w-xl grid-cols-3 divide-x divide-brand-200 rounded-2xl border border-brand-200 bg-white/65 px-2 py-4 shadow-sm backdrop-blur">
              {[{ value: "3", label: "dạng câu hỏi" }, { value: "24/7", label: "học theo nhịp riêng" }, { value: "1", label: "lộ trình rõ ràng" }].map(({ value, label }) => <div key={label} className="px-3 text-center"><p className="text-lg font-extrabold text-brand-800">{value}</p><p className="mt-1 text-[10px] leading-4 text-gray-500 sm:text-xs">{label}</p></div>)}
            </div>
          </div>
          <TeacherPortrait />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16" aria-labelledby="learning-path-title">
        <div className="mx-auto mb-9 max-w-2xl text-center">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[.2em] text-brand-700">Một quy trình học dễ theo dõi</p>
          <h2 id="learning-path-title" className="text-2xl font-extrabold text-brand-950 sm:text-3xl">Từ luyện tập đến tiến bộ, trong ba bước</h2>
          <p className="mt-3 text-sm leading-7 text-gray-500">Giao diện được tổ chức để học sinh luôn biết mình đang ở đâu và cần làm gì tiếp theo.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[{ Icon: BookOpen, number: "01", title: "Chọn nội dung phù hợp", text: "Lọc theo khối lớp và dạng đề để bắt đầu đúng phần kiến thức cần ôn." }, { Icon: Shapes, number: "02", title: "Làm bài tập trung", text: "Theo dõi thời gian, tiến độ và chuyển câu rõ ràng trong một không gian ít xao nhãng." }, { Icon: GraduationCap, number: "03", title: "Xem lại và củng cố", text: "Đọc lời giải, nhận ra phần còn yếu và tiếp tục luyện tập có mục tiêu." }].map(({ Icon, number, title, text }) => <article key={title} className="group rounded-3xl border border-gray-200 bg-white p-6 shadow-soft transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-lift"><div className="flex items-center justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><Icon size={23} /></span><span className="font-mono text-sm font-bold text-brand-300">{number}</span></div><h3 className="mt-5 text-base font-extrabold text-brand-950">{title}</h3><p className="mt-3 text-sm leading-7 text-gray-500">{text}</p></article>)}
        </div>
      </section>

      <section id="kho-de" className="border-y border-gray-200 bg-white/55" aria-labelledby="exam-library-title">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-brand-700">Luyện tập theo mục tiêu</p><h2 id="exam-library-title" className="text-2xl font-extrabold text-brand-950 sm:text-3xl">Kho đề dành cho bạn</h2><p className="mt-2 text-sm text-gray-500">Chọn khối lớp hoặc tìm nhanh theo tên đề.</p></div>
          <label className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-gray-500 shadow-sm transition focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100 lg:max-w-sm"><Search size={18} /><span className="sr-only">Tìm kiếm đề thi</span><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm theo tên đề thi…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
        </div>
        <nav aria-label="Lọc theo khối lớp" className="mb-8 flex flex-wrap gap-2">
          {["Tất cả", ...GRADE_LEVELS].map(label => {
            const active = label === "Tất cả" ? !grade : grade === label;
            return <Link key={label} href={label === "Tất cả" ? "/#kho-de" : `/?grade=${encodeURIComponent(label)}#kho-de`} aria-current={active ? "page" : undefined} className={`rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${active ? "border-earth bg-earth text-white shadow-soft" : "border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:text-earth"}`}>{label}</Link>;
          })}
        </nav>
        <div className="mb-5 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-gray-700">{filterLabel}</h3>{user && !loading && !error && <span className="text-xs text-gray-500">{filtered.length} đề thi</span>}</div>
        {!user ? (
          <div className="rounded-3xl border border-gray-200 bg-white px-6 py-10 text-center shadow-soft">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-earth"><BookOpen size={25} /></span>
            <h3 className="text-xl font-bold text-brand-900">Bài luyện tập đang chờ bạn</h3>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-gray-500">Đăng nhập bằng Google để xem đề thi, làm bài và lưu lại kết quả ôn tập của bạn.</p>
            <button onClick={login} className="mt-6 rounded-xl bg-earth px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-900">Đăng nhập bằng Google</button>
          </div>
        ) : loading ? <Spinner /> : error ? (
          <div role="alert" className="rounded-3xl border border-danger-200 bg-danger-50 px-6 py-10 text-center"><p className="text-sm text-danger-700">{error}</p><button onClick={() => window.location.reload()} className="mx-auto mt-4 flex items-center gap-2 rounded-xl border border-danger-200 px-4 py-2 text-sm font-semibold text-danger-700"><RotateCcw size={15} />Tải lại trang</button></div>
        ) : filtered.length === 0 ? <EmptyState filtered={!!grade || !!search} /> : <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(exam => <ExamCard key={exam.id} exam={exam} />)}</div>}
        </div>
      </section>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
