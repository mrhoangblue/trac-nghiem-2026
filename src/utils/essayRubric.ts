/**
 * Thang chấm câu tự luận viết ngay trong \loigiai bằng lệnh \buoc:
 *
 *   \loigiai{
 *     \buoc{0,25}{Tính đúng $\Delta = 9$.}
 *     \buoc{0,5}{Tìm được hai nghiệm $x_1 = 1$, $x_2 = -2$.}
 *   }
 *
 * Mỗi \buoc{điểm}{nội dung} là một ý chấm độc lập. Phần chữ còn lại của
 * \loigiai vẫn là hướng dẫn chấm chung. Thang chấm chỉ giáo viên (và máy chấm)
 * thấy; học sinh không nhận trường này khi làm bài.
 */
export interface RubricStep {
  /** Điểm tối đa của ý này. */
  points: number;
  /** Nội dung ý chấm, còn nguyên LaTeX. */
  text: string;
}

const round = (value: number) => Math.round(value * 100) / 100;

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

/** Nhóm {…} bắt đầu tại `start` (bỏ qua khoảng trắng); null nếu không có hoặc lệch ngoặc. */
function braceGroup(text: string, start: number): { content: string; end: number } | null {
  let pos = start;
  while (pos < text.length && /\s/.test(text[pos])) pos++;
  if (text[pos] !== "{") return null;
  let depth = 0;
  for (let i = pos; i < text.length; i++) {
    const ch = text[i];
    if ((ch !== "{" && ch !== "}") || isEscaped(text, i)) continue;
    depth += ch === "{" ? 1 : -1;
    if (depth === 0) return { content: text.slice(pos + 1, i), end: i + 1 };
  }
  return null;
}

/**
 * Tách các \buoc{điểm}{nội dung} khỏi lời giải. Lệnh viết sai (thiếu ngoặc, điểm
 * không phải số dương) được giữ nguyên trong phần chữ để giáo viên thấy và sửa.
 */
export function extractRubric(explanation: string): { rubric: RubricStep[]; explanation: string } {
  const rubric: RubricStep[] = [];
  const command = /\\buoc(?![a-zA-Z])/g;
  let rest = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = command.exec(explanation)) !== null) {
    const pointsGroup = braceGroup(explanation, match.index + match[0].length);
    const textGroup = pointsGroup ? braceGroup(explanation, pointsGroup.end) : null;
    if (!pointsGroup || !textGroup) continue;
    const raw = pointsGroup.content.trim();
    const points = /^[0-9]+(?:[.,][0-9]+)?$/.test(raw) ? Number.parseFloat(raw.replace(",", ".")) : Number.NaN;
    const text = textGroup.content.trim();
    if (!Number.isFinite(points) || points <= 0 || !text) continue;
    rubric.push({ points: round(points), text });
    rest += explanation.slice(cursor, match.index);
    cursor = textGroup.end;
    command.lastIndex = textGroup.end;
  }
  rest += explanation.slice(cursor);
  return { rubric, explanation: rubric.length > 0 ? rest.replace(/\n{3,}/g, "\n\n").trim() : explanation };
}

export function rubricTotal(rubric: RubricStep[] | undefined): number {
  return round((rubric ?? []).reduce((sum, step) => sum + step.points, 0));
}

const fmt = (value: number) => String(round(value)).replace(".", ",");

/**
 * Cảnh báo khi tổng các \buoc của một câu khác điểm tối đa của câu đó.
 * `maxPoints` là kết quả của essayQuestionPoints (đã tính \diem và chia đều).
 */
export function rubricProblems(
  questions: Array<{ id: number; type: string; rubric?: RubricStep[] }>,
  maxPoints: Map<number, number>,
): string[] {
  const problems: string[] = [];
  questions.forEach((question, index) => {
    if (question.type !== "essay" || !question.rubric?.length) return;
    const total = rubricTotal(question.rubric);
    const max = maxPoints.get(question.id) ?? 0;
    if (Math.abs(total - max) > 1e-9) {
      problems.push(`Câu ${index + 1}: các \\buoc cộng lại ${fmt(total)} điểm, khác điểm của câu (${fmt(max)}).`);
    }
  });
  return problems;
}
