"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, getDocs, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";

interface Exam {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  gradeLevel?: string;
  examType?: string;
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-gray-500 font-medium animate-pulse">Đang tải danh sách bài thi…</p>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
      <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center text-4xl shadow-sm">
        📭
      </div>
      <h2 className="text-xl font-bold text-gray-800">
        {filtered ? "Không có đề thi nào trong mục này" : "Chưa có bài thi nào"}
      </h2>
      {filtered && (
        <Link href="/" className="text-sm text-blue-600 hover:underline font-medium">
          ← Xem tất cả đề thi
        </Link>
      )}
    </div>
  );
}

// ── Exam Card ─────────────────────────────────────────────────────────────────

function ExamCard({ exam }: { exam: Exam }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm hover:shadow-md border border-gray-100 overflow-hidden flex flex-col transition-all hover:-translate-y-1 group">
      <div className="p-6 flex-1 flex flex-col">
        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4 text-2xl group-hover:bg-blue-100 transition-colors">
          📝
        </div>

        {/* Category badges */}
        {(exam.gradeLevel || exam.examType) && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {exam.gradeLevel && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                {exam.gradeLevel}
              </span>
            )}
            {exam.examType && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {exam.examType}
              </span>
            )}
          </div>
        )}

        <h2 className="text-xl font-bold text-gray-900 mb-2">{exam.title}</h2>
        <p className="text-gray-500 mb-5 flex-1 line-clamp-2 leading-relaxed text-sm">
          {exam.description || "Không có mô tả."}
        </p>

        <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-5 bg-gray-50 p-3 rounded-lg w-fit">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {exam.questionCount ?? 0} câu hỏi
        </div>

        <Link
          href={`/quiz/${exam.id}`}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-center transition-colors flex items-center justify-center gap-2 group/btn"
        >
          Bắt đầu làm bài
          <svg className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

// ── Home content (reads search params) ───────────────────────────────────────

function HomeContent() {
  const searchParams = useSearchParams();
  const grade = searchParams.get("grade");
  const type = searchParams.get("type");

  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    fetchExams();
  }, []);

  const filtered = exams.filter((e) => {
    if (grade && e.gradeLevel !== grade) return false;
    if (type && e.examType !== type) return false;
    return true;
  });

  const filterLabel = grade ? `${grade}${type ? ` › ${type}` : ""}` : null;
  const isFiltered = !!grade;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 w-full">
      {/* Heading */}
      <div className="text-center mb-10">
        {filterLabel ? (
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-gray-900">{filterLabel}</h1>
            <Link href="/" className="text-sm text-blue-600 hover:underline font-medium">
              ← Xem tất cả đề thi
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">
              Danh Sách Bài Thi
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Lựa chọn một bài kiểm tra để bắt đầu ôn tập. Cố gắng suy nghĩ thật kỹ trước khi chọn đáp án nhé!
            </p>
          </>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="text-4xl">⚠️</div>
          <p className="text-red-500 font-medium">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState filtered={isFiltered} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((exam) => (
            <ExamCard key={exam.id} exam={exam} />
          ))}
        </div>
      )}
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
