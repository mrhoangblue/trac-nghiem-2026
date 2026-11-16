/**
 * Bộ chuẩn hóa LaTeX kiểu ex_test sang cấu trúc trình duyệt đọc được.
 *
 * Quy trình (chạy khi tách đề và cả khi hiển thị đề cũ, nên chạy lại nhiều lần
 * vẫn cho cùng kết quả):
 *  0. Lệnh riêng của người soạn (\SuaLai, \RSb, \Bang, \nh, {\bf …}) và môi
 *     trường toán đứng ngoài $...$ (align*, eqnarray*…) đổi sang cấu trúc chuẩn.
 *  1. Môi trường danh sách riêng của ex_test (listEX, enumEX, itemEX) đổi sang
 *     enumerate/itemize chuẩn. Số cột trong [n]/{n} bị bỏ vì web tự xếp dòng.
 *  2. Lệnh chỉ có nghĩa khi in (\hfill, \quad, \vspace...) bị bỏ ngoài công thức.
 *  3. Lệnh định dạng của ex_test (\indam) đổi sang lệnh chuẩn (\textbf).
 *  4. Danh sách enumerate/itemize (kể cả lồng nhau) đổi thành các dòng
 *     "a) ...", "1. ...", "• ..." để hiển thị, không để sót \item.
 *  5. Gọn dòng trống thừa.
 *
 * File này không import gì để chạy được cả ở trình duyệt, máy chủ và script kiểm tra.
 */

const MATH_SPLIT = /(\$\$[\s\S]*?\$\$|\$(?:[^$\\]|\\.)*\$|(?<!\\)\\\([\s\S]*?\\\)|(?<!\\)\\\[[\s\S]*?\\\])/g;

/** Chỉ biến đổi phần chữ, giữ nguyên các đoạn công thức. */
function mapOutsideMath(text: string, transform: (segment: string) => string): string {
  return text
    .split(MATH_SPLIT)
    .map((segment, index) => (index % 2 === 1 ? segment : transform(segment)))
    .join("");
}

// ── 0. Lệnh riêng của người soạn và môi trường toán đứng ngoài $...$ ─────────

/** Nhóm {…} bắt đầu tại `start` (bỏ qua khoảng trắng); null nếu không có hoặc lệch ngoặc. */
export function readGroup(text: string, start: number): { content: string; end: number } | null {
  let pos = start;
  while (pos < text.length && /\s/.test(text[pos])) pos++;
  if (text[pos] !== "{") return null;
  let depth = 0;
  for (let i = pos; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return { content: text.slice(pos + 1, i), end: i + 1 };
  }
  return null;
}

/** Thay mọi \name{a}{b}… (đủ `arity` nhóm ngoặc) bằng kết quả của `build`. Lệnh viết thiếu ngoặc được giữ nguyên. */
function rewriteCommand(text: string, name: string, arity: number, build: (args: string[]) => string): string {
  const command = new RegExp(`\\\\${name}(?![a-zA-Z])`, "g");
  let out = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = command.exec(text)) !== null) {
    const args: string[] = [];
    let pos = match.index + match[0].length;
    for (let i = 0; i < arity; i++) {
      const group = readGroup(text, pos);
      if (!group) break;
      args.push(group.content);
      pos = group.end;
    }
    if (args.length !== arity) continue;
    out += text.slice(cursor, match.index) + build(args);
    cursor = pos;
    command.lastIndex = pos;
  }
  return out + text.slice(cursor);
}

/** {\bf chữ}, {\it chữ} (cách viết cũ) → \textbf{chữ}, \textit{chữ}. */
function modernizeFontSwitches(text: string): string {
  const open = /\{\s*\\(bf|bfseries|it|itshape|em|sl)(?![a-zA-Z])\s*/g;
  let out = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = open.exec(text)) !== null) {
    const group = readGroup(text, match.index);
    if (!group) continue;
    const inner = group.content.slice(match[0].length - 1);
    out += text.slice(cursor, match.index) + `\\${match[1].startsWith("bf") ? "textbf" : "textit"}{${inner}}`;
    cursor = group.end;
    open.lastIndex = group.end;
  }
  return out + text.slice(cursor);
}

const BARE_MATH_ENV_RE = /\\begin\{(align|flalign|alignat|eqnarray|gather|multline|equation|displaymath)(\*?)\}(?:\{\d+\})?([\s\S]*?)\\end\{\1\2\}/g;

