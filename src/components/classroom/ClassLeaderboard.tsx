"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, CheckCircle2, Clock3, RefreshCw, Sparkles, Trophy } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import type { ClassLeaderboardStudent, ClassLeaderboardView } from "@/utils/classroomTypes";

type BoardKey = "completion" | "score" | "studyTime";

const BOARD_META: Record<BoardKey, {
  title: string;
  description: string;
  accent: string;
  icon: typeof Trophy;
  value: (student: ClassLeaderboardStudent) => string;
  detail: (student: ClassLeaderboardStudent) => string;
}> = {
  completion: {
    title: "Hoàn thành nhiều nhất",
    description: "Số đề khác nhau đã hoàn thành",
    accent: "from-emerald-500 to-teal-600",
    icon: CheckCircle2,
    value: (student) => `${student.completedExamCount} đề`,
    detail: (student) => `${student.attemptCount} lượt nộp hợp lệ`,
  },
  score: {
    title: "Điểm số nổi bật",
    description: "Điểm tốt nhất trung bình mỗi đề",
    accent: "from-amber-400 to-orange-600",
    icon: Award,
    value: (student) => `${student.bestScoreAverage.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}/10`,
    detail: (student) => `Đã hoàn thành ${student.completedExamCount} đề`,
  },
  studyTime: {
    title: "Thời gian làm bài",
    description: "Tổng thời gian của các lượt đã nộp",
    accent: "from-sky-500 to-indigo-600",
    icon: Clock3,
    value: (student) => formatDuration(student.totalExamSeconds),
    detail: (student) => `${student.attemptCount} lượt làm bài`,
  },
};

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} giờ ${remainingMinutes} phút` : `${hours} giờ`;
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(-2).map((part) => part[0] ?? "").join("").toUpperCase() || "HS";
}

function RankingRow({
  student,
  rank,
  board,
  current,
}: {
  student: ClassLeaderboardStudent;
  rank: number;
  board: BoardKey;
  current: boolean;
}) {
  const meta = BOARD_META[board];
  const medalClasses = rank === 1
    ? "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-amber-200"
    : rank === 2
      ? "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800 shadow-slate-200"
      : rank === 3
        ? "bg-gradient-to-br from-orange-300 to-orange-500 text-orange-950 shadow-orange-200"
        : "bg-gray-100 text-gray-500";

  return (
    <li className={`flex items-start gap-3 rounded-2xl px-3 py-3 transition ${current ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-gray-50"}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black shadow-sm ${medalClasses}`} aria-label={`Hạng ${rank}`}>
        {rank}
      </span>
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-xs font-black text-brand-800 ring-2 ring-white">
        {student.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={student.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : initials(student.fullName)}
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="break-words text-sm font-extrabold leading-5 text-gray-900">{student.fullName}</span>
          {current && <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Bạn</span>}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-gray-500">{meta.detail(student)}</span>
      </span>
      <strong className="shrink-0 pt-1 text-right text-sm font-black text-gray-900">{meta.value(student)}</strong>
    </li>
  );
}

function RankingBoard({ board, data }: { board: BoardKey; data: ClassLeaderboardView }) {
  const [expanded, setExpanded] = useState(false);
  const meta = BOARD_META[board];
  const Icon = meta.icon;
  const rows = data[board];
  const visible = expanded ? rows : rows.slice(0, 10);
  const currentIndex = data.viewerStudentId
    ? rows.findIndex((student) => student.studentId === data.viewerStudentId)
    : -1;
  const currentOutsideTop = !expanded && currentIndex >= 10 ? rows[currentIndex] : null;

  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-[0_16px_45px_-30px_rgba(74,39,19,0.45)]">
      <header className={`bg-gradient-to-br ${meta.accent} p-5 text-white`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold">{meta.title}</h3>
            <p className="mt-1 text-xs font-medium text-white/80">{meta.description}</p>
          </div>
          <span className="rounded-2xl bg-white/15 p-2.5 ring-1 ring-white/25"><Icon className="h-5 w-5" /></span>
        </div>
      </header>
      {rows.length ? (
        <div className="p-2.5">
          <ol className="space-y-1">
            {visible.map((student, index) => (
              <RankingRow key={student.studentId} student={student} rank={index + 1} board={board} current={student.studentId === data.viewerStudentId} />
            ))}
          </ol>
          {currentOutsideTop && (
            <div className="mt-2 border-t border-dashed border-gray-200 pt-2">
              <RankingRow student={currentOutsideTop} rank={currentIndex + 1} board={board} current />
            </div>
          )}
          {rows.length > 10 && (
            <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-2 w-full rounded-xl py-2 text-xs font-bold text-brand-700 hover:bg-brand-50">
              {expanded ? "Thu gọn còn 10 học sinh" : `Xem thêm ${rows.length - 10} học sinh`}
            </button>
          )}
        </div>
      ) : (
        <div className="px-5 py-9 text-center">
          <p className="text-sm font-bold text-gray-600">Chưa có dữ liệu xếp hạng</p>
          <p className="mt-1 text-xs leading-5 text-gray-400">Bảng sẽ cập nhật sau khi học sinh nộp bài đầu tiên.</p>
        </div>
      )}
    </article>
  );
}

