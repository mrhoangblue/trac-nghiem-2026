"use client";

import { ITEMCH_SEPARATOR } from "@/utils/latexParser";
import { processLatexText } from "@/utils/textProcessor";

interface ExplanationRendererProps {
  explanation: string;
}

const LABELS = ["a", "b", "c", "d", "e", "f", "g", "h"];

/**
 * ExplanationRenderer
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a \loigiai explanation string that may contain ||ITEMCH|| separators
 * (produced by processItemchoice() in latexParser.ts).
 *
 * Strategy:
 *   1. Split on ||ITEMCH|| to get segments.
 *   2. The first segment is the preamble (text before any \itemch).
 *   3. Each subsequent segment is rendered as a new indented block prefixed
 *      with a bold label "a) ", "b) ", … so KaTeX only sees clean math content.
 */
export default function ExplanationRenderer({ explanation }: ExplanationRendererProps) {
  if (!explanation) return null;

  const parts = explanation.split(ITEMCH_SEPARATOR);

  // No \itemch present — render as-is
  if (parts.length === 1) {
    return processLatexText(explanation);
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