/** align*, eqnarray*, gather*, equation… đứng ngoài $...$ → công thức hiển thị mà KaTeX dựng được. */
function wrapBareMathEnvironments(text: string): string {
  return mapOutsideMath(text, (segment) => segment.replace(BARE_MATH_ENV_RE, (_match, name: string, _star: string, rawBody: string) => {
    let body = rawBody.replace(/\\(?:nonumber|notag)(?![a-zA-Z])/g, "").replace(/\\(?:label|tag)\s*\{[^{}]*\}/g, "").trim();
    if (name === "equation" || name === "displaymath") return `$$${body}$$`;
    if (name === "gather" || name === "multline") return `$$\\begin{gathered}${body}\\end{gathered}$$`;
    // eqnarray căn bằng "&=&"; aligned chỉ cần một dấu & trước quan hệ.
    if (name === "eqnarray") body = body.replace(/&\s*((?:\\[a-zA-Z]+|[=<>≤≥])+)\s*&/g, "&$1");
    return `$$\\begin{aligned}${body}\\end{aligned}$$`;
  }));
}

/**
 * Lệnh do người soạn tự định nghĩa trong file mẫu (website không đọc phần khai
 * báo đầu file) được đổi sang cấu trúc chuẩn. Danh sách lấy từ các đề đã nhập.
 */
function expandAuthorMacros(text: string): string {
  let out = modernizeFontSwitches(text);
  out = rewriteCommand(out, "SuaLai", 1, ([content]) => `\\textbf{Sửa lại:} ${content.trim()}`);
  // \RSb{ý}{điểm} là thang chấm của mẫu đề tự luận; website dùng \buoc{điểm}{ý}.
  out = rewriteCommand(out, "RSb", 2, ([content, points]) => `\\buoc{${points.trim()}}{${content.trim()}}`);
  out = rewriteCommand(out, "Bang", 2, ([columns, body]) => {
    const count = Math.max(1, Math.min(20, Number.parseInt(columns, 10) || 1));
    const rows = body.trim().replace(/(?:\\\\\s*)?(?:\\hline\s*)*$/, "");
    return `\n\\begin{center}\\begin{tabular}{|l|${"c|".repeat(count)}}\\hline\n${rows}\\\\ \\hline\n\\end{tabular}\\end{center}\n`;
  });
  // \nh{40}{45}: nhóm số liệu [40; 45). Trong công thức KaTeX đã có macro cùng tên.
  out = mapOutsideMath(out, (segment) => rewriteCommand(segment, "nh", 2, ([from, to]) => `$[${from.trim()};${to.trim()})$`));
  return wrapBareMathEnvironments(out);
}

// ── 1. Môi trường danh sách của ex_test ──────────────────────────────────────

const LIST_ENV_RE = /\\(begin|end)\{(listEX|enumEX|itemEX)\}(?:[ \t]*\[[^\]]*\])?(?:[ \t]*\{\d+\})?/g;

function renameExTestLists(text: string): string {
  return text.replace(LIST_ENV_RE, (_match, edge: string, name: string) => {
    if (name === "itemEX") return `\\${edge}{itemize}`;
    if (edge === "end") return "\\end{enumerate}";
    return name === "listEX" ? "\\begin{enumerate}[label=\\alph*)]" : "\\begin{enumerate}[label=\\arabic*)]";
  });
}

// ── 2–3. Lệnh chỉ dành cho bản in ────────────────────────────────────────────

