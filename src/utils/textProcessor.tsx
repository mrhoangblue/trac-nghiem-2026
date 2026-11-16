/**
 * textProcessor.tsx — dựng nội dung đề (chữ lẫn LaTeX) thành React node.
 *
 * Nguyên tắc: không đoạn mã LaTeX nào được hiện nguyên dạng cho người đọc.
 *
 * Pipeline:
 *  1. Chuẩn hóa nguồn (latexNormalize): lệnh ex_test, lệnh riêng của người soạn,
 *     môi trường toán đứng ngoài $...$.
 *  2. \begin{tabular}...  → bảng HTML (parseTabularToHTML)
 *  3. \begin{center}...   → khối căn giữa
 *  4. $...$, $$...$$, \(...\), \[...\] → KaTeX, có tự sửa khi công thức lỗi
 *  5. Phần chữ: đọc từng lệnh. Lệnh định dạng thành thẻ HTML; lệnh toán viết
 *     ngoài công thức được dựng bằng KaTeX; lệnh không nhận ra thì bỏ tên lệnh,
 *     giữ nội dung.
 *
 * Mọi chỗ phải tự sửa hoặc phải bỏ lệnh đều được ghi lại; lintLatexText() trả
 * danh sách đó để trang soạn đề và trang kiểm duyệt cảnh báo giáo viên.
 *
 * Lệnh tiếng Việt: \hoac{...} (hệ ngoặc vuông), \heva{...} (hệ ngoặc nhọn),
 * \begin{itemchoice}...\end{itemchoice}.
 */

import React from "react";
import katex from "katex";
import { normalizeExTestLatex, readGroup } from "@/utils/latexNormalize";

const MATH_BLOCK_REGEX = /(\$\$[\s\S]*?\$\$|\$(?:[^$\\]|\\.)*\$)/g;
/** Hình TikZ đã dựng sẵn, hiện thành khối riêng (kể cả thẻ <img> của đề lưu bản cũ). */
const TIKZ_IMAGE_RE = /\[\[EXAM_TIKZ_IMAGE:([^\]]+)\]\]/y;
const INLINE_IMAGE_RE = /\[\[EXAM_INLINE_IMAGE:([^\]]+)\]\]/y;
const LEGACY_IMG_TAG_RE = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/iy;
const SAFE_IMAGE_SRC_RE = /^(?:https?:\/\/|\/local-imports\/|data:image\/(?:svg\+xml|png);base64,[A-Za-z0-9+/=]+$)/i;
/** TikZ chưa chuyển thành ảnh: không in mã thô ra màn hình. */
const RAW_TIKZ_RE = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g;

// ── Ghi nhận vấn đề ───────────────────────────────────────────────────────────

export interface LatexIssue {
  /** "error": người đọc thấy nội dung sai/thiếu. "warn": đã tự sửa, nên xem lại nguồn. */
  level: "error" | "warn";
  message: string;
  /** Đoạn nguồn liên quan, đã cắt ngắn. */
  snippet: string;
}

let collector: LatexIssue[] | null = null;

function report(level: LatexIssue["level"], message: string, snippet: string) {
  collector?.push({ level, message, snippet: snippet.replace(/\s+/g, " ").trim().slice(0, 140) });
}

/**
 * Dựng thử `text` và trả các chỗ bộ hiển thị phải tự sửa hoặc không dựng được.
 * Danh sách rỗng nghĩa là nội dung hiện đúng như người soạn viết.
 */
export function lintLatexText(text: string): LatexIssue[] {
  const previous = collector;
  const issues: LatexIssue[] = [];
  collector = issues;
  try {
    processLatexText(text);
  } finally {
    collector = previous;
  }
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.level}|${issue.message}|${issue.snippet}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── KaTeX ─────────────────────────────────────────────────────────────────────
// Hệ phương trình dùng \begin{aligned}: KaTeX 0.16 dựng được cả trong dòng lẫn
// dòng riêng, và giãn dòng đủ cho phân số (array{rl} làm các dòng \dfrac chạm nhau).

export const KATEX_MACROS: Record<string, string> = {
  "\\hoac": "\\left[\\begin{aligned}#1\\end{aligned}\\right.",
  "\\heva": "\\left\\{\\begin{aligned}#1\\end{aligned}\\right.",
  // Lệnh của các gói LaTeX hay dùng khi soạn đề mà KaTeX không có sẵn.
  "\\vv": "\\overrightarrow{#1}",
  "\\wideparen": "\\overset{\\frown}{#1}",
  "\\overarc": "\\overset{\\frown}{#1}",
  "\\nh": "[#1;#2)",
  "\\True": "",
};

