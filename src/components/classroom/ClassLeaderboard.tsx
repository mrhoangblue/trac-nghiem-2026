"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, CheckCircle2, Clock3, RefreshCw, Trophy } from "lucide-react";
import ClassTabs from "@/components/classroom/ClassTabs";
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
    <li className={`grid grid-cols-[1.5rem_1.75rem_minmax(0,1fr)] sm:grid-cols-[1.75rem_2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-2.5 py-2.5 transition ${current ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-gray-50"}`}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black shadow-sm ${medalClasses}`} aria-label={`Hạng ${rank}`}>
        {rank}
      </span>
      <span className="relative flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-[10px] font-black text-brand-800 ring-2 ring-white">
        {student.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={student.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : initials(student.fullName)}
      </span>
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 overflow-x-auto whitespace-nowrap text-[13px] sm:text-sm font-extrabold leading-5 text-gray-900" title={student.fullName}>{student.fullName}</span>
          {current && <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Bạn</span>}
        </span>
        <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-4 text-gray-500">{meta.detail(student)}</span>
      </span>
      <strong className="col-start-3 whitespace-nowrap text-left text-sm font-black sm:col-auto sm:text-right text-gray-900">{meta.value(student)}</strong>
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
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <header className="border-b border-gray-100 bg-gray-50 px-4 py-3 text-gray-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-extrabold leading-6">{meta.title}</h3>
            <p className="mt-1 text-[11px] font-medium leading-4 text-gray-500">{meta.description}</p>
          </div>
          <span className="rounded-xl bg-white p-2 text-brand-700"><Icon className="h-4 w-4" /></span>
        </div>
      </header>
      {rows.length ? (
        <div className="p-2">
          <ol className="space-y-1">
            {visible.map((student, index) => (
              <RankingRow key={student.studentId} student={student} rank={index + 1} board={board} current={student.studentId === data.viewerStudentId} />
            ))}
          </ol>
          {currentOutsideTop && (
            <ol start={currentIndex + 1} className="mt-2 border-t border-dashed border-gray-200 pt-2">
              <RankingRow student={currentOutsideTop} rank={currentIndex + 1} board={board} current />
            </ol>
          )}
          {rows.length > 10 && (
            <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-2 min-h-11 w-full rounded-xl py-2 text-sm font-bold text-brand-700 hover:bg-brand-50">
              {expanded ? "Thu gọn còn 10 học sinh" : `Xem thêm ${rows.length - 10} học sinh`}
            </button>
          )}
        </div>
      ) : (
        <div className="px-5 py-9 text-center">
          <p className="text-sm font-bold text-gray-600">Chưa có dữ liệu xếp hạng</p>
          <p className="mt-1 text-xs leading-5 text-gray-400">Học sinh sẽ xuất hiện sau khi được duyệt vào lớp.</p>
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
    <section className="min-w-0 space-y-5" aria-labelledby="class-leaderboard-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="class-leaderboard-title" className="flex items-center gap-2 text-xl font-extrabold text-gray-900"><Trophy className="h-5 w-5 text-brand-700" /> Xếp hạng lớp</h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">Mỗi nỗ lực đều được ghi nhận. Chọn tiêu chí để xem thành tích của lớp.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} aria-label="Cập nhật bảng xếp hạng" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-brand-800 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /><span className="hidden sm:inline">Cập nhật</span>
        </button>
      </div>
      {data && <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-900"><strong>{data.participatingStudentCount}/{data.studentCount}</strong> học sinh đã làm bài · {data.assignedExamCount} đề được giao · {participation}% tham gia</p>}
      {loading && !data ? <p role="status" className="py-12 text-center text-sm text-gray-500">Đang tổng hợp thành tích…</p>
        : error ? <p role="alert" className="rounded-xl bg-danger-50 p-4 text-sm text-danger-700">{error}</p>
        : data ? <ClassTabs label="Tiêu chí xếp hạng" tabs={[
          { id: "completion", label: "Hoàn thành", content: <RankingBoard board="completion" data={data} /> },
          { id: "score", label: "Điểm cao", content: <RankingBoard board="score" data={data} /> },
          { id: "time", label: "Thời gian", content: <RankingBoard board="studyTime" data={data} /> },
        ]} /> : null}
      <details className="text-xs leading-6 text-gray-500">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-gray-700">Cách tính xếp hạng</summary>
        <p>Mỗi đề chỉ tính một lần vào số bài hoàn thành. Điểm là trung bình kết quả cao nhất của từng đề. Thời gian cộng các lượt đã nộp, có thể bao gồm thời gian không tương tác. Chỉ tính bài thi được giao cho lớp.</p>
      </details>
    </section>
  );
}
