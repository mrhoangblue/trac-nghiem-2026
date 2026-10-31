/**
 * Cấu trúc đề: các phần có trong đề. Phần IV (tự luận) do giáo viên chấm trên
 * ảnh/PDF bài làm học sinh nộp; Phần I–III chấm tự động.
 */
export type ExamStructure = "p1" | "p12" | "p123" | "p1234";
export type ExamPart = "p1" | "p2" | "p3" | "p4";

export const EXAM_STRUCTURES: Array<{ value: ExamStructure; label: string; description: string; parts: ExamPart[] }> = [
  { value: "p1", label: "Chỉ trắc nghiệm", description: "Phần I", parts: ["p1"] },
  { value: "p12", label: "Trắc nghiệm + Đúng/Sai", description: "Phần I, II", parts: ["p1", "p2"] },
  { value: "p123", label: "3 phần", description: "Trắc nghiệm, Đúng/Sai, Trả lời ngắn", parts: ["p1", "p2", "p3"] },
  { value: "p1234", label: "4 phần (có tự luận)", description: "Thêm Phần IV, học sinh nộp ảnh/PDF", parts: ["p1", "p2", "p3", "p4"] },
];

export const PART_LABELS: Record<ExamPart, string> = {
  p1: "Trắc nghiệm",
  p2: "Đúng/Sai",
  p3: "Trả lời ngắn",
  p4: "Tự luận",
};

/** Sau khi nộp Phần I–III, học sinh có thêm chừng này phút để chụp và nộp bài tự luận. */
export const ESSAY_UPLOAD_GRACE_MINUTES = 5;
export const ESSAY_MAX_FILES = 30;

const QUESTION_PART: Record<string, ExamPart> = {
  multiple_choice: "p1",
  true_false: "p2",
  short_answer: "p3",
  essay: "p4",
};

export function questionPart(type: string): ExamPart | null {
  return QUESTION_PART[type] ?? null;
}

/** Đề cũ không có trường structure được coi là "3 phần" như trước đây. */
export function normalizeStructure(value: unknown): ExamStructure {
  return value === "p1" || value === "p12" || value === "p123" || value === "p1234" ? value : "p123";
}

export function structureParts(structure: ExamStructure): ExamPart[] {
  return EXAM_STRUCTURES.find((item) => item.value === structure)?.parts ?? ["p1", "p2", "p3"];
}

export function hasEssayPart(structure: unknown): boolean {
  return normalizeStructure(structure) === "p1234";
}

/**
 * Điểm từng câu tự luận: câu có \diem{} giữ điểm đó, phần điểm còn lại của
 * Phần IV chia đều cho các câu còn lại.
 */
export function essayQuestionPoints(
  questions: Array<{ id: number; type: string; points?: number }>,
  part4TotalScore: number,
): Map<number, number> {
  const essays = questions.filter((question) => question.type === "essay");
  const explicit = essays.filter((question) => typeof question.points === "number" && question.points > 0);
  const explicitSum = explicit.reduce((sum, question) => sum + (question.points ?? 0), 0);
  const rest = essays.length - explicit.length;
  const share = rest > 0 ? Math.max(0, part4TotalScore - explicitSum) / rest : 0;
  const round = (value: number) => Math.round(value * 100) / 100;
  return new Map(essays.map((question) => [
    question.id,
    round(typeof question.points === "number" && question.points > 0 ? question.points : share),
  ]));
}

const PART_ORDER: Record<ExamPart, number> = { p1: 0, p2: 1, p3: 2, p4: 3 };

/** Xếp câu theo thứ tự Phần I → IV (giữ thứ tự gốc trong từng phần) và đánh lại id. */
export function orderQuestionsByPart<T extends { id: number; type: string }>(questions: T[]): T[] {
  return questions
    .map((question, index) => ({ question, index }))
    .sort((a, b) => (PART_ORDER[questionPart(a.question.type) ?? "p1"] - PART_ORDER[questionPart(b.question.type) ?? "p1"]) || a.index - b.index)
    .map(({ question }, index) => ({ ...question, id: index + 1 }));
}

export function countQuestionsByPart(questions: Array<{ type: string }>): StructureCounts {
  const counts: StructureCounts = { p1: 0, p2: 0, p3: 0, p4: 0 };
  questions.forEach((question) => { counts[questionPart(question.type) ?? "p1"] += 1; });
  return counts;
}

export interface StructureCounts { p1: number; p2: number; p3: number; p4: number }

/** Câu thuộc phần không có trong cấu trúc, hoặc đề 4 phần chưa có câu tự luận. */
export function structureProblems(structure: ExamStructure, counts: StructureCounts): string[] {
  const parts = structureParts(structure);
  const problems: string[] = [];
  (["p1", "p2", "p3", "p4"] as ExamPart[]).forEach((part) => {
    if (!parts.includes(part) && counts[part] > 0) {
      problems.push(`Đề có ${counts[part]} câu ${PART_LABELS[part]} nhưng cấu trúc đã chọn không có phần này.`);
    }
  });
  if (structure === "p1234" && counts.p4 === 0) problems.push("Đề 4 phần cần ít nhất một câu tự luận (khối ex không có \\choice, \\choiceTF, \\shortans).");
  return problems;
}

/** Điểm từng phần lưu trong exams/{id}.scoringConfig; Phần IV chỉ có ở đề 4 phần. */
export function sanitizeScoringConfig(value: unknown, structure: ExamStructure) {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const score = (raw: unknown, fallback: number) => {
    const parsed = Number(raw ?? fallback);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : fallback;
  };
  return {
    part1TotalScore: score(source.part1TotalScore, 3),
    part3TotalScore: score(source.part3TotalScore, 3),
    ...(structure === "p1234" ? { part4TotalScore: score(source.part4TotalScore, 3) } : {}),
  };
}

/** Trạng thái chấm của một bài nộp; bài không có tự luận luôn coi như đã chấm. */
export function isAwaitingGrading(submission: { gradingStatus?: unknown } | null | undefined): boolean {
  return submission?.gradingStatus === "pending";
}