/** Môi trường chỉ có ở LaTeX đầy đủ → môi trường tương đương KaTeX dựng được ở mọi chế độ. */
function swapMathEnvironments(body: string): string {
  return body
    .replace(/\\(begin|end)\{(?:align|flalign|eqnarray|alignat)\*?\}(?:\{\d+\})?/g, "\\$1{aligned}")
    .replace(/\\(begin|end)\{(?:gather|multline)\*?\}/g, "\\$1{gathered}")
    .replace(/\\(?:begin|end)\{(?:equation|displaymath|math)\*?\}/g, "")
    .replace(/\\(?:nonumber|notag)(?![a-zA-Z])/g, "")
    .replace(/\\(?:label|tag)\s*\{[^{}]*\}/g, "");
}

function braceBalance(body: string): number {
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\") { i++; continue; }
    if (body[i] === "{") depth++;
    else if (body[i] === "}") depth--;
  }
  return depth;
}

/** Bỏ các dấu } không có { mở tương ứng. */
function dropUnmatchedClosers(body: string): string {
  let depth = 0;
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "\\") { out += ch + (body[i + 1] ?? ""); i++; continue; }
    if (ch === "{") depth++;
    if (ch === "}") { if (depth === 0) continue; depth--; }
    out += ch;
  }
  return out;
}

function katexHtml(body: string, display: boolean): string {
  return katex.renderToString(body, {
    displayMode: display,
    macros: { ...KATEX_MACROS },
    throwOnError: true,
    strict: "ignore",
    trust: false,
    output: "htmlAndMathml",
  });
}

/** Thử sửa một lỗi KaTeX cụ thể; trả null khi không biết sửa. */
function repairMath(body: string, message: string): string | null {
  const undefinedCommand = /Undefined control sequence: (\\[a-zA-Z@]+)/.exec(message);
  if (undefinedCommand) {
    const name = undefinedCommand[1].replace(/[\\@]/g, (ch) => `\\${ch}`);
    // Bỏ tên lệnh, giữ tham số: \lenhla{x} → {x}.
    return body.replace(new RegExp(`${name}(?![a-zA-Z])\\*?`, "g"), "");
  }
  if (/display mode|No such environment/.test(message)) {
    const swapped = swapMathEnvironments(body);
    if (swapped !== body) return swapped;
    const unknown = /No such environment: ([^\s]+)/.exec(message);
    if (unknown) {
      const env = unknown[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const replacement = /&|\\\\/.test(body) ? "aligned" : "";
      return body.replace(new RegExp(`\\\\(begin|end)\\{${env}\\}`, "g"), replacement ? `\\$1{${replacement}}` : "");
    }
    return null;
  }
  if (/Expected '\\right'/.test(message)) return `${body}\\right.`;
  if (/got '\\right'|Extra \\right|Unexpected .*\\right/.test(message)) return `\\left.${body}`;
  const balance = braceBalance(body);
  if (balance > 0) return body + "}".repeat(balance);
  if (balance < 0 || /got '\}'/.test(message)) {
    const fixed = dropUnmatchedClosers(body);
    if (fixed !== body) return fixed;
  }
  if (/got '&'|Misplaced &|Expected 'EOF', got '\\\\'/.test(message) && !/\\begin\{/.test(body)) {
    return `\\begin{aligned}${body}\\end{aligned}`;
  }
  if (/Expected group|Expected .* after|Missing|Double (?:super|sub)script/.test(message)) return null;
  return null;
}

interface MathResult { html: string | null; issue?: { level: LatexIssue["level"]; message: string } }

const mathCache = new Map<string, MathResult>();
const MATH_CACHE_LIMIT = 4000;

function renderMath(body: string, display: boolean): MathResult {
  const key = (display ? "D" : "I") + body;
  const cached = mathCache.get(key);
  if (cached) return cached;

  let current = body;
  let firstError = "";
  let result: MathResult = { html: null };
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const html = katexHtml(current, display);
      result = attempt === 0
        ? { html }
        : { html, issue: { level: "warn", message: `Công thức viết chưa chuẩn, đã tự sửa (${firstError})` } };
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message.replace(/^KaTeX parse error:\s*/, "") : String(error);
      if (!firstError) firstError = message.replace(/ at position[\s\S]*$/, "");
      const repaired = repairMath(current, message);
      if (repaired === null || repaired === current) {
        result = { html: null, issue: { level: "error", message: `Công thức không dựng được (${firstError})` } };
        break;
      }
      current = repaired;
      result = { html: null, issue: { level: "error", message: `Công thức không dựng được (${firstError})` } };
    }
  }

  if (mathCache.size >= MATH_CACHE_LIMIT) mathCache.clear();
  mathCache.set(key, result);
  return result;
}

