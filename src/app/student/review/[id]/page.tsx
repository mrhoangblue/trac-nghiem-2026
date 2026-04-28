"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { parseLatexExam, ParsedQuestion } from "@/utils/latexParser";
import { ScoreResult, P2_TABLE, normalizeAnswer } from "@/utils/examTypes";
import ReviewMode from "@/components/ReviewMode";

interface StoredAnswers {
  p1Ans: Record<string, number>;        // qId (string from JSON) → optionIndex
  p2Ans: Record<string, (boolean | null)[]>;
  p3Ans: Record<string, string>;
}

// Chuyển string key từ JSON.parse → number key mà ReviewMode cần
function strKeysToNum<T>(obj: Record<string, T>): Record<number, T> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [Number(k), v]));
}

function parseAnswers(json: string): {
  p1Ans: Record<number, number>;
  p2Ans: Record<number, (boolean | null)[]>;
  p3Ans: Record<number, string>;
} {
  try {
    const raw: StoredAnswers = JSON.parse(json);
    return {
      p1Ans: strKeysToNum(raw.p1Ans ?? {}),
      p2Ans: strKeysToNum(raw.p2Ans ?? {}),
      p3Ans: strKeysToNum(raw.p3Ans ?? {}),
    };
  } catch {
    return { p1Ans: {}, p2Ans: {}, p3Ans: {} };
  }
}

// Tái tính điểm từ đáp án + câu hỏi (để không phụ thuộc vào dữ liệu cũ)
function recalcScore(
  questions: ParsedQuestion[],
  p1Ans: Record<number, number>,
  p2Ans: Record<number, (boolean | null)[]>,
  p3Ans: Record<number, string>,
  storedScore?: Partial<ScoreResult>
): ScoreResult {
  const p1Qs = questions.filter((q) => q.type === "multiple_choice");
  const p2Qs = questions.filter((q) => q.type === "true_false");
  const p3Qs = questions.filter((q) => q.type === "short_answer");

  let p1 = 0; let p1Correct = 0;
  p1Qs.forEach((q) => {
    if (p1Ans[q.id] === (q.correctAnswer as number)) { p1++; p1Correct++; }
  });
  // Đọc điểm thực từ stored nếu có, fallback về số câu
  p1 = storedScore?.p1 ?? (p1Qs.length > 0 ? p1 / p1Qs.length * 3 : 0);

  let p2 = 0;
  const p2Details: ScoreResult["part2"]["details"] = [];
  p2Qs.forEach((q) => {
    const correct = q.correctAnswer as boolean[];
    const student = p2Ans[q.id] ?? new Array(correct.length).fill(null);
    const hits = correct.filter((c, i) => c === student[i]).length;
    const qScore = P2_TABLE[hits] ?? 0;
    p2 += qScore;
    p2Details.push({ match: hits, maxMatch: correct.length, score: qScore });
  });

  let p3 = 0; let p3Correct = 0;
  p3Qs.forEach((q) => {
    const ns = normalizeAnswer(p3Ans[q.id] ?? "");
    const nc = normalizeAnswer(String(q.correctAnswer ?? ""));
    if (ns !== "" && ns === nc) { p3Correct++; }
  });
  p3 = storedScore?.p3 ?? (p3Qs.length > 0 ? p3Correct / p3Qs.length * 1 : 0);

  const r = (n: number) => Math.round(n * 100) / 100;

  // Ưu tiên dùng điểm đã lưu (chính xác nhất)
  const finalP1 = storedScore?.p1 ?? r(p1);
  const finalP2 = storedScore?.p2 ?? r(p2);
  const finalP3 = storedScore?.p3 ?? r(p3);

  return {
    p1: finalP1,
    p2: finalP2,
    p3: finalP3,
    total: storedScore?.total ?? r(finalP1 + finalP2 + finalP3),
    part1: storedScore?.part1 ?? { correct: p1Correct, total: p1Qs.length, score: finalP1 },
    part2: storedScore?.part2 ?? { details: p2Details, totalScore: finalP2 },
    part3: storedScore?.part3 ?? { correct: p3Correct, total: p3Qs.length, score: finalP3 },
  };
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-gray-500 text-sm animate-pulse">Đang tải bài làm…</p>
    </div>
  );
}

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [examTitle, setExamTitle] = useState("");
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [p1Ans, setP1Ans] = useState<Record<number, number>>({});
  const [p2Ans, setP2Ans] = useState<Record<number, (boolean | null)[]>>({});
  const [p3Ans, setP3Ans] = useState<Record<number, string>>({});
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      try {
        // 1. Lấy submission
        const subSnap = await getDoc(doc(db, "submissions", id));
        if (!subSnap.exists()) {
          setError("Không tìm thấy bài làm này.");
          return;
        }
        const sub = subSnap.data();

        // 2. Lấy đề thi
        const examSnap = await getDoc(doc(db, "exams", sub.examId));
        if (!examSnap.exists()) {
          setError("Không tìm thấy đề thi tương ứng.");
          return;
        }
        const exam = examSnap.data();

        setExamTitle(sub.examTitle ?? exam.title ?? "Bài thi");

        // 3. Parse câu hỏi từ rawLatex
        let qs: ParsedQuestion[];
        if (exam.rawLatex) {
          const { part1 = "", part2 = "", part3 = "" } = exam.rawLatex;
          qs = [
            ...parseLatexExam(part1),
            ...parseLatexExam(part2),
            ...parseLatexExam(part3),
          ].map((q, idx) => ({ ...q, id: idx + 1 }));
        } else {
          qs = (exam.questions ?? []) as ParsedQuestion[];
        }
        setQuestions(qs);

        // 4. Parse đáp án từ answersJson
        const { p1Ans: a1, p2Ans: a2, p3Ans: a3 } = parseAnswers(sub.answersJson ?? "{}");
        setP1Ans(a1);
        setP2Ans(a2);
        setP3Ans(a3);

        // 5. Tính / lấy điểm
        const score = recalcScore(qs, a1, a2, a3, sub.scores);
        setScoreResult(score);
      } catch (err) {
        console.error(err);
        setError("Lỗi khi tải dữ liệu. Vui lòng thử lại.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  if (loading) return <Spinner />;

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <p className="text-red-500 font-semibold text-lg mb-6">{error}</p>
        <Link
          href="/student/history"
          className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl transition-colors"
        >
          ← Quay lại lịch sử
        </Link>
      </div>
    );
  }

  if (!scoreResult) return null;

  return (
    <div>
      {/* Back link */}
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <Link
          href="/student/history"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-blue-600 transition-colors"
        >
          ← Quay lại lịch sử
        </Link>
      </div>

      <ReviewMode
        title={examTitle}
        questions={questions}
        p1Ans={p1Ans}
        p2Ans={p2Ans}
        p3Ans={p3Ans}
        scoreResult={scoreResult}
        standalone
      />

      {/* Footer */}
      <div className="max-w-3xl mx-auto px-4 pb-10 flex gap-4 justify-center">
        <Link
          href="/student/history"
          className="px-8 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl transition-colors"
        >
          ← Lịch sử làm bài
        </Link>
        <Link
          href="/"
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
        >
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
