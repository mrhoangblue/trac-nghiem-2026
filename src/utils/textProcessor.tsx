/**
 * textProcessor.tsx
 *
 * Pipeline:
 *  1. \begin{tabular}...  → HTML <table> (parseTabularToHTML)
 *  2. \begin{center}...   → centered flex div
 *  3. $$...$$  /  $...$   → <Latex> (KaTeX)
 *  4. plain text \\       → <br/>
 */

import React from "react";
import Latex from "react-latex-next";

const MATH_BLOCK_REGEX = /(\$\$[\s\S]*?\$\$|\$(?:[^$\\]|\\.)*\$)/g;
const NEWLINE_REGEX = /\s*\\\\\s*/g;

// ── Tabular → HTML table ──────────────────────────────────────────────────────

/**
 * Converts a full \begin{tabular}{spec}...\end{tabular} string into a
 * styled HTML <table>. Each cell's content is still run through the math/text
 * renderer so KaTeX handles any formulae inside cells.
 *
 * Wrapped in try/catch — malformed LaTeX returns a visible error badge rather
 * than crashing the whole page.
 */
function parseTabularToHTML(raw: string): React.ReactNode {
  try {
    const m = /\\begin\{tabular\}\{([^}]*)\}([\s\S]*?)\\end\{tabular\}/.exec(raw);
    if (!m) return <span className="text-xs text-red-400 font-mono">[tabular parse error]</span>;

    const colSpec = m[1];
    const body = m[2];

    // Map each column letter to a Tailwind alignment class
    const colAligns: string[] = [];
    for (const ch of colSpec) {
      if (ch === 'l') colAligns.push('text-left');
      else if (ch === 'r') colAligns.push('text-right');
      else if (ch === 'c') colAligns.push('text-center');
    }

    // Strip horizontal-rule commands and optional vertical-space args after \\
    const clean = body
      .replace(/\\hline\b/g, '')
      .replace(/\\toprule\b/g, '')
      .replace(/\\midrule\b/g, '')
      .replace(/\\bottomrule\b/g, '')
      .replace(/\\cline\{[^}]*\}/g, '')
      .trim();

    // Split into rows on \\ (with optional [skip] arg, e.g. \\[0.5cm])
    const rows = clean
      .split(/\\\\\s*(?:\[[^\]]*\])?/)
      .map(r => r.trim())
      .filter(Boolean);

    if (rows.length === 0) return null;

    return (
      <div className="overflow-x-auto my-4">
        <table className="table-auto border-collapse border border-gray-400 w-full">
          <tbody>
            {rows.map((row, ri) => {
              const cells = row.split('&').map(c => c.trim());
              return (
                <tr key={ri} className={ri % 2 === 1 ? 'bg-gray-50' : 'bg-white'}>
                  {cells.map((cell, ci) => {
                    const align = colAligns[ci] ?? 'text-center';
                    return (
                      <td
                        key={ci}
                        className={`border border-gray-300 px-3 py-2 align-middle ${align}`}
                      >
                        {renderMathAndText(cell)}
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
    return <span className="text-xs text-red-400 font-mono">[bảng lỗi]</span>;
  }
}

// ── Bare \begin{array} wrapper ────────────────────────────────────────────────

/** Wrap bare \begin{array}...\end{array} (not already inside $) with $$ */
function wrapBareArrays(text: string): string {
  return text.replace(
    /\\begin\{array\}([\s\S]*?)\\end\{array\}/g,
    (match, _inner, offset, str) => {
      const before = offset > 0 ? str[offset - 1] : '';
      return before === '$' ? match : `$$${match}$$`;
    },
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export function processLatexText(text: string): React.ReactNode {
  if (!text) return null;

  // Step 0 — split out \begin{tabular}...\end{tabular} blocks.
  // Optionally consume a surrounding \begin{center}...\end{center} wrapper so
  // those tags don't leak into the text segments as raw LaTeX.
  const TABULAR_RE = /(?:\\begin\{center\}\s*)?\\begin\{tabular\}\{[^}]*\}[\s\S]*?\\end\{tabular\}(?:\s*\\end\{center\})?/g;
  type TopSeg = { kind: 'text' | 'tabular'; content: string };
  const topSegs: TopSeg[] = [];
  let lastPos = 0;
  let tabMatch: RegExpExecArray | null;
  TABULAR_RE.lastIndex = 0;

  while ((tabMatch = TABULAR_RE.exec(text)) !== null) {
    if (tabMatch.index > lastPos) {
      topSegs.push({ kind: 'text', content: text.slice(lastPos, tabMatch.index) });
    }
    topSegs.push({ kind: 'tabular', content: tabMatch[0] });
    lastPos = tabMatch.index + tabMatch[0].length;
  }
  if (lastPos < text.length) {
    topSegs.push({ kind: 'text', content: text.slice(lastPos) });
  }

  if (topSegs.some(s => s.kind === 'tabular')) {
    return (
      <>
        {topSegs.map((seg, i) =>
          seg.kind === 'tabular'
            ? <React.Fragment key={i}>{parseTabularToHTML(seg.content)}</React.Fragment>
            : <React.Fragment key={i}>{processTextOnly(seg.content)}</React.Fragment>
        )}
      </>
    );
  }

  return processTextOnly(text);
}

// ── Internal pipeline: text without tabular blocks ────────────────────────────

function processTextOnly(text: string): React.ReactNode {
  if (!text.trim()) return null;

  // Wrap bare \begin{array} with $$
  text = wrapBareArrays(text);

  // Split on \begin{center}...\end{center}
  const CENTER_RE = /\\begin\{center\}([\s\S]*?)\\end\{center\}/g;
  type Seg = { kind: 'normal' | 'center'; text: string };
  const segs: Seg[] = [];
  let lastIdx = 0;
  let cm: RegExpExecArray | null;
  CENTER_RE.lastIndex = 0;

  while ((cm = CENTER_RE.exec(text)) !== null) {
    if (cm.index > lastIdx) segs.push({ kind: 'normal', text: text.slice(lastIdx, cm.index) });
    segs.push({ kind: 'center', text: cm[1].trim() });
    lastIdx = cm.index + cm[0].length;
  }
  if (lastIdx < text.length) segs.push({ kind: 'normal', text: text.slice(lastIdx) });

  if (segs.length === 1 && segs[0].kind === 'normal') {
    return renderMathAndText(segs[0].text);
  }

  return (
    <>
      {segs.map((seg, i) => {
        if (seg.kind === 'center') {
          return (
            <div key={i} className="flex justify-center w-full overflow-x-auto my-4">
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

// ── Math + plain-text renderer ────────────────────────────────────────────────

function renderMathAndText(text: string): React.ReactNode {
  if (!text.trim()) return null;

  const parts = text.split(MATH_BLOCK_REGEX);

  if (parts.length === 1) return <TextWithNewlines>{parts[0]}</TextWithNewlines>;

  return (
    <>
      {parts.map((part, idx) => {
        if (idx % 2 === 1) return <Latex key={idx}>{part}</Latex>;
        if (part.trim()) return <TextWithNewlines key={idx}>{part}</TextWithNewlines>;
        return null;
      })}
    </>
  );
}

function TextWithNewlines({ children }: { children: React.ReactNode }) {
  const raw = String(children ?? '');
  const html = raw.replace(NEWLINE_REGEX, '<br/>');
  return <span className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function simpleNewline(text: string): string {
  return text.replace(NEWLINE_REGEX, '<br/>');
}