/** Công thức không cứu được: hiện dạng chữ đọc được thay vì mã LaTeX. */
function plainMath(body: string): string {
  return body
    .replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)")
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)")
    .replace(/\\(?:left|right|displaystyle|limits|,|;|!|quad|qquad)(?![a-zA-Z])/g, " ")
    .replace(/\\(?:begin|end)\{[^{}]*\}(?:\{[^{}]*\})?/g, " ")
    .replace(/\\\\/g, "; ")
    .replace(/\\(?:le|leq)(?![a-zA-Z])/g, "≤").replace(/\\(?:ge|geq)(?![a-zA-Z])/g, "≥")
    .replace(/\\(?:ne|neq)(?![a-zA-Z])/g, "≠").replace(/\\cdot(?![a-zA-Z])/g, "·")
    .replace(/\\times(?![a-zA-Z])/g, "×").replace(/\\pm(?![a-zA-Z])/g, "±")
    .replace(/\\infty(?![a-zA-Z])/g, "∞").replace(/\\in(?![a-zA-Z])/g, "∈")
    .replace(/\\(?:Rightarrow|implies)(?![a-zA-Z])/g, "⇒").replace(/\\(?:Leftrightarrow|iff)(?![a-zA-Z])/g, "⇔")
    .replace(/\\to(?![a-zA-Z])/g, "→").replace(/\\pi(?![a-zA-Z])/g, "π")
    .replace(/\\[a-zA-Z]+\*?/g, " ")
    .replace(/[{}&$\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function MathNode({ source, nodeKey }: { source: string; nodeKey: React.Key }): React.ReactElement {
  const display = source.startsWith("$$");
  const body = display ? source.slice(2, -2) : source.slice(1, -1);
  const result = renderMath(body.trim(), display);
  if (result.issue) report(result.issue.level, result.issue.message, source);
  if (result.html === null) {
    return <span key={nodeKey} className="exam-math exam-math-raw italic">{plainMath(body)}</span>;
  }
  return (
    // Inline thường (không overflow/inline-block) để công thức nằm đúng đường chân
    // chữ; công thức hiển thị tự cuộn ngang qua .katex-display. HTML do KaTeX
    // sinh ra với trust: false nên không mang được thẻ hay thuộc tính tùy ý.
    <span key={nodeKey} className="exam-math">
      <span className="__Latex__" dangerouslySetInnerHTML={{ __html: result.html }} />
    </span>
  );
}

// ── Giữ chỗ cho công thức ─────────────────────────────────────────────────────
// Trước khi đọc phần chữ, mỗi công thức được thay bằng một ký hiệu giữ chỗ để
// các bước tách ô bảng, tách \textbf{...} không cắt ngang công thức.

const HOLD_OPEN = "\uE000";
const HOLD_CLOSE = "\uE001";
const HOLD_RE = /\uE000(\d+)\uE001/g;

class MathStore {
  readonly items: string[] = [];

  hold(source: string): string {
    this.items.push(source);
    return `${HOLD_OPEN}${this.items.length - 1}${HOLD_CLOSE}`;
  }

  /** Trả lại nguồn LaTeX; công thức lồng bên trong được gỡ dấu $ để ghép vào công thức ngoài. */
  restore(text: string, stripDelimiters = false): string {
    return text.replace(HOLD_RE, (_match, index: string) => {
      const source = this.items[Number(index)] ?? "";
      if (!stripDelimiters) return source;
      return source.startsWith("$$") ? source.slice(2, -2) : source.slice(1, -1);
    });
  }

  /** Thay công thức trong `text` bằng ký hiệu giữ chỗ. */
  protect(text: string): string {
    return text.replace(MATH_BLOCK_REGEX, (source) => {
      // $\hoac{...}$ viết trong dòng: đưa lên dòng riêng cho dễ đọc.
      if (!source.startsWith("$$") && /^\$\s*\\(?:hoac|heva)\s*\{/.test(source)) return this.hold(`$${source}$`);
      return this.hold(source);
    });
  }
}

const BARE_MATH_ENV_RE = /\\begin\{(array|cases|aligned|gathered|split|[pbvBV]?matrix)\}[\s\S]*?\\end\{\1\}/g;

/** \hoac{...}, \heva{...}, \begin{array}... viết ngoài công thức → công thức hiển thị. */
function holdBareMath(text: string, store: MathStore): string {
  let out = "";
  let cursor = 0;
  const command = /\\(?:hoac|heva)(?![a-zA-Z])/g;
  let match: RegExpExecArray | null;
  while ((match = command.exec(text)) !== null) {
    const group = readGroup(text, match.index + match[0].length);
    if (!group) continue;
    const source = store.restore(text.slice(match.index, group.end), true);
    out += text.slice(cursor, match.index) + store.hold(`$$${source}$$`);
    cursor = group.end;
    command.lastIndex = group.end;
  }
  out += text.slice(cursor);
  return out.replace(BARE_MATH_ENV_RE, (source) => store.hold(`$$${store.restore(source, true)}$$`));
}

// ── Bảng ──────────────────────────────────────────────────────────────────────

function splitOutsideGroups(text: string, separator: "&"): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    else if (ch === separator && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}

function columnAlignments(spec: string): string[] {
  const aligns: string[] = [];
  // Bỏ tham số độ rộng p{3cm}, @{...}, >{...} trước khi đếm cột.
  const letters = spec.replace(/[@><!]\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, "").replace(/([pmbX])\s*\{[^{}]*\}/g, "$1");
  for (const ch of letters) {
    if (ch === "l" || ch === "p" || ch === "m" || ch === "b" || ch === "X") aligns.push("text-left");
    else if (ch === "r") aligns.push("text-right");
    else if (ch === "c") aligns.push("text-center");
  }
  return aligns;
}

/**
 * Chuyển \begin{tabular}{spec}...\end{tabular} thành <table>. Nội dung từng ô
 * vẫn đi qua bộ dựng chữ/công thức. LaTeX hỏng không làm sập trang: bảng không
 * đọc được thì hiện nội dung dạng chữ.
 */
function parseTabularToHTML(raw: string): React.ReactNode {
  try {
    // Đặc tả cột có thể lồng ngoặc, vd {|p{3cm}|l|}.
    const m = /\\begin\{tabular\}\{((?:[^{}]|\{[^{}]*\})*)\}([\s\S]*?)\\end\{tabular\}/.exec(raw);
    if (!m) {
      report("error", "Bảng tabular viết sai cấu trúc", raw);
      return renderMathAndText(raw.replace(/\\(?:begin|end)\{(?:tabular|center)\}/g, " "));
    }

    const colAligns = columnAlignments(m[1]);
    const store = new MathStore();
    const clean = store.protect(m[2])
      .replace(/\\(?:hline|toprule|midrule|bottomrule)(?![a-zA-Z])/g, "")
      .replace(/\\cline\{[^}]*\}/g, "")
      .trim();

    // Tách hàng theo \\ (có thể kèm khoảng cách, vd \\[0.5cm]).
    const rows = clean.split(/\\\\\s*(?:\[[^\]]*\])?/).map((row) => row.trim()).filter(Boolean);
    if (rows.length === 0) return null;

    return (
      <div className="overflow-x-auto overflow-y-hidden max-w-full my-4">
        <table className="table-auto border-collapse border border-gray-400 min-w-max max-w-full">
          <tbody>
            {rows.map((row, ri) => {
              let column = 0;
              return (
                <tr key={ri} className={ri % 2 === 1 ? "bg-gray-50" : "bg-white"}>
                  {splitOutsideGroups(row, "&").map((rawCell, ci) => {
                    let cell = rawCell.trim();
                    let span = 1;
                    let align = colAligns[column] ?? "text-center";
                    const multi = /^\\multicolumn\s*\{\s*(\d+)\s*\}\s*\{([^{}]*)\}/.exec(cell);
                    if (multi) {
                      const group = readGroup(cell, multi[0].length);
                      span = Math.max(1, Math.min(30, Number.parseInt(multi[1], 10) || 1));
                      align = columnAlignments(multi[2])[0] ?? "text-center";
                      cell = group ? group.content + cell.slice(group.end) : cell.slice(multi[0].length);
                    }
                    // \multirow{2}{*}{nội dung}: web không gộp hàng, chỉ giữ nội dung.
                    cell = cell.replace(/\\multirow\s*\{[^{}]*\}\s*\{[^{}]*\}/g, "");
                    column += span;
                    return (
                      <td key={ci} colSpan={span > 1 ? span : undefined} className={`border border-gray-300 px-3 py-2 align-middle ${align}`}>
                        {renderMathAndText(store.restore(cell))}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  } catch {
    report("error", "Bảng tabular không dựng được", raw);
    return renderMathAndText(raw.replace(/\\(?:begin|end)\{(?:tabular|center)\}(?:\{[^{}]*\})?/g, " "));
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Bỏ lệnh dàn trang bản in (khoảng cách, cỡ chữ, \centering…) vốn vô nghĩa trên web. */
function stripLayoutCommands(text: string): string {
  return text
    .replace(/\\(?:setlength|addtolength)\s*\{\\[a-zA-Z]+\}\s*\{[^{}]*\}/g, "")
    .replace(/\\renewcommand\s*\{?\\arraystretch\}?\s*\{[^{}]*\}/g, "")
    .replace(/\\[vh]space\*?\s*\{[^{}]*\}/g, "")
    .replace(/\\(?:par|centering|raggedright|raggedleft|noindent|indent|smallskip|medskip|bigskip|newline|tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)(?![a-zA-Z])\s*/g, (match) => (match.startsWith("\\par") || match.startsWith("\\newline") ? "\n" : ""));
}

export function processLatexText(text: string): React.ReactNode {
  if (!text) return null;
  // Đề cũ lưu nguyên mã ex_test (listEX, enumerate...) cũng được chuyển ở đây.
  text = normalizeExTestLatex(stripLayoutCommands(text))
    .replace(RAW_TIKZ_RE, "\n[Hình vẽ chưa được chuyển thành ảnh]\n");

  // Bước 0 — tách các khối tabular. Nuốt luôn \begin{center} bao ngoài và cặp
  // {...} bao quanh bảng, vd {\centering\small \begin{tabular}...\end{tabular}\par}.
  const TABULAR_CORE = String.raw`\\begin\{tabular\}\{(?:[^{}]|\{[^{}]*\})*\}[\s\S]*?\\end\{tabular\}`;
  const TABULAR_RE = new RegExp(String.raw`\{\s*${TABULAR_CORE}\s*\}|(?:\\begin\{center\}\s*)?${TABULAR_CORE}(?:\s*\\end\{center\})?`, "g");
  type TopSeg = { kind: "text" | "tabular"; content: string };
  const topSegs: TopSeg[] = [];
  let lastPos = 0;
  let tabMatch: RegExpExecArray | null;

  while ((tabMatch = TABULAR_RE.exec(text)) !== null) {
    if (tabMatch.index > lastPos) topSegs.push({ kind: "text", content: text.slice(lastPos, tabMatch.index) });
    topSegs.push({ kind: "tabular", content: tabMatch[0] });
    lastPos = tabMatch.index + tabMatch[0].length;
  }
  if (lastPos < text.length) topSegs.push({ kind: "text", content: text.slice(lastPos) });

  if (topSegs.some((seg) => seg.kind === "tabular")) {
    // Bảng đã có lề riêng; bỏ dấu xuống dòng sát bảng.
    topSegs.forEach((seg, i) => {
      if (seg.kind !== "text") return;
      if (topSegs[i + 1]?.kind === "tabular") seg.content = seg.content.replace(/(?:\s|\\\\)+$/, "");
      if (topSegs[i - 1]?.kind === "tabular") seg.content = seg.content.replace(/^(?:\s|\\\\)+/, "");
    });
    return (
      <>
        {topSegs.map((seg, i) => (
          <React.Fragment key={i}>
            {seg.kind === "tabular" ? parseTabularToHTML(seg.content) : processTextOnly(seg.content)}
          </React.Fragment>
        ))}
      </>
    );
  }

  return processTextOnly(text);
}

// ── Phần không có bảng ────────────────────────────────────────────────────────

function processTextOnly(text: string): React.ReactNode {
  if (!text.trim()) return null;

  text = text
    .replace(/\\begin\{itemchoice\}|\\end\{itemchoice\}/g, "")
    .replace(/\\itemch(?![a-zA-Z])\s*/g, "\n• ")
    // Danh sách thiếu \end (latexNormalize để nguyên): vẫn không in mã thô.
    .replace(/\\(?:begin|end)\{(?:itemize|enumerate)\}(?:\[[^\]]*\])?/g, "\n")
    .replace(/\\item(?![a-zA-Z])\s*(?:\[([^\]]*)\])?\s*/g, (_match, label?: string) => `\n${label ?? "•"} `)
    .replace(/(?<!\\)\\\[([\s\S]*?)\\\]/g, (_match, inner: string) => `$$${inner}$$`)
    .replace(/(?<!\\)\\\(([\s\S]*?)\\\)/g, (_match, inner: string) => `$${inner}$`);

  // Tách theo \begin{center}...\end{center}
  const CENTER_RE = /\\begin\{center\}([\s\S]*?)\\end\{center\}/g;
  type Seg = { kind: "normal" | "center"; text: string };
  const segs: Seg[] = [];
  let lastIdx = 0;
  let cm: RegExpExecArray | null;

  while ((cm = CENTER_RE.exec(text)) !== null) {
    if (cm.index > lastIdx) segs.push({ kind: "normal", text: text.slice(lastIdx, cm.index) });
    segs.push({ kind: "center", text: cm[1].trim() });
    lastIdx = cm.index + cm[0].length;
  }
  if (lastIdx < text.length) segs.push({ kind: "normal", text: text.slice(lastIdx) });

  if (segs.length === 1 && segs[0].kind === "normal") return renderMathAndText(segs[0].text);

  return (
    <>
      {segs.map((seg, i) => {
        if (seg.kind === "center") {
          return (
            <div key={i} className="w-full overflow-x-auto overflow-y-hidden max-w-full my-4 text-center">
              {renderMathAndText(seg.text)}
            </div>
          );
        }
        const node = renderMathAndText(seg.text);
        return node ? <React.Fragment key={i}>{node}</React.Fragment> : null;
      })}
    </>
  );
}

// ── Chữ + công thức ───────────────────────────────────────────────────────────

function renderMathAndText(text: string): React.ReactNode {
  if (!text.trim()) return null;
  const store = new MathStore();
  const flat = holdBareMath(store.protect(text), store);
  const nodes = renderInline(flat, store);
  return nodes.length === 0 ? null : <>{nodes}</>;
}

/** Lệnh định dạng chữ: nội dung trong ngoặc được dựng tiếp (có thể chứa công thức, lệnh lồng). */
const STYLE_COMMANDS: Record<string, "strong" | "em" | "u" | "plain"> = {
  textbf: "strong", indam: "strong", textit: "em", emph: "em", textsl: "em",
  underline: "u", uline: "u",
  text: "plain", textrm: "plain", textsf: "plain", texttt: "plain", textup: "plain", textnormal: "plain",
  mbox: "plain", hbox: "plain", fbox: "plain", centerline: "plain",
};

/** Lệnh bản in bỏ hẳn cùng tham số: tên lệnh → số nhóm {…} đi kèm. */
const DROP_WITH_ARGS: Record<string, number> = {
  label: 1, ref: 1, eqref: 1, pageref: 1, cite: 1, footnote: 1, index: 1,
  vspace: 1, hspace: 1, setlength: 2, addtolength: 2, setcounter: 2, addtocounter: 2,
  includegraphics: 1, phantom: 1, hphantom: 1, vphantom: 1, color: 1, pagecolor: 1,
  renewcommand: 2, newcommand: 2, providecommand: 2, def: 1, fontsize: 2, usepackage: 1,
  input: 1, include: 1, tikzset: 1, caption: 1, captionof: 2, pagestyle: 1, thispagestyle: 1,
  Opensolutionfile: 1, Closesolutionfile: 1, diem: 1,
};

/** Lệnh bản in không tham số: bỏ, không báo. */
const DROP_SILENT = new Set([
  "hline", "toprule", "midrule", "bottomrule", "centering", "raggedright", "raggedleft", "noindent", "indent",
  "smallskip", "medskip", "bigskip", "smallbreak", "medbreak", "bigbreak", "tiny", "scriptsize", "footnotesize", "small",
  "normalsize", "large", "Large", "LARGE", "huge", "Huge", "bf", "it", "rm", "sf", "tt", "sl", "em", "bfseries", "itshape",
  "mdseries", "upshape", "normalfont", "selectfont", "displaystyle", "textstyle", "limits", "nonumber", "notag",
  "allowbreak", "nobreak", "pagebreak", "newpage", "clearpage", "relax", "protect", "True", "strut", "null", "sloppy",
  "leavevmode", "vfill", "break", "nopagebreak", "samepage", "arraystretch", "tabcolsep", "baselineskip", "parindent",
  "textwidth", "linewidth", "columnwidth",
]);

/** Ký hiệu viết bằng lệnh ở ngoài công thức. */
const TEXT_SYMBOLS: Record<string, string> = {
  ldots: "…", dots: "…", cdots: "⋯", textbackslash: "\\", textdegree: "°", degree: "°", textasciitilde: "~",
  textasciicircum: "^", textless: "<", textgreater: ">", textbar: "|", S: "§", copyright: "©", LaTeX: "LaTeX",
  TeX: "TeX", textquoteleft: "‘", textquoteright: "’", textquotedblleft: "“", textquotedblright: "”", lq: "‘", rq: "’",
  euro: "€", pounds: "£", textperthousand: "‰", checkmark: "✓", quad: " ", qquad: "  ", enspace: " ", thinspace: " ",
  hfill: " ", dotfill: " … ", hrulefill: " ", par: "\n", newline: "\n", linebreak: "\n", textendash: "–", textemdash: "—",
  textbullet: "•", slash: "/", P: "¶", dag: "†", ddag: "‡",
};

/** Môi trường dàn trang: bỏ dấu mở/đóng (và tham số độ rộng, số cột), giữ nội dung. */
const LAYOUT_ENVIRONMENTS = new Set([
  "flushleft", "flushright", "center", "minipage", "multicols", "figure", "table", "small", "footnotesize", "large",
  "quote", "quotation", "document", "itemize", "enumerate", "itemchoice", "listEX", "enumEX", "itemEX", "ex", "bt",
  "tabular", "description", "verse", "samepage", "wrapfigure", "subfigure",
]);

function isSafeImage(src: string): boolean {
  return SAFE_IMAGE_SRC_RE.test(src);
}

function renderInline(source: string, store: MathStore): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let buffer = "";
  let key = 0;
  const flush = () => {
    if (!buffer) return;
    out.push(<span key={key++} className="whitespace-pre-line">{buffer}</span>);
    buffer = "";
  };
  const push = (node: React.ReactNode) => { flush(); out.push(node); };
  const lineBreak = () => push(<br key={key++} />);
  const sticky = (re: RegExp, at: number) => { re.lastIndex = at; return re.exec(source); };

  let i = 0;
  while (i < source.length) {
    const ch = source[i];

    if (ch === HOLD_OPEN) {
      const close = source.indexOf(HOLD_CLOSE, i);
      const math = close > 0 ? store.items[Number(source.slice(i + 1, close))] : undefined;
      if (math !== undefined) {
        push(MathNode({ source: math, nodeKey: key++ }));
        i = close + 1;
        continue;
      }
      i++;
      continue;
    }

    if (ch === "\n") { lineBreak(); i++; continue; }

    if (ch === "[" && source.startsWith("[[EXAM_", i)) {
      const tikz = sticky(TIKZ_IMAGE_RE, i);
      if (tikz) {
        // Hình TikZ do hệ thống dựng khi lưu đề.
        // eslint-disable-next-line @next/next/no-img-element
        push(isSafeImage(tikz[1]) ? <img key={key++} src={tikz[1]} alt="Hình vẽ Toán học" className="mx-auto my-2 block h-auto max-w-full" loading="lazy" /> : <React.Fragment key={key++}>[ảnh không hợp lệ]</React.Fragment>);
        i += tikz[0].length;
        continue;
      }
      const image = sticky(INLINE_IMAGE_RE, i);
      if (image) {
        const safe = /^https?:\/\//i.test(image[1]) || image[1].startsWith("/local-imports/");
        // Ảnh SVG/PNG do pipeline nhập đề (đã xác thực) sinh ra.
        // eslint-disable-next-line @next/next/no-img-element
        push(safe ? <img key={key++} src={image[1]} alt="Công thức hoặc hình minh họa" className="mx-1 inline-block h-auto max-h-32 max-w-full align-middle" loading="lazy" /> : <React.Fragment key={key++}>[ảnh không hợp lệ]</React.Fragment>);
        i += image[0].length;
        continue;
      }
    }

    if (ch === "<" && source.startsWith("<img", i)) {
      const legacy = sticky(LEGACY_IMG_TAG_RE, i);
      if (legacy) {
        // eslint-disable-next-line @next/next/no-img-element
        push(isSafeImage(legacy[1]) ? <img key={key++} src={legacy[1]} alt="Hình vẽ Toán học" className="mx-auto my-2 block h-auto max-w-full" loading="lazy" /> : <React.Fragment key={key++}>[ảnh không hợp lệ]</React.Fragment>);
        i += legacy[0].length;
        continue;
      }
    }

    // Ngoặc nhọn ngoài công thức chỉ để gom nhóm trong LaTeX, không in ra.
    if (ch === "{" || ch === "}") { i++; continue; }

    if (ch === "$") {
      report("error", "Dấu $ không có cặp (công thức thiếu dấu đóng hoặc mở)", source.slice(Math.max(0, i - 30), i + 40).replace(HOLD_RE, "…"));
      i++;
      continue;
    }

    if (ch === "~") { buffer += "\u00A0"; i++; continue; }

    if (ch !== "\\") { buffer += ch; i++; continue; }

    // ── Từ đây là một lệnh bắt đầu bằng \ ──
    const next = source[i + 1] ?? "";

    if (next === "\\") {
      lineBreak();
      i += 2;
      // \\[2mm]: khoảng cách dòng của bản in.
      const skip = /^\s*\[\s*-?[\d.,]+\s*(?:mm|cm|pt|em|ex|in)\s*\]/.exec(source.slice(i));
      if (skip) i += skip[0].length;
      continue;
    }
    if ("%$&#_{}".includes(next) && next) { buffer += next; i += 2; continue; }
    if (next === "," || next === ";" || next === ":" || next === " " || next === ">") { buffer += " "; i += 2; continue; }
    if (next === "!" || next === "/" || next === "-") { i += 2; continue; }
    if (!/[a-zA-Z]/.test(next)) { i++; continue; }

    const nameMatch = /^[a-zA-Z]+/.exec(source.slice(i + 1))!;
    const name = nameMatch[0];
    let pos = i + 1 + name.length;
    if (source[pos] === "*") pos++;
    const commandStart = i;

    const style = STYLE_COMMANDS[name];
    if (style) {
      const group = readGroup(source, pos);
      if (!group) { i = pos; continue; }
      const inner = renderInline(group.content, store);
      if (style === "strong") push(<strong key={key++}>{inner}</strong>);
      else if (style === "em") push(<em key={key++}>{inner}</em>);
      else if (style === "u") push(<u key={key++}>{inner}</u>);
      else push(<React.Fragment key={key++}>{inner}</React.Fragment>);
      i = group.end;
      continue;
    }

    if (name === "textcolor" || name === "colorbox") {
      const color = readGroup(source, pos);
      const content = color ? readGroup(source, color.end) : null;
      if (content) push(<React.Fragment key={key++}>{renderInline(content.content, store)}</React.Fragment>);
      i = content?.end ?? color?.end ?? pos;
      continue;
    }

    // \buoc{điểm}{ý} còn sót trong lời giải (đề lưu trước khi có thang chấm).
    if (name === "buoc") {
      const points = readGroup(source, pos);
      const content = points ? readGroup(source, points.end) : null;
      if (points && content) {
        push(<React.Fragment key={key++}>{renderInline(content.content, store)}</React.Fragment>);
        buffer += ` (${points.content.trim()} điểm)`;
        i = content.end;
        continue;
      }
    }

    if (name === "begin" || name === "end") {
      const env = readGroup(source, pos);
      const envName = env?.content.trim() ?? "";
      i = env?.end ?? pos;
      if (name === "begin") {
        // Tham số đi kèm: [t], {0.5\textwidth}, {2}.
        const args = /^(?:\s*\[[^\]]*\])?(?:\s*\{[^{}]*(?:\\[a-zA-Z]+)?[^{}]*\})?/.exec(source.slice(i));
        if (args && LAYOUT_ENVIRONMENTS.has(envName) && /^(?:minipage|multicols|wrapfigure|figure|table|tabular|enumerate|itemize|listEX|enumEX)$/.test(envName)) i += args[0].length;
      }
      if (!LAYOUT_ENVIRONMENTS.has(envName)) report("warn", `Môi trường \\begin{${envName}} chưa hỗ trợ, chỉ giữ nội dung`, source.slice(commandStart, commandStart + 60).replace(HOLD_RE, "…"));
      continue;
    }

    if (name in DROP_WITH_ARGS) {
      const optional = /^\s*\[[^\]]*\]/.exec(source.slice(pos));
      if (optional) pos += optional[0].length;
      for (let n = 0; n < DROP_WITH_ARGS[name]; n++) {
        const group = readGroup(source, pos);
        if (!group) break;
        pos = group.end;
      }
      i = pos;
      continue;
    }

    if (name in TEXT_SYMBOLS) {
      const symbol = TEXT_SYMBOLS[name];
      if (symbol === "\n") lineBreak(); else buffer += symbol;
      i = pos;
      if (source.startsWith("{}", i)) i += 2;
      continue;
    }

    if (DROP_SILENT.has(name)) {
      i = pos;
      // TeX nuốt khoảng trắng sau tên lệnh.
      while (source[i] === " " || source[i] === "\t") i++;
      continue;
    }

    // Lệnh còn lại: thường là lệnh toán viết quên dấu $ (\Rightarrow, \dfrac{1}{2}).
    // Lấy lệnh cùng các nhóm ngoặc dính liền rồi thử dựng bằng KaTeX.
    let end = pos;
    for (;;) {
      const optional = /^\[[^\]\n]*\]/.exec(source.slice(end));
      if (optional && end === pos) { end += optional[0].length; continue; }
      if (source[end] !== "{") break;
      const group = readGroup(source, end);
      if (!group) break;
      end = group.end;
    }
    const snippet = store.restore(source.slice(commandStart, end), true);
    const math = /[\u00C0-\u1EF9]/.test(snippet) ? { html: null } : renderMathQuiet(snippet);
    if (math.html !== null) {
      report("warn", `Lệnh toán \\${name} nằm ngoài dấu $…$, đã tự dựng thành công thức`, snippet);
      push(
        <span key={key++} className="exam-math">
          <span className="__Latex__" dangerouslySetInnerHTML={{ __html: math.html }} />
        </span>,
      );
      i = end;
      continue;
    }
    // Không phải lệnh toán: bỏ tên lệnh, phần trong ngoặc được đọc tiếp như chữ thường.
    report("warn", `Lệnh \\${name} chưa hỗ trợ, đã bỏ tên lệnh và giữ nội dung`, snippet);
    i = pos;
  }
  flush();
  return out;
}

/** Dựng thử một lệnh đứng ngoài công thức: chỉ nhận khi KaTeX hiểu ngay, không sửa. */
function renderMathQuiet(body: string): { html: string | null } {
  try {
    return { html: katexHtml(body, false) };
  } catch {
    return { html: null };
  }
}

export function simpleNewline(text: string): string {
  return text.replace(/\s*\\\\\s*/g, "<br/>");
}
