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
  /** Optional MIME type hint from HF (e.g. "image/svg+xml" or "image/png").
   *  When the HF Space is updated to return SVG it can set this field and the
   *  client will automatically use the correct data URI without further changes. */
  mime_type?: string;
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

/**
 * Wraps the raw base64 string returned by HF into a browser-ready data URI.
 * Auto-detects the format from the HF response:
 *   - If HF returns SVG  → data:image/svg+xml;base64,…
 *   - If HF returns PNG  → data:image/png;base64,…  (current HF behaviour)
 * Once the HF Space is updated to output SVG, this function automatically
 * produces the correct SVG data URI with no further code changes needed.
 */
function toImageDataUri(imageBase64: string, mimeHint?: string): string {
  const trimmed = imageBase64.trim();
  // Already a fully-formed data URI — return as-is.
  if (trimmed.startsWith("data:image/")) return trimmed;
  // Use the hint supplied by the caller (set by the HF response field), or
  // fall back to PNG so existing behaviour is preserved until HF outputs SVG.
  const mime = mimeHint ?? "image/png";
  return `data:${mime};base64,${trimmed}`;
}

function buildTikzImageTag(imageSrc: string): string {
  return `<img src="${imageSrc}" alt="Math Diagram" class="math-rendered-svg mx-auto my-2 max-w-full" />`;
}

// ── Core fetch ────────────────────────────────────────────────────────────────

/**
 * Calls the Hugging Face renderer and returns a browser-ready SVG data URI.
 *
 * The HF server compiles the LaTeX fragment and returns the result as a
 * base64-encoded SVG via the `image_base64` field.  The returned string is a
 * fully-formed `data:image/svg+xml;base64,…` URI that can be stored directly
 * in Firestore as part of the question document (no Firebase Storage needed).
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

    return toImageDataUri(payload.image_base64, payload.mime_type);
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
 * Finds every match of `regex` in `content`, converts each unique block to an
 * SVG via the HF API (using `extractCode` to obtain the LaTeX sent to the
 * server), and replaces successful matches with <img> tags whose src is an
 * inline `data:image/svg+xml;base64,…` URI stored directly in Firestore.
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
 * Converts all \begin{tikzpicture}...\end{tikzpicture} blocks in a content
 * string to SVG images via the HuggingFace renderer and replaces them with
 * <img> tags whose src is an inline `data:image/svg+xml;base64,…` URI.
 * The result is stored directly in the Firestore question document — no
 * Firebase Storage upload, no external URL, no cleanup needed.
 *
 * \begin{tabular}...\end{tabular} blocks are intentionally NOT sent to HF:
 * pdflatex's T1 font encoding cannot handle Vietnamese double-diacritic
 * characters (ầ, ố, ề …).  The frontend renders tabulars natively via
 * parseTabularToHTML (textProcessor.tsx) which supports full Unicode and
 * KaTeX math in every cell.
 */
export async function processTikzToImagesWithStats(
  content: string,
  options: ConvertTikzOptions = {},
): Promise<ProcessMathContentResult> {
  return convertBlocksToImages(
    content,
    TIKZPICTURE_RE,
    (block) => block,
    options,
  );
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
