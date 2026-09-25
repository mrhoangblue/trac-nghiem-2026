"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BookOpen, Check, ChevronRight, GraduationCap, Search, Shapes, FileText, RotateCcw } from "lucide-react";
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
    <article className="exam-card group flex flex-col rounded-3xl bg-white p-6 transition-all duration-200">
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
        <div className="mx-auto grid max-w-6xl items-center gap-5 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[.15em] text-brand-800"><span className="h-1.5 w-1.5 rounded-full bg-sunset" />Không gian ôn tập Toán THPT</span>
            <h1 className="text-4xl font-extrabold leading-[1.22] tracking-tight text-brand-900 sm:text-5xl">Vững kiến thức.<br /><span className="text-brand-600">Tự tin mỗi bài thi.</span></h1>
            <p className="mt-5 max-w-lg text-sm leading-8 text-gray-600 sm:text-base">Luyện tập theo từng lớp, thử sức với đề thi và xem lại lời giải. Bắt đầu từ một bài Toán hôm nay.</p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <a href="#kho-de" className="sunset-button inline-flex items-center gap-3 rounded-2xl px-6 py-3.5 text-lg font-bold transition">Khám phá đề thi <ArrowRight size={19} /></a>
              {user ? <Link href="/student/history" className="inline-flex items-center gap-2 rounded-xl py-3 text-sm font-semibold text-earth">Lịch sử làm bài <ChevronRight size={16} /></Link> : <button onClick={login} className="rounded-xl py-3 text-sm font-semibold text-earth">Đăng nhập để bắt đầu <span aria-hidden="true">↗</span></button>}
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-xs text-gray-600">{["Trắc nghiệm", "Đúng / Sai", "Trả lời ngắn"].map(label => <span key={label} className="inline-flex items-center gap-1.5"><Check size={14} className="text-brand-700" />{label}</span>)}</div>
          </div>
          <TeacherPortrait />
        </div>
      </section>

      <section id="kho-de" className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-14" aria-labelledby="exam-library-title">
        <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-brand-700">Học chắc từ những điều cơ bản</p><h2 id="exam-library-title" className="text-2xl font-bold text-brand-900 sm:text-3xl">Kho đề dành cho bạn</h2></div>
          <label className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-500 lg:max-w-xs"><Search size={18} /><span className="sr-only">Tìm kiếm đề thi</span><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm theo tên đề thi…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
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
      </section>

      <section className="mx-auto mb-12 grid w-full max-w-6xl gap-5 px-5 sm:grid-cols-3 sm:px-8" aria-label="Cách ôn tập">
        {[{ Icon: BookOpen, title: "Chọn bài phù hợp", text: "Tìm đề theo khối lớp và nội dung bạn muốn ôn tập." }, { Icon: Shapes, title: "Tập trung làm bài", text: "Đọc kỹ đề, vận dụng kiến thức và hoàn thành từng câu." }, { Icon: GraduationCap, title: "Hiểu từ lời giải", text: "Xem lại bài làm để nhận ra phần kiến thức cần củng cố." }].map(({ Icon, title, text }, index) => <div key={title} className="flex gap-4 border-t border-gray-200 pt-6"><Icon size={23} className="mt-1 shrink-0 text-brand-700" /><div><p className="mb-2 text-sm font-bold text-brand-900"><span className="mr-2 text-brand-600">0{index + 1}.</span>{title}</p><p className="text-xs leading-6 text-gray-500">{text}</p></div></div>)}
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
