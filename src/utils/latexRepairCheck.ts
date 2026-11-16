/**
 * Kiểm bản sửa LaTeX do AI đề xuất trước khi đưa cho giáo viên: chỉ nhận khi
 * bản sửa hiển thị sạch và không đổi nội dung toán, đáp án hay dạng câu hỏi.
 */
import { lintExamSource } from "@/utils/latexLint";
import { parseLatexExam } from "@/utils/latexParser";

/** Các cụm chữ số trong nguồn, bỏ số chỉ dùng để dàn trang (độ dài, số cột). */
function numberRuns(source: string): Map<string, number> {
  const cleaned = source
    .replace(/(?<!\\)%[^\n]*/g, "")
    .replace(/\[\s*-?[\d.,]+\s*(?:mm|cm|pt|em|ex|in)\s*\]/g, "")
    .replace(/\\(?:Bang|multicolumn|multirow|begin\{(?:multicols|listEX|enumEX)\})\s*[[{]\s*\d+\s*[\]}]/g, "")
    .replace(/\{\s*-?[\d.,]+\s*(?:mm|cm|pt|em|ex|in|\\textwidth|\\linewidth)\s*\}/g, "");
  const runs = new Map<string, number>();
  for (const run of cleaned.match(/\d+/g) ?? []) runs.set(run, (runs.get(run) ?? 0) + 1);
  return runs;
}

/** null khi bản sửa đạt; ngược lại là lý do từ chối (tiếng Việt, hiện cho giáo viên). */
export function rejectRepairReason(original: string, fixed: string): string | null {
  const candidate = fixed.trim();
  if (!/^\\begin\{(ex|bt)\}[\s\S]*\\end\{\1\}$/.test(candidate)) return "Bản sửa không còn là một khối câu hỏi hoàn chỉnh.";
  if (candidate.length < original.length * 0.6 || candidate.length > original.length * 1.6 + 200) return "Bản sửa dài/ngắn bất thường so với bản gốc.";

  const [before] = parseLatexExam(original, { essay: true });
  const after = parseLatexExam(candidate, { essay: true });
  if (!before || after.length !== 1) return "Bản sửa không tách được thành đúng một câu hỏi.";
  if (before.type !== after[0].type) return "Bản sửa làm đổi dạng câu hỏi.";
  if ((before.options?.length ?? 0) !== (after[0].options?.length ?? 0)) return "Bản sửa làm đổi số phương án.";
  if (JSON.stringify(before.correctAnswer) !== JSON.stringify(after[0].correctAnswer)) return "Bản sửa làm đổi đáp án.";
  if (Boolean(before.tikzCode) !== Boolean(after[0].tikzCode)) return "Bản sửa làm mất hoặc thêm hình vẽ.";

  const originalNumbers = numberRuns(original);
  const fixedNumbers = numberRuns(candidate);
  let missing = 0;
  for (const [run, count] of fixedNumbers) {
    if ((originalNumbers.get(run) ?? 0) < count) return `Bản sửa có số liệu không có trong bản gốc (${run}).`;
  }
  for (const [run, count] of originalNumbers) missing += Math.max(0, count - (fixedNumbers.get(run) ?? 0));
  if (missing > 2) return "Bản sửa làm mất số liệu của bản gốc.";

  if (lintExamSource(candidate, { essay: true }).length > 0) return "Bản sửa vẫn còn chỗ hiển thị chưa chuẩn.";
  return null;
}
