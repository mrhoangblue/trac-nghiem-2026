"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Clock3, GraduationCap, UserRound } from "lucide-react";
import JoinClassSection from "@/components/classroom/JoinClassSection";
import FindTeacherSection from "@/components/classroom/FindTeacherSection";
import { useAuth } from "@/lib/AuthContext";

interface MembershipClass {
  id: string;
  name: string;
  description: string;
  teacherName: string;
  studentCount: number;
  isActive: boolean;
  status: "pending" | "active" | "suspended" | "rejected";
  requestedAt: string | null;
}

const CARD_THEMES = [
  "from-[#9f4f22] to-[#c87532]",
  "from-[#235d66] to-[#398592]",
  "from-[#5b547d] to-[#8179a7]",
  "from-[#68733b] to-[#929b56]",
];

function Spinner() {
  return <div className="mx-auto my-14 h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />;
}

export default function StudentClassesPage() {
  const { user, loading: authLoading } = useAuth();
  const [memberships, setMemberships] = useState<MembershipClass[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchMemberships = useCallback(async () => {
    if (!user) return;
    setClassesLoading(true);
    setLoadError(false);
    try {
      const response = await fetch("/api/classes/memberships", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      if (!response.ok) throw new Error("Could not load memberships");
      const payload = (await response.json()) as { memberships?: MembershipClass[] };
      setMemberships(payload.memberships ?? []);
    } catch (error) {
      console.error("Failed to fetch classes:", error);
      setLoadError(true);
    } finally {
      setClassesLoading(false);
    }
  }, [user]);

  useEffect(() => {
    queueMicrotask(() => void fetchMemberships());
  }, [fetchMemberships]);

  if (authLoading) return <Spinner />;
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h2 className="text-2xl font-extrabold text-gray-800">Cần đăng nhập</h2>
        <p className="mt-3 text-gray-500">Vui lòng đăng nhập để xem lớp học của bạn.</p>
        <Link href="/" className="mt-7 inline-flex rounded-xl bg-brand-600 px-8 py-3 font-bold text-white">Về trang chủ</Link>
      </div>
    );
  }

  const activeClasses = memberships.filter((item) => item.status === "active" && item.isActive);
  const pendingClasses = memberships.filter((item) => item.status === "pending");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-9 px-4 py-8 sm:py-10">
      <header className="relative overflow-hidden rounded-[2rem] bg-[#2f241d] px-6 py-8 text-white shadow-xl sm:px-9">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#d58a50]/25 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#efc49f]">Không gian học tập</p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">Lớp học của tôi</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">Theo dõi lớp đang học, giáo viên phụ trách và các yêu cầu đang chờ duyệt.</p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur"><strong className="text-xl">{activeClasses.length}</strong><span className="ml-2 text-xs text-white/65">đang học</span></div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur"><strong className="text-xl">{pendingClasses.length}</strong><span className="ml-2 text-xs text-white/65">chờ duyệt</span></div>
          </div>
        </div>
      </header>

      {pendingClasses.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-2"><Clock3 className="h-5 w-5 text-amber-600" /><h2 className="text-lg font-extrabold text-gray-900">Đang chờ giáo viên duyệt</h2></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingClasses.map((cls) => (
              <article key={cls.id} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">Chờ duyệt</span>
                <h3 className="mt-3 font-extrabold text-gray-900">{cls.name}</h3>
                <p className="mt-2 flex items-center gap-2 text-sm text-gray-600"><UserRound className="h-4 w-4" />GV: {cls.teacherName}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center gap-2"><BookOpen className="h-5 w-5 text-brand-700" /><h2 className="text-lg font-extrabold text-gray-900">Lớp đang tham gia</h2></div>
        {classesLoading ? <Spinner /> : loadError ? (
          <div className="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-sm text-danger-700">Không thể tải danh sách lớp. Vui lòng thử lại.</div>
        ) : activeClasses.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-200 bg-white py-14 text-center">
            <GraduationCap className="mx-auto h-12 w-12 text-brand-400" />
            <p className="mt-4 text-lg font-bold text-gray-800">Chưa có lớp đã được duyệt</p>
            <p className="mt-1 text-sm text-gray-500">Gửi mã lớp bên dưới và chờ giáo viên xác nhận.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {activeClasses.map((cls, index) => (
              <Link key={cls.id} href={`/student/classes/${cls.id}`} className="group overflow-hidden rounded-[1.6rem] border border-gray-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                <div className={`relative min-h-32 bg-gradient-to-br ${CARD_THEMES[index % CARD_THEMES.length]} p-5 text-white`}>
                  <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full border-[18px] border-white/10" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/65">Lớp học</p>
                  <h3 className="mt-3 line-clamp-2 text-xl font-black leading-snug">{cls.name}</h3>
                </div>
                <div className="p-5">
                  <p className="flex items-center gap-2 text-sm font-bold text-gray-800"><UserRound className="h-4 w-4 text-brand-600" />Giáo viên: {cls.teacherName}</p>
                  <div className="mt-5 flex items-center justify-between text-xs text-gray-500"><span>{cls.studentCount} học sinh</span><span className="flex items-center gap-1 font-bold text-brand-700">Vào lớp <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center gap-4"><div className="h-px flex-1 bg-gray-200" /><span className="text-xs font-extrabold uppercase tracking-[0.18em] text-gray-400">Tham gia lớp mới</span><div className="h-px flex-1 bg-gray-200" /></div>
      <div className="grid gap-5 md:grid-cols-2">
        <JoinClassSection user={user} onRequested={fetchMemberships} />
        <FindTeacherSection />
      </div>
    </div>
  );
}
