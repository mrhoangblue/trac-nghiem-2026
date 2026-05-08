const TIKZ_RENDER_ENDPOINT =
  process.env.TIKZ_RENDER_ENDPOINT ?? "https://frankii1990-tikz-render.hf.space/render";

const DEFAULT_TIMEOUT_MS = 30_000;

// ── Regexes ───────────────────────────────────────────────────────────────────

/**
 * Matches \begin{tikzpicture}[opts]...\end{tikzpicture}.
 * The optional [...] handles common cases like [scale=1.5].
 */
const TIKZPICTURE_RE =
  /\\begin\{tikzpicture\}(?:\s*\[[^\]]*\])?[\s\S]*?\\end\{tikzpicture\}/g;

/**
 * Matches \begin{tabular}{spec}...\end{tabular}, optionally wrapped in
 * \begin{center}...\end{center}.
 *
 * Column-spec group  (?:[^{}]|\{[^{}]*\})*  handles one level of nesting,
 * which covers common cases like  {|c|p{3cm}|r|}  correctly.
 */
const TABULAR_RE =
  /(?:\\begin\{center\}\s*)?\\begin\{tabular\}\{(?:[^{}]|\{[^{}]*\})*\}[\s\S]*?\\end\{tabular\}(?:\s*\\end\{center\})?/g;

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface ConvertTikzOptions {
  timeoutMs?: number;
}

export interface ProcessMathContentResult {
  content: string;
  convertedCount: number;
  failedCount: number;
}

interface TikzRenderResponse {
  status?: string;
  image_base64?: string;
  error?: string;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function createTimeoutSignal(timeoutMs: number): {
  signal: AbortSignal;
  clear: () => void;
} {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function toPngDataUrl(imageBase64: string): string {
  const trimmed = imageBase64.trim();
  if (trimmed.startsWith("data:image/")) return trimmed;
  return `data:image/png;base64,${trimmed}`;
}

function buildTikzImageTag(imageSrc: string): string {
  return `<img src="${imageSrc}" alt="TikZ Diagram" class="tikz-image mx-auto my-2 max-w-full" />`;
}

// ── Core fetch ────────────────────────────────────────────────────────────────

/**
 * Calls the Hugging Face renderer and returns a browser-ready PNG data URL.
 * The payload must be a raw LaTeX fragment (tikzpicture, tabular, …) that the
 * server wraps in its own preamble + \begin{document}…\end{document}.
 *
 * Server-side only — call from Route Handlers or Server Actions.
 */
export async function convertTikzToImage(
  tikzCode: string,
  options: ConvertTikzOptions = {},
): Promise<string> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const { signal, clear } = createTimeoutSignal(timeoutMs);

  try {
    const response = await fetch(TIKZ_RENDER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tikz_code: tikzCode }),
      signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`TikZ render HTTP ${response.status}: ${response.statusText}`);
    }

    const payload = (await response.json()) as TikzRenderResponse;

    if (payload.status !== "success" || !payload.image_base64) {
      throw new Error(payload.error ?? "TikZ render API returned an invalid response.");
    }

    return toPngDataUrl(payload.image_base64);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`TikZ render timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clear();
  }
}

// ── Private helper ────────────────────────────────────────────────────────────

/**
 * Generic block converter.
 *
 * Finds every match of `regex` in `content`, converts each unique block to a
 * PNG via the HF API (using `extractCode` to obtain the LaTeX sent to the
 * server), and replaces successful matches with <img> tags.
 *
 * Failed blocks are left unchanged so one bad diagram does not break the whole
 * upload.
 */
async function convertBlocksToImages(
  content: string,
  regex: RegExp,
  /** Given the full regex match, return the LaTeX fragment to send to HF. */
  extractCode: (fullMatch: string) => string,
  options: ConvertTikzOptions,
): Promise<ProcessMathContentResult> {
  // Reset regex state (global flag keeps lastIndex between calls)
  regex.lastIndex = 0;
  const blocks = Array.from(content.matchAll(regex), (m) => m[0]);

  if (blocks.length === 0) {
    return { content, convertedCount: 0, failedCount: 0 };
  }

  const uniqueBlocks = [...new Set(blocks)];
  const conversions = new Map<string, string>();
  let failedCount = 0;

  await Promise.all(
    uniqueBlocks.map(async (block) => {
      const code = extractCode(block);
      try {
        const imageSrc = await convertTikzToImage(code, options);
        conversions.set(block, buildTikzImageTag(imageSrc));
      } catch (error) {
        failedCount += blocks.filter((b) => b === block).length;
        console.error("HF Render API Failed for block:", code);
        console.error("Error details:", error);
        if (
          error instanceof Object &&
          "response" in error &&
          error.response instanceof Response
        ) {
          console.error("Response data:", await error.response.text());
        }
      }
    }),
  );

  let processedContent = content;
  for (const [block, imageTag] of conversions) {
    processedContent = processedContent.split(block).join(imageTag);
  }

  return {
    content: processedContent,
    convertedCount: blocks.length - failedCount,
    failedCount,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Two-pass renderer for a content string:
 *
 *   Pass 1 — tikzpicture blocks  → PNG (sent as-is to HF)
 *   Pass 2 — tabular blocks      → PNG (center wrapper stripped before sending)
 *
 * Running passes sequentially guarantees that a tabular inside a tikzpicture
 * is never double-processed: once the tikzpicture is replaced by an <img> tag
 * in Pass 1, Pass 2 finds no tabular left inside it.
 */
export async function processTikzToImagesWithStats(
  content: string,
  options: ConvertTikzOptions = {},
): Promise<ProcessMathContentResult> {
  let processedContent = content;
  let totalConverted = 0;
  let totalFailed = 0;

  // ── Pass 1: tikzpicture ───────────────────────────────────────────────────
  const tikzResult = await convertBlocksToImages(
    processedContent,
    TIKZPICTURE_RE,
    (block) => block, // send the tikzpicture block as-is
    options,
  );
  processedContent = tikzResult.content;
  totalConverted += tikzResult.convertedCount;
  totalFailed += tikzResult.failedCount;

  // ── Pass 2: tabular (only what remains after Pass 1) ─────────────────────
  const tabularResult = await convertBlocksToImages(
    processedContent,
    TABULAR_RE,
    // Strip optional \begin{center}…\end{center} wrapper — the HF standalone
    // class crops to content, so the wrapper adds nothing useful.
    (block) =>
      block.match(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/)?.[0] ?? block,
    options,
  );
  processedContent = tabularResult.content;
  totalConverted += tabularResult.convertedCount;
  totalFailed += tabularResult.failedCount;

  return {
    content: processedContent,
    convertedCount: totalConverted,
    failedCount: totalFailed,
  };
}

export async function processTikzToImages(
  content: string,
  options: ConvertTikzOptions = {},
): Promise<string> {
  const result = await processTikzToImagesWithStats(content, options);
  return result.content;
}

// Backward-compatible aliases used by older code paths in this project.
export const processMathContentWithStats = processTikzToImagesWithStats;
export const processMathContent = processTikzToImages;
