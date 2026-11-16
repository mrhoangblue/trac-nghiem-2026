/**
 * Rà LaTeX của đề trước khi lưu và khi kiểm duyệt.
 *
 * Bộ hiển thị (textProcessor) không bao giờ in mã thô, nhưng có chỗ nó phải tự
 * sửa hoặc bỏ lệnh. Các hàm ở đây dựng thử từng trường của câu hỏi và gom lại
 * những chỗ đó để giáo viên sửa nguồn (hoặc nhờ AI sửa).
 */
import { ITEMCH_SEPARATOR, parseLatexExam, type ParsedQuestion } from "@/utils/latexParser";
import { lintLatexText, type LatexIssue } from "@/utils/textProcessor";

export type { LatexIssue };

export interface QuestionLatexIssue extends LatexIssue {
  /** Nơi có vấn đề: "Đề bài", "Phương án B", "Lời giải"… */
  where: string;
}

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];
const STATEMENT_LABELS = ["a", "b", "c", "d", "e", "f"];

type LintableQuestion = Pick<ParsedQuestion, "type" | "questionText" | "options" | "correctAnswer" | "explanation" | "rubric">;

/** Mọi vấn đề hiển thị LaTeX của một câu hỏi đã tách. */
export function lintQuestion(question: LintableQuestion): QuestionLatexIssue[] {
  const issues: QuestionLatexIssue[] = [];
  const check = (where: string, text: unknown) => {
    if (typeof text !== "string" || !text.trim()) return;
    for (const issue of lintLatexText(text)) issues.push({ ...issue, where });
  };

  check("Đề bài", question.questionText);
  (question.options ?? []).forEach((option, index) => {
    const label = question.type === "true_false" ? `Ý ${STATEMENT_LABELS[index] ?? index + 1})` : `Phương án ${OPTION_LABELS[index] ?? index + 1}`;
    check(label, option);
  });
  if (question.type === "short_answer" || question.type === "essay") check("Đáp án", question.correctAnswer);
  String(question.explanation ?? "").split(ITEMCH_SEPARATOR).forEach((part) => check("Lời giải", part));
  (question.rubric ?? []).forEach((step, index) => check(`Thang chấm ý ${index + 1}`, step.text));
  return issues;
}

export function hasLatexErrors(issues: LatexIssue[]): boolean {
  return issues.some((issue) => issue.level === "error");
}

export interface SourceBlockReport {
  /** Số thứ tự câu trong đoạn nguồn (từ 1). */
  number: number;
  /** Vị trí khối \begin{ex}…\end{ex} trong nguồn gốc. */
  start: number;
  end: number;
  issues: QuestionLatexIssue[];
}

const BLOCK_RE = /\\begin\{(ex|bt)\}[\s\S]*?\\end\{\1\}/g;

/** Che chú thích % (giữ nguyên độ dài) để vị trí khối khớp với nguồn gốc. */
function maskComments(source: string): string {
  return source.replace(/(?<!\\)%[^\n]*/g, (comment) => " ".repeat(comment.length));
}

function braceBalance(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") { i++; continue; }
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
  }
  return depth;
}

/** Các khối câu hỏi trong nguồn, kèm vị trí, theo đúng thứ tự parseLatexExam đọc. */
export function findSourceBlocks(source: string): Array<{ start: number; end: number }> {
  const masked = maskComments(source);
  const blocks: Array<{ start: number; end: number }> = [];
  BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BLOCK_RE.exec(masked)) !== null) blocks.push({ start: match.index, end: match.index + match[0].length });
  return blocks;
}

/** Rà nguồn LaTeX của một phần đề; chỉ trả các câu có vấn đề. */
export function lintExamSource(source: string, options: { essay?: boolean } = {}): SourceBlockReport[] {
  const reports: SourceBlockReport[] = [];
  findSourceBlocks(source).forEach((block, index) => {
    const [question] = parseLatexExam(source.slice(block.start, block.end), options);
    if (!question) return;
    const issues = lintQuestion(question);
    const raw = maskComments(source.slice(block.start, block.end));
    const balance = braceBalance(raw);
    if (balance !== 0) {
      // Ngoặc lệch làm \loigiai hoặc phương án bị đọc thiếu mà không có dấu hiệu nào trên màn hình.
      issues.unshift({
        level: "error",
        where: "Cả câu",
        message: balance > 0 ? `Thiếu ${balance} dấu } (ngoặc nhọn chưa đóng)` : `Thừa ${-balance} dấu }`,
        snippet: raw.replace(/\s+/g, " ").trim().slice(0, 140),
      });
    }
    if (issues.length > 0) reports.push({ number: index + 1, ...block, issues });
  });
  return reports;
}