function cleanPrintOnlyCommands(text: string): string {
  return mapOutsideMath(text, (segment) => segment
    .replace(/\\indam\s*\{/g, "\\textbf{")
    .replace(/\\[vh]space\*?\s*\{[^{}]*\}/g, "")
    .replace(/\\(?:hfill|dotfill|hrulefill|quad|qquad)(?![a-zA-Z])[ \t]*/g, " ")
    .replace(/\\(?:bigbreak|medbreak|smallbreak|bigskip|medskip|smallskip|noindent|centering)(?![a-zA-Z])[ \t]*/g, "")
    .replace(/\\(?:ldots|dots)(?![a-zA-Z])(?:\{\})?/g, "…"));
}

// ── 4. enumerate / itemize → dòng chữ ────────────────────────────────────────

const LIST_OPEN_RE = /\\begin\{(enumerate|itemize)\}/;
const LIST_TOKEN_RE = /\\(begin|end)\{(enumerate|itemize)\}|\\item(?![a-zA-Z])/g;
const INDENT = "  ";

function alpha(index: number, upper: boolean): string {
  const letter = String.fromCharCode(97 + ((index - 1) % 26));
  return upper ? letter.toUpperCase() : letter;
}

function roman(index: number, upper: boolean): string {
  const table: Array<[number, string]> = [[10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let rest = index;
  let out = "";
  for (const [value, symbol] of table) {
    while (rest >= value) { out += symbol; rest -= value; }
  }
  return upper ? out.toUpperCase() : out;
}

/** Tạo nhãn đầu dòng từ tuỳ chọn [label=...] hoặc [a)]. */
function makeLabel(kind: "enumerate" | "itemize", option: string | undefined, index: number, depth: number): string {
  if (kind === "itemize") return depth % 2 === 0 ? "•" : "–";
  let pattern = option?.trim();
  if (pattern) {
    const named = /(?:^|,)\s*label\s*=\s*(\{[^{}]*\}|[^,]*)/.exec(pattern);
    if (named) pattern = named[1].trim().replace(/^\{|\}$/g, "");
    else if (/=/.test(pattern)) pattern = undefined;
    else {
      // enumitem: [a)] [A.] [i)] [1.] — ký tự đếm đầu tiên tự tăng theo số thứ tự.
      return pattern.replace(/[1aAiI]/, (ch) => (
        ch === "1" ? String(index) : ch === "a" ? alpha(index, false) : ch === "A" ? alpha(index, true) : roman(index, ch === "I")
      ));
    }
  }
  if (!pattern) {
    const defaults = [`${index}.`, `(${alpha(index, false)})`, `${roman(index, false)}.`, `${alpha(index, true)}.`];
    return defaults[Math.min(depth, 3)];
  }
  return pattern
    .replace(/\\textbf\{([^{}]*)\}/g, "$1")
    .replace(/\\alph\*/g, alpha(index, false))
    .replace(/\\Alph\*/g, alpha(index, true))
    .replace(/\\arabic\*/g, String(index))
    .replace(/\\roman\*/g, roman(index, false))
    .replace(/\\Roman\*/g, roman(index, true))
    .replace(/\\(?:small|normalfont|bfseries)\s*/g, "")
    .replace(/\\[()]/g, "")
    .trim();
}

interface ListNode { start: number; end: number; kind: "enumerate" | "itemize"; option?: string; body: string }

/** Tìm danh sách ngoài cùng đầu tiên có cặp \begin/\end khớp nhau. */
function findOutermostList(text: string, from: number): ListNode | null {
  const open = LIST_OPEN_RE.exec(text.slice(from));
  if (!open) return null;
  const start = from + open.index;
  const kind = open[1] as "enumerate" | "itemize";
  let cursor = start + open[0].length;
  let option: string | undefined;
  const optionMatch = /^[ \t]*\[([^\]]*)\]/.exec(text.slice(cursor));
  if (optionMatch) { option = optionMatch[1]; cursor += optionMatch[0].length; }
  const bodyStart = cursor;
  let depth = 1;
  LIST_TOKEN_RE.lastIndex = cursor;
  let token: RegExpExecArray | null;
  while ((token = LIST_TOKEN_RE.exec(text)) !== null) {
    if (token[1] === "begin") depth++;
    else if (token[1] === "end" && --depth === 0) {
      return { start, end: token.index + token[0].length, kind, option, body: text.slice(bodyStart, token.index) };
    }
  }
  return null; // thiếu \end: để nguyên, không phá nội dung
}

/** Tách thân danh sách theo \item cấp ngoài cùng, giữ nguyên danh sách con. */
function splitItems(body: string): Array<{ label?: string; content: string }> {
  const items: Array<{ label?: string; content: string }> = [];
  let depth = 0;
  let current: { label?: string; start: number } | null = null;
  LIST_TOKEN_RE.lastIndex = 0;
  let token: RegExpExecArray | null;
  const flush = (end: number) => {
    if (current) items.push({ label: current.label, content: body.slice(current.start, end).trim() });
  };
  while ((token = LIST_TOKEN_RE.exec(body)) !== null) {
    if (token[1] === "begin") depth++;
    else if (token[1] === "end") depth--;
    else if (depth === 0) {
      flush(token.index);
      let next = token.index + token[0].length;
      let label: string | undefined;
      const custom = /^[ \t]*\[([^\]]*)\]/.exec(body.slice(next));
      if (custom) { label = custom[1]; next += custom[0].length; }
      current = { label, start: next };
    }
  }
  flush(body.length);
  return items;
}

function renderList(node: ListNode, depth: number): string {
  const items = splitItems(node.body);
  const lines = items.map((item, i) => {
    const label = item.label ?? makeLabel(node.kind, node.option, i + 1, depth);
    const content = listsToText(item.content, depth + 1)
      .replace(/\n[ \t]*\n+/g, "\n")
      .trimEnd()
      .replace(/\n/g, `\n${INDENT}`);
    return `${label} ${content}`.trimEnd();
  });
  return `\n${lines.join("\n")}\n`;
}

/** Đổi mọi enumerate/itemize (kể cả lồng nhau) thành dòng chữ có nhãn. */
export function listsToText(text: string, depth = 0): string {
  let out = "";
  let cursor = 0;
  for (;;) {
    const node = findOutermostList(text, cursor);
    if (!node) break;
    out += text.slice(cursor, node.start) + renderList(node, depth);
    cursor = node.end;
  }
  return out + text.slice(cursor);
}

// ── Cổng vào chính ───────────────────────────────────────────────────────────

/** Chuẩn hóa nguồn LaTeX ex_test thành dạng trình duyệt hiển thị được. */
export function normalizeExTestLatex(input: string): string {
  if (!input) return input;
  let text = input.replace(/\r\n?/g, "\n");
  text = expandAuthorMacros(text);
  text = renameExTestLists(text);
  text = cleanPrintOnlyCommands(text);
  text = listsToText(text);
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
