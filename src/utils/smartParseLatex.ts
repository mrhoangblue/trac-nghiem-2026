export interface SmartParseCounts {
  p1: number;
  p2: number;
  p3: number;
  /** Câu tự luận (Phần IV), chỉ tách riêng khi đề có cấu trúc 4 phần. */
  p4: number;
  unknown: number;
}

/**
 * Chia các khối \begin{ex}/\begin{bt} theo \choice, \choiceTF, \shortans và \dapso.
 * Khối có \dapso{} là câu tự luận (Phần IV) khi `essay` bật. Khối không có lệnh
 * đáp án nào cũng vào Phần IV (đề cũ); nếu `essay` tắt thì xếp vào Phần I và
 * đếm là "chưa xác định" như trước.
 */
export function smartParseLatex(allLatex: string, options: { essay?: boolean } = {}): {
  part1: string;
  part2: string;
  part3: string;
  part4: string;
  counts: SmartParseCounts;
} {
  const src = allLatex.replace(/(?<!\\)%[^\n]*/g, "");
  const blockRe = /\\begin\{(ex|bt)\}([\s\S]*?)\\end\{\1\}/g;
  let match: RegExpExecArray | null;
  const p1: string[] = [];
  const p2: string[] = [];
  const p3: string[] = [];
  const p4: string[] = [];
  let unknown = 0;

  while ((match = blockRe.exec(src)) !== null) {
    const content = match[2];
    const fullBlock = match[0];
    if (/\\choiceTF\b/.test(content)) {
      p2.push(fullBlock);
    } else if (/\\choice\b/.test(content)) {
      p1.push(fullBlock);
    } else if (/\\shortans\b/.test(content)) {
      p3.push(fullBlock);
    } else if (/\\dapso\b/.test(content)) {
      // \dapso{} đánh dấu câu tự luận (đáp số/hướng dẫn chấm). Đề không có
      // Phần IV vẫn hiểu \dapso như \shortans để đề cũ không bị đổi dạng.
      (options.essay ? p4 : p3).push(fullBlock);
    } else if (options.essay) {
      p4.push(fullBlock);
    } else {
      p1.push(fullBlock);
      unknown++;
    }
  }

  return {
    part1: p1.join("\n\n"),
    part2: p2.join("\n\n"),
    part3: p3.join("\n\n"),
    part4: p4.join("\n\n"),
    counts: { p1: p1.length, p2: p2.length, p3: p3.length, p4: p4.length, unknown },
  };
}

/** Ghép nguồn các phần đã lưu thành một khối duy nhất cho Smart Input. */
export function joinLatexParts(parts: { part1?: string; part2?: string; part3?: string; part4?: string }): string {
  return [parts.part1, parts.part2, parts.part3, parts.part4].map((part) => part?.trim() ?? "").filter(Boolean).join("\n\n");
}
