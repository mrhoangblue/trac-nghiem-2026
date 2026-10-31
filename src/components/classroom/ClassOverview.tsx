"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, ChevronRight, ClipboardList, FileQuestion, Hourglass, Loader2, Sparkles, Users } from "lucide-react";
import { duration, useMinuteNow } from "@/components/classroom/ClassExamCard";
import { selectClassTab } from "@/components/classroom/ClassTabs";
import type { ClassAssignmentView, ClassExamSummary } from "@/utils/classroomTypes";

export interface OverviewCourse {
  id: string;
  title: string;
  href: string;
  coverImageUrl?: string;
  lessonCount: number;
  progressPercent: number;
}

interface TodoItem {
  key: string;
  kind: "exam" | "assignment";
  title: string;
  deadline: number | null;
  detail: string;
  action: { label: string; href?: string; tab?: string };
}

const parse = (value: string | null | undefined) => {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? null : time;
};

/** Tab mở đầu của lớp: việc cần làm, thông báo và tiến độ học. */
export default function ClassOverview({
  exams,
  assignments,
  courses,
  isStudent,
  classId,
  announcements,
}: {
  exams: ClassExamSummary[];
  /** null khi đang tải bài tập. */
  assignments: ClassAssignmentView[] | null;
  courses: OverviewCourse[];
  isStudent: boolean;
  classId: string;
  announcements: ReactNode;
}) {
  const now = useMinuteNow();

  const todo: TodoItem[] = [
    ...exams
      .filter((exam) => exam.status === "open" && (!isStudent || !exam.submitted))
      .map((exam) => ({
        key: `exam-${exam.id}`,
        kind: "exam" as const,
        title: exam.title,
        deadline: parse(exam.endTime),
        detail: `${exam.questionCount} câu · ${exam.duration ? `${exam.duration} phút` : "không giới hạn giờ"}`,
        action: isStudent
          ? { label: "Làm bài", href: `/quiz/${exam.id}` }
          : { label: "Kết quả", href: `/admin/exam/${exam.id}?classId=${encodeURIComponent(classId)}` },
      })),
    ...(assignments ?? [])
      .filter((item) => item.status === "open" && (!isStudent || !item.mySubmission))
      .map((item) => ({
        key: `assignment-${item.id}`,
        kind: "assignment" as const,
        title: item.title,
        deadline: parse(item.dueAt),
        detail: isStudent ? "Nộp PDF hoặc ảnh bài làm" : `${item.submittedCount ?? 0}/${item.totalStudents ?? 0} học sinh đã nộp`,
        action: { label: isStudent ? "Nộp bài" : "Xem bài nộp", tab: "assignments" },
      })),
  ].sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity));

  const openExams = exams.filter((exam) => exam.status === "open").length;
  const openAssignments = (assignments ?? []).filter((item) => item.status === "open").length;
  const doneExams = exams.filter((exam) => exam.submitted).length;
  const stats = [
    { label: "Bài thi đang mở", value: openExams, icon: FileQuestion, tone: "from-indigo-500 to-violet-500", tab: "exams" },
    { label: "Bài tập đang nhận", value: assignments ? openAssignments : "…", icon: ClipboardList, tone: "from-amber-400 to-orange-500", tab: "assignments" },
    { label: "Khóa học", value: courses.length, icon: BookOpen, tone: "from-sky-400 to-cyan-500", tab: "courses" },
    isStudent
      ? { label: "Bài thi đã làm", value: `${doneExams}/${exams.length}`, icon: CheckCircle2, tone: "from-emerald-400 to-teal-500", tab: "exams" }
      : { label: "Bài thi đã giao", value: exams.length, icon: Users, tone: "from-emerald-400 to-teal-500", tab: "exams" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <button key={stat.label} type="button" onClick={() => selectClassTab(stat.tab)} className="group flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3.5 text-left shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[var(--shadow-lift)]">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${stat.tone}`}><stat.icon size={19} aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className="block font-display text-xl font-extrabold tabular-nums leading-tight text-gray-900">{stat.value}</span>
              <span className="block text-xs font-medium leading-4 text-gray-500">{stat.label}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="todo-heading" className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm"><Sparkles size={17} aria-hidden="true" /></span>
                <div>
                  <h2 id="todo-heading" className="font-display text-base font-extrabold text-gray-900">{isStudent ? "Việc cần làm" : "Đang diễn ra"}</h2>
                  <p className="text-xs text-gray-500">{isStudent ? "Bài thi và bài tập chưa hoàn thành, gần hạn xếp trước" : "Bài thi đang mở và bài tập đang nhận"}</p>
                </div>
              </div>
              {todo.length > 0 && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold tabular-nums text-rose-600 ring-1 ring-rose-100">{todo.length}</span>}
            </div>
            {todo.length === 0 ? (
              assignments === null ? (
                <p role="status" className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Đang tải…</p>
              ) : (
                <div className="px-5 py-10 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={24} aria-hidden="true" /></span>
                  <p className="mt-3 font-semibold text-gray-800">{isStudent ? "Không còn việc nào cần làm" : "Chưa có bài thi hay bài tập nào đang mở"}</p>
                  <p className="mt-1 text-sm text-gray-500">{isStudent ? "Bạn đã hoàn thành mọi bài được giao. Có thể ôn lại ở tab Khóa học." : "Giao bài ở tab Bài tập hoặc gán đề vào lớp khi tạo đề."}</p>
                </div>
              )
            ) : (
              <ul className="divide-y divide-gray-100">
                {todo.map((item) => {
                  const left = item.deadline && now ? item.deadline - now : null;
                  const urgent = left !== null && left < 24 * 60 * 60 * 1000;
                  const actionClass = "edu-btn inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold text-white";
                  return (
                    <li key={item.key} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-gray-50/70">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.kind === "exam" ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600"}`}>
                        {item.kind === "exam" ? <FileQuestion size={19} aria-hidden="true" /> : <ClipboardList size={19} aria-hidden="true" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-gray-900" title={item.title}>{item.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                          <span>{item.kind === "exam" ? "Bài thi" : "Bài tập"} · {item.detail}</span>
                          {left !== null && (
                            <span className={`inline-flex items-center gap-1 font-semibold ${left < 0 ? "text-gray-400" : urgent ? "text-rose-600" : "text-emerald-700"}`}>
                              <Hourglass size={11} aria-hidden="true" />{left < 0 ? "Đã quá hạn" : `Còn ${duration(left)}`}
                            </span>
                          )}
                        </p>
                      </div>
                      {item.action.href ? (
                        <Link href={item.action.href} className={actionClass}>{item.action.label}<ArrowRight size={13} aria-hidden="true" /></Link>
                      ) : (
                        <button type="button" onClick={() => selectClassTab(item.action.tab!)} className={actionClass}>{item.action.label}<ArrowRight size={13} aria-hidden="true" /></button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {announcements}
        </div>

        <aside aria-labelledby="continue-heading" className="rounded-3xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-soft)] lg:sticky lg:top-[9.5rem]">
          <div className="flex items-center justify-between gap-2">
            <h2 id="continue-heading" className="font-display text-base font-extrabold text-gray-900">{isStudent ? "Tiếp tục học" : "Khóa học của lớp"}</h2>
            {courses.length > 0 && <button type="button" onClick={() => selectClassTab("courses")} className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-700 hover:underline">Tất cả<ChevronRight size={14} aria-hidden="true" /></button>}
          </div>
          {courses.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">Chưa có khóa học nào.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {(isStudent ? [...courses].sort((a, b) => Number(b.progressPercent > 0 && b.progressPercent < 100) - Number(a.progressPercent > 0 && a.progressPercent < 100)) : courses).slice(0, 4).map((course) => (
                <li key={course.id}>
                  <Link href={course.href} className="group flex items-center gap-3 rounded-2xl p-2 transition hover:bg-brand-50/60">
                    <span className="relative h-12 w-20 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500">
                      {course.coverImageUrl
                        ? <span aria-hidden="true" className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(course.coverImageUrl)})` }} />
                        : <BookOpen size={20} aria-hidden="true" className="absolute inset-0 m-auto text-white/70" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13px] font-semibold leading-5 text-gray-800 group-hover:text-brand-700">{course.title}</span>
                      {isStudent ? (
                        <span className="mt-1 flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${course.progressPercent}%` }} /></span>
                          <span className="text-[11px] font-bold tabular-nums text-gray-500">{course.progressPercent}%</span>
                        </span>
                      ) : (
                        <span className="mt-0.5 block text-[11px] text-gray-500">{course.lessonCount} bài học</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
