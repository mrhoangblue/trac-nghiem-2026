export interface ParsedQuestion {
  id: number;
  type: string;
  questionText: string;
  options?: string[];
  correctAnswer: any;
  explanation: string;
  tikzCode?: string;
  explanationTikzCode?: string;
  tikzImageUrl?: string;
  explanationTikzImageUrl?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE PRIMITIVE — Brace-balanced block extractor
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Starting at `startIndex` (must be a `{`), scan character by character while
 * tracking brace depth.  Correctly skips `\{` / `\}` (escaped braces).
 * Returns the content between the outer braces and the index of the character
 * immediately after the closing `}`, or null if unbalanced.
 */
function extractBraceBlock(
  text: string,
  startIndex: number,
): { content: string; endIndex: number } | null {
  if (text[startIndex] !== '{') return null;
  let depth = 0;
  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{' || ch === '}') {
      if (!isEscaped(text, i)) {
        if (ch === '{') depth++;
        else {
          depth--;
          if (depth === 0)
            return { content: text.slice(startIndex + 1, i), endIndex: i + 1 };
        }
      }
    }
  }
  return null; // unbalanced
}

/** True when the character at `index` is preceded by an odd number of backslashes. */
function isEscaped(text: string, index: number): boolean {
  let n = 0;
  let i = index - 1;
  while (i >= 0 && text[i] === '\\') { n++; i--; }
  return n % 2 === 1;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION PARSER  —  uses extractBraceBlock as the single source of truth
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Given a question text that contains `command` (e.g. `\choice`, `\choiceTF`),
 * return:
 *   - questionText : everything BEFORE the command
 *   - options      : up to `numOptions` brace-balanced argument strings
 *
 * This function does NOT use any regex for brace extraction — it delegates
 * entirely to extractBraceBlock.  Nested formulae like \frac{1}{2}, \{x∈ℝ\},
 * and arbitrary LaTeX are therefore handled correctly by construction.
 */
function extractOptions(
  text: string,
  command: string,
  numOptions = 4,
): { questionText: string; options: string[] } {
  const cmdIdx = text.indexOf(command);
  if (cmdIdx === -1) return { questionText: text, options: [] };

  const questionText = text.slice(0, cmdIdx).trim();
  let pos = cmdIdx + command.length;

  // Advance past whitespace
  while (pos < text.length && text[pos] <= ' ') pos++;

  // Skip optional [ … ] argument (e.g. \choice[2])
  pos = skipOptionalArg(text, pos);
  while (pos < text.length && text[pos] <= ' ') pos++;

  const options: string[] = [];
  for (let i = 0; i < numOptions; i++) {
    // Skip whitespace / newlines between options
    while (pos < text.length && text[pos] <= ' ') pos++;
    if (text[pos] !== '{') break; // no more options

    const block = extractBraceBlock(text, pos);
    if (!block) break;

    options.push(block.content.trim());
    pos = block.endIndex;
  }

  return { questionText, options };
}

// ── Skip optional [arg] ───────────────────────────────────────────────────────
function skipOptionalArg(text: string, pos: number): number {
  while (pos < text.length && text[pos] <= ' ') pos++;
  if (text[pos] !== '[') return pos;
  let depth = 0;
  for (let i = pos; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') { depth--; if (depth === 0) return i + 1; }
  }
  return pos;
}

// ── Short answer extractor ────────────────────────────────────────────────────
function extractShortAns(text: string, command: string) {
  const idx = text.indexOf(command);
  const questionText = text.slice(0, idx).trim();
  let pos = idx + command.length;
  while (pos < text.length && text[pos] <= ' ') pos++;

  let answer = '';
  if (text[pos] === '{') {
    const block = extractBraceBlock(text, pos);
    if (block) answer = block.content.trim();
  }
  return { questionText, answer };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIKZ / IMMINI EXTRACTORS
// ═══════════════════════════════════════════════════════════════════════════════

function extractImmini(rawText: string): { textContent: string; tikzCode: string } | null {
  const match = /\\immini(?:L)?/.exec(rawText);
  if (!match) return null;

  let pos = match.index + match[0].length;
  pos = skipOptionalArg(rawText, pos);
  while (pos < rawText.length && rawText[pos] <= ' ') pos++;

  const textBlock = extractBraceBlock(rawText, pos);
  if (!textBlock) return null;
  pos = textBlock.endIndex;
  while (pos < rawText.length && rawText[pos] <= ' ') pos++;

  const tikzBlock = extractBraceBlock(rawText, pos);
  if (!tikzBlock) return null;

  const prefix = rawText.slice(0, match.index).trim();
  const suffix = rawText.slice(tikzBlock.endIndex).trim();
  const textContent = [prefix, textBlock.content.trim(), suffix]
    .filter(Boolean)
    .join('\n');

  return { textContent, tikzCode: tikzBlock.content.trim() };
}

function extractStandaloneTikz(text: string): { textContent: string; tikzCode: string } | null {
  const tikzRe = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/;
  const tikzMatch = tikzRe.exec(text);
  if (!tikzMatch) return null;

  const tikzCode = tikzMatch[0].trim();
  let removeStart = tikzMatch.index;
  let removeEnd = tikzMatch.index + tikzMatch[0].length;

  // If the tikzpicture is wrapped in \begin{center}…\end{center}, remove the wrapper too
  const centerRe = /\\begin\{center\}([\s\S]*?)\\end\{center\}/g;
  let cm: RegExpExecArray | null;
  centerRe.lastIndex = 0;
  while ((cm = centerRe.exec(text)) !== null) {
    if (cm.index <= tikzMatch.index && cm.index + cm[0].length >= removeEnd) {
      removeStart = cm.index;
      removeEnd = cm.index + cm[0].length;
      break;
    }
  }

  const textContent = (text.slice(0, removeStart) + text.slice(removeEnd)).trim();
  return { tikzCode, textContent };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-PROCESSOR  —  applied to questionText before storing
// ═══════════════════════════════════════════════════════════════════════════════

// \begin{tabular} được xử lý trực tiếp bởi parseTabularToHTML trong textProcessor.tsx
// (render thành HTML table với ô text tiếng Việt đúng cách).
// Không chuyển sang \begin{array} ở đây vì KaTeX không xử lý được text thuần bên trong.
function preprocessQuestionText(text: string): string {
  return text;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ITEMCHOICE PROCESSOR
// ═══════════════════════════════════════════════════════════════════════════════

export const ITEMCH_SEPARATOR = '||ITEMCH||';

export function processItemchoice(text: string): string {
  return text
    .replace(/\\begin\{itemchoice\}/g, '')
    .replace(/\\end\{itemchoice\}/g, '')
    .replace(/\\itemch\b\s*/g, ITEMCH_SEPARATOR)
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PARSER
// ═══════════════════════════════════════════════════════════════════════════════

export function parseLatexExam(latex: string): ParsedQuestion[] {
  // Strip LaTeX comments: % to end-of-line, but not \% (escaped percent sign)
  let src = latex.replace(/(?<!\\)%[^\n]*/g, '');

  // Remove solution-file commands that are not part of questions
  src = src.replace(/\\Opensolutionfile\{[\s\S]*?\}/g, '');
  src = src.replace(/\\Closesolutionfile\{[\s\S]*?\}/g, '');

  const questions: ParsedQuestion[] = [];
  const blockRe = /\\begin\{(ex|bt)\}([\s\S]*?)\\end\{\1\}/g;
  let match: RegExpExecArray | null;
  let id = 1;

  while ((match = blockRe.exec(src)) !== null) {
    let raw = match[2].trim();
    let explanation = '';
    let tikzCode: string | undefined;
    let explanationTikzCode: string | undefined;

    // ── 1. Extract \loigiai{…} ──────────────────────────────────────────────
    const loigiaiIdx = raw.indexOf('\\loigiai');
    if (loigiaiIdx !== -1) {
      let pos = loigiaiIdx + '\\loigiai'.length;
      while (pos < raw.length && raw[pos] <= ' ') pos++;
      if (raw[pos] === '{') {
        const block = extractBraceBlock(raw, pos);
        if (block) {
          let explContent = processItemchoice(block.content.trim());
          // Extract TikZ from explanation (same logic as question body)
          const explImmini = extractImmini(explContent);
          if (explImmini) {
            explanationTikzCode = explImmini.tikzCode;
            explContent = explImmini.textContent;
          } else {
            const explStandalone = extractStandaloneTikz(explContent);
            if (explStandalone) {
              explanationTikzCode = explStandalone.tikzCode;
              explContent = explStandalone.textContent;
            }
          }
          explanation = explContent;
          raw = raw.slice(0, loigiaiIdx).trim();
        }
      }
    }

    // ── 2. Extract \immini / \imminiL (text + tikz, 2-column layout) ────────
    const imminiResult = extractImmini(raw);
    if (imminiResult) {
      tikzCode = imminiResult.tikzCode;
      raw = imminiResult.textContent;
    }

    // ── 3. Fallback: standalone \begin{tikzpicture} ──────────────────────────
    if (!tikzCode) {
      const standaloneResult = extractStandaloneTikz(raw);
      if (standaloneResult) {
        tikzCode = standaloneResult.tikzCode;
        raw = standaloneResult.textContent;
      }
    }

    // ── 4. Detect question type and extract options ──────────────────────────
    let type = 'essay';
    let options: string[] = [];
    let correctAnswer: any = null;
    let questionText = raw;

    if (questionText.includes('\\choiceTF')) {
      type = 'true_false';
      const parts = extractOptions(questionText, '\\choiceTF');
      questionText = parts.questionText;
      // Remove \True markers for display; keep raw to detect correct answers
      options = parts.options.map(o => o.replace(/\\True\b/g, '').trim());
      correctAnswer = parts.options.map(o => o.includes('\\True'));

    } else if (questionText.includes('\\choice')) {
      type = 'multiple_choice';
      const parts = extractOptions(questionText, '\\choice');
      questionText = parts.questionText;
      options = parts.options.map(o => o.replace(/\\True\b/g, '').trim());
      correctAnswer = parts.options.findIndex(o => o.includes('\\True'));

    } else if (questionText.includes('\\shortans') || questionText.includes('\\dapso')) {
      type = 'short_answer';
      const cmd = questionText.includes('\\shortans') ? '\\shortans' : '\\dapso';
      const parts = extractShortAns(questionText, cmd);
      questionText = parts.questionText;
      correctAnswer = parts.answer;
    }

    // ── 5. Post-process question text ────────────────────────────────────────
    questionText = preprocessQuestionText(questionText.trim());

    questions.push({
      id: id++,
      type,
      questionText,
      ...(options.length > 0 ? { options } : {}),
      correctAnswer,
      explanation,
      ...(tikzCode ? { tikzCode } : {}),
      ...(explanationTikzCode ? { explanationTikzCode } : {}),
    });
  }

  return questions;
}
