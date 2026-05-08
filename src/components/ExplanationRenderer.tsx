"use client";

import { ITEMCH_SEPARATOR } from "@/utils/latexParser";
import { processLatexText } from "@/utils/textProcessor";

interface ExplanationRendererProps {
  explanation: string;
}

const LABELS = ["a", "b", "c", "d", "e", "f", "g", "h"];

// ── Wrapper patterns ──────────────────────────────────────────────────────────
// Matches both the LaTeX source forms (\begin{itemchoice} / \end{itemchoice})
// and any backend-serialised equivalents (||BEGIN_ITEMCHOICE|| / ||END_ITEMCHOICE||).
const WRAPPER_RE =
  /\\begin\{itemchoice\}|\\end\{itemchoice\}|\|\|BEGIN_ITEMCHOICE\|\||\|\|END_ITEMCHOICE\|\|/g;

// Matches raw \itemch (may still appear if text was not piped through latexParser)
const RAW_ITEMCH_RE = /\\itemch\b\s*/g;

/**
 * normalizeExplanation
 * ─────────────────────────────────────────────────────────────────────────────
 * Defensive pre-processor applied before splitting on ITEMCH_SEPARATOR.
 *
 * Step 1 — Strip wrapper environments so KaTeX never sees them as unknown cmds:
 *   \begin{itemchoice}, \end{itemchoice},
 *   ||BEGIN_ITEMCHOICE||, ||END_ITEMCHOICE||
 *
 * Step 2 — Unify raw \itemch (source form) with the backend placeholder
 *   ||ITEMCH|| so the downstream split always works on a single marker.
 */
function normalizeExplanation(text: string): string {
  return text
    .replace(WRAPPER_RE, "")           // step 1 — drop wrapper tags
    .replace(RAW_ITEMCH_RE, ITEMCH_SEPARATOR); // step 2 — \itemch → ||ITEMCH||
}

/**
 * ExplanationRenderer
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a \loigiai explanation string that may contain ||ITEMCH|| separators
 * (produced by processItemchoice() in latexParser.ts) OR raw \itemch markers
 * that were not pre-processed (standalone or inside \begin{itemchoice}).
 *
 * Strategy:
 *   1. normalizeExplanation() strips wrappers and unifies markers.
 *   2. Split on ||ITEMCH|| to get segments.
 *   3. The first segment is the preamble (text before any marker).
 *   4. Each subsequent segment is rendered as an indented block with a
 *      sequential bold label "a) ", "b) ", … — counter resets per call.
 */
export default function ExplanationRenderer({ explanation }: ExplanationRendererProps) {
  if (!explanation) return null;

  const parts = normalizeExplanation(explanation).split(ITEMCH_SEPARATOR);

  // No \itemch present — render normalised text as-is
  if (parts.length === 1) {
    return processLatexText(parts[0]);
  }

  const [preamble, ...items] = parts;

  return (
    <div className="space-y-2">
      {/* Preamble text before the first \itemch */}
      {preamble.trim() && (
        <div className="leading-relaxed">
          {processLatexText(preamble.trim())}
        </div>
      )}

      {/* Each \itemch item */}
      {items.map((segment, idx) => {
        const label = LABELS[idx] ?? String(idx + 1);
        const text = segment.trim();
        if (!text) return null;

        return (
          <div key={idx} className="flex gap-2 items-start pl-2 border-l-2 border-blue-200">
            <span className="font-extrabold text-blue-600 shrink-0 pt-0.5 min-w-[24px]">
              {label})
            </span>
            <span className="leading-relaxed text-gray-700">
              {processLatexText(text)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
