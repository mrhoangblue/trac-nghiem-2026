/**
 * Đáp án chỉ tồn tại ở máy chủ. Học sinh nhận đề đã gỡ đáp án/lời giải; điểm do
 * /api/submissions chấm; đáp án chỉ trả lại sau khi bài đã nộp (và đã chấm xong
 * nếu có tự luận) qua /api/submissions/review.
 *
 * File này chỉ import từ phía máy chủ (route handlers).
 */
import type { DocumentData } from "firebase-admin/firestore";
import { orderQuestionsByPart } from "@/utils/examStructure";
import { parseLatexExam, type ParsedQuestion } from "@/utils/latexParser";

/**
 * Câu hỏi đầy đủ của đề. Giữ đúng quy tắc mà màn làm bài vẫn dùng để dựng đề:
 * đề đã xử lý TikZ dùng `questions` đã lưu; đề cũ còn `rawLatex` ngay trong tài
 * liệu thì tách lại từ nguồn; còn lại dùng `questions`.
 */
export function resolveExamQuestions(exam: DocumentData): ParsedQuestion[] {
  const stored = Array.isArray(exam.questions) ? exam.questions as ParsedQuestion[] : [];
  if (exam.tikzProcessed && Array.isArray(exam.questions)) return stored;

  const raw = exam.rawLatex;
  if (raw && typeof raw === "object") {
    const source = raw as Record<string, unknown>;
    const part = (key: string) => (typeof source[key] === "string" ? source[key] as string : "");
    return orderQuestionsByPart([
      ...parseLatexExam(part("part1")),
      ...parseLatexExam(part("part2")),
      ...parseLatexExam(part("part3")),
      ...parseLatexExam(part("part4"), { essay: true }),
    ]);
  }
  return stored;
}

/** Tên trường mang đáp án, lời giải hay ghi chú chấm của giáo viên. */
const ANSWER_FIELD = /answer|explanation|solution|review|loigiai/i;

/** Câu hỏi gửi cho học sinh khi đang làm bài: không có đáp án, lời giải, ghi chú chấm. */
export function stripQuestionAnswers(question: ParsedQuestion): ParsedQuestion {
  const visible: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(question as unknown as Record<string, unknown>)) {
    if (!ANSWER_FIELD.test(key)) visible[key] = value;
  }
  return { ...visible, correctAnswer: null, explanation: "" } as unknown as ParsedQuestion;
}

/** Tài liệu đề gửi cho học sinh: bỏ mã nguồn LaTeX (chứa đáp án) và đáp án từng câu. */
export function studentExamView(id: string, exam: DocumentData): Record<string, unknown> {
  const hidden = new Set(["rawLatex", "rawLatexSource", "importSourceObject", "questions", "authorEmail"]);
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(exam)) {
    if (!hidden.has(key)) rest[key] = value;
  }
  return {
    id,
    ...rest,
    // Đã gồm cả đề cũ chỉ có rawLatex, nên máy khách không cần mã nguồn nữa.
    tikzProcessed: true,
    questions: resolveExamQuestions(exam).map(stripQuestionAnswers),
  };
}

// ── Chi tiết từng câu cho email kết quả ──────────────────────────────────────

type P2Answer = { a: boolean | null; b: boolean | null; c: boolean | null; d: boolean | null };

export interface EmailResultRow {
  number: number;
  part: "P1" | "P2" | "P3";
  isCorrect: boolean;
  partialHits?: number;
  studentAnswer: string | P2Answer;
  correctAnswer: string | P2Answer;
}

function asP2(values: unknown): P2Answer {
  const list = Array.isArray(values) ? values : [];
  const pick = (index: number): boolean | null => (typeof list[index] === "boolean" ? list[index] as boolean : null);
  return { a: pick(0), b: pick(1), c: pick(2), d: pick(3) };
}

/** Dựng bảng chi tiết từng câu từ đề, đáp án đã lưu (theo đề gốc) và kết quả máy chủ đã chấm. */
export function buildEmailResultRows(
  questions: ParsedQuestion[],
  answers: { p1Ans?: Record<string, unknown>; p2Ans?: Record<string, unknown>; p3Ans?: Record<string, unknown> },
  results: { part1Results?: unknown; part2Results?: unknown; part3Results?: unknown },
): EmailResultRow[] {
  const p1 = questions.filter((question) => question.type === "multiple_choice");
  const p2 = questions.filter((question) => question.type === "true_false");
  const p3 = questions.filter((question) => question.type === "short_answer");
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  const r1 = list(results.part1Results);
  const r2 = list(results.part2Results);
  const r3 = list(results.part3Results);
  const letter = (value: unknown) => (typeof value === "number" && value >= 0 && value < 26 ? String.fromCharCode(65 + value) : "—");

  return [
    ...p1.map((question, index): EmailResultRow => ({
      number: index + 1,
      part: "P1",
      isCorrect: r1[index] === true,
      studentAnswer: letter(answers.p1Ans?.[String(question.id)]),
      correctAnswer: letter(question.correctAnswer),
    })),
    ...p2.map((question, index): EmailResultRow => {
      const key = Array.isArray(question.correctAnswer) ? question.correctAnswer : [];
      const hits = typeof r2[index] === "number" ? r2[index] as number : 0;
      return {
        number: p1.length + index + 1,
        part: "P2",
        isCorrect: key.length > 0 && hits === key.length,
        partialHits: hits,
        studentAnswer: asP2(answers.p2Ans?.[String(question.id)]),
        correctAnswer: asP2(key),
      };
    }),
    ...p3.map((question, index): EmailResultRow => ({
      number: p1.length + p2.length + index + 1,
      part: "P3",
      isCorrect: r3[index] === true,
      studentAnswer: String(answers.p3Ans?.[String(question.id)] ?? "").trim() || "—",
      correctAnswer: String(question.correctAnswer ?? ""),
    })),
  ];
}