export default function ClassLeaderboard({ classId }: { classId: string }) {
  const { user } = useAuth();
  const [data, setData] = useState<ClassLeaderboardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/classes/${encodeURIComponent(classId)}/leaderboard`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json() as ClassLeaderboardView & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "LOAD_FAILED");
      setData(payload);
    } catch (loadError) {
      console.error(loadError);
      setError("Không thể tải bảng xếp hạng. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }, [classId, user]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const participation = useMemo(() => {
    if (!data?.studentCount) return 0;
    return Math.round((data.participatingStudentCount / data.studentCount) * 100);
  }, [data]);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-brand-200 bg-[linear-gradient(145deg,#fffdf8_0%,#fff8e7_52%,#fff_100%)] shadow-[0_24px_70px_-45px_rgba(95,48,17,0.55)]" aria-labelledby="class-leaderboard-title">
      <div className="relative border-b border-brand-100 px-5 py-6 sm:px-7">
        <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-brand-200/30 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-brand-700 p-3 text-white shadow-lg shadow-brand-200"><Trophy className="h-6 w-6" /></span>
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-brand-700"><Sparkles className="h-3.5 w-3.5" /> Thành tích lớp học</p>
              <h2 id="class-leaderboard-title" className="mt-1 text-2xl font-black text-gray-950">Bảng xếp hạng học sinh</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">Ghi nhận mức độ hoàn thành, kết quả tốt nhất và thời gian học tập từ các bài thi được giao cho lớp.</p>
            </div>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-white px-3.5 py-2 text-xs font-bold text-brand-800 shadow-sm hover:bg-brand-50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Cập nhật
          </button>
        </div>
        {data && (
          <div className="relative mt-5 grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-brand-100"><strong className="block text-xl text-gray-950">{data.assignedExamCount}</strong><span className="text-xs text-gray-500">bài thi được giao</span></div>
            <div className="rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-brand-100"><strong className="block text-xl text-gray-950">{data.participatingStudentCount}/{data.studentCount}</strong><span className="text-xs text-gray-500">học sinh đã làm bài</span></div>
            <div className="rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-brand-100"><strong className="block text-xl text-gray-950">{participation}%</strong><span className="text-xs text-gray-500">tỷ lệ tham gia</span></div>
          </div>
        )}
      </div>

      <div className="p-4 sm:p-6">
        {loading && !data ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm font-semibold text-gray-500"><span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />Đang tổng hợp thành tích…</div>
        ) : error ? (
          <div className="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-center text-sm font-semibold text-danger-700">{error}</div>
        ) : data ? (
          <div className="grid gap-4 xl:grid-cols-3">
            <RankingBoard board="completion" data={data} />
            <RankingBoard board="score" data={data} />
            <RankingBoard board="studyTime" data={data} />
          </div>
        ) : null}
        <p className="mt-4 text-center text-[11px] leading-5 text-gray-400">Mỗi đề chỉ tính một lần vào số bài hoàn thành. Điểm dùng kết quả cao nhất của từng đề; thời gian chỉ cộng các lượt đã nộp hợp lệ.</p>
      </div>
    </section>
  );
}
