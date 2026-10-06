import { createHash } from "node:crypto";
import { uploadToR2 } from "@/lib/r2Storage";

const TIKZ_RENDER_ENDPOINT =
  process.env.TIKZ_RENDER_ENDPOINT ?? "https://frankii1990-tikz-render.hf.space/render";

const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_RENDER_ATTEMPTS = 2;

// ── Regexes ───────────────────────────────────────────────────────────────────

/**
 * Matches \begin{tikzpicture}[opts]...\end{tikzpicture}.
 * The optional [...] handles common cases like [scale=1.5].
 */
const TIKZPICTURE_RE =
  /\\begin\{tikzpicture\}(?:\s*\[[^\]]*\])?[\s\S]*?\\end\{tikzpicture\}/g;

// ── Library auto-detection ────────────────────────────────────────────────────

/**
 * Maps a detection pattern (regex against tikzCode) to the LaTeX preamble lines
 * that must be present for that code to compile.
 *
 * The HF Space accepts an optional `extra_preamble` string that is injected
 * verbatim before \begin{document}.  We only emit entries that aren't already
 * guaranteed by the Space's base template.
 */
const LIBRARY_RULES: Array<{ pattern: RegExp; preamble: string }> = [
  {
    // Bảng biến thiên của tkz-tab không thuộc TikZ lõi.
    pattern: /\\tkzTab(?:Init|Line|Var|Setup)/,
    preamble: "\\usepackage{tkz-tab}",
  },
  {
    // Các lệnh tkz hình học (không thuộc tkz-tab).
    pattern: /\\tkz(?!Tab)[A-Za-z]+/,
    preamble: "\\usepackage{tkz-euclide}",
  },
  {
    pattern: /\\begin\{axis\}|\\addplot\b/,
    preamble: "\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}",
  },
  {
    // calc library: coordinate arithmetic like $(A)!0.5!(B)$ or $(A)+(1,0)$
    pattern: /\$\s*\(/,
    preamble: "\\usetikzlibrary{calc}",
  },
  {
    // tikz-3dplot: \tdplotsetmaincoords or tdplot_main_coords key
    pattern: /\\tdplotset|tdplot_main_coords|tdplot_rotated_coords/,
    preamble: "\\usepackage{tikz-3dplot}",
  },
  {
    // patterns.meta: pattern={Lines[...]}, pattern={Dots[...]}, etc.
    pattern: /pattern=\{(?:Lines|Dots|Crosshatch|Hatch)\[/,
    preamble: "\\usetikzlibrary{patterns.meta}",
  },
  {
    // Classic patterns library (used without .meta)
    pattern: /pattern\s*=\s*(?:north\s+east\s+lines|north\s+west\s+lines|horizontal\s+lines|vertical\s+lines|crosshatch|dots|bricks|checkerboard)/,
    preamble: "\\usetikzlibrary{patterns}",
  },
  { pattern: /(?:>=|arrow|stealth|latex|Latex)/i, preamble: "\\usetikzlibrary{arrows.meta}" },
  { pattern: /\b(?:above|below|left|right)\s*=\s*(?:of|\d)/, preamble: "\\usetikzlibrary{positioning}" },
  { pattern: /name\s+intersections|intersection\s+of=/, preamble: "\\usetikzlibrary{intersections}" },
  { pattern: /pic\s*\{|angle\s*=|quotes/, preamble: "\\usetikzlibrary{angles,quotes}" },
  { pattern: /decoration\s*=|postaction\s*=\s*\{decorate\}/, preamble: "\\usetikzlibrary{decorations.markings,decorations.pathmorphing}" },
  { pattern: /shape\s*=|(?:diamond|trapezium|regular polygon)/, preamble: "\\usetikzlibrary{shapes.geometric}" },
];

const ROYAL_GRAPH_MACROS = String.raw`
\definecolor{RSnavy}{HTML}{00537F}
\newcommand{\BTDoThi}[8][0.55]{%
  \begin{tikzpicture}[scale=#1,font=\scriptsize,line join=round,line cap=round,>=stealth]
    \draw[->] (#2,0)--(#3,0) node[below] {$x$};
    \draw[->] (0,#4)--(0,#5) node[left] {$y$};
    \draw[thick,RSnavy,domain=#6,samples=120,smooth] plot (\x,{#7});
    #8
  \end{tikzpicture}}
`;

const ROYAL_BOX_MACROS = String.raw`
\usetikzlibrary{calc,arrows.meta}
\newcommand{\BTHopTen}[8]{\def\hO{#1}\def\hX{#2}\def\hXY{#3}\def\hY{#4}%
  \def\hOt{#5}\def\hXt{#6}\def\hXYt{#7}\def\hYt{#8}}
\newcommand{\BTHop}[4][1]{%
  \begin{tikzpicture}[scale=#1,x={(-0.26cm,-0.2cm)},y={(0.55cm,0cm)},z={(0cm,0.75cm)},
      font=\scriptsize,line join=round,line cap=round,>=stealth]
    \coordinate(P1)at(0,0,0);\coordinate(P2)at(#2,0,0);
    \coordinate(P3)at(#2,#3,0);\coordinate(P4)at(0,#3,0);
    \coordinate(Q1)at(0,0,#4);\coordinate(Q2)at(#2,0,#4);
    \coordinate(Q3)at(#2,#3,#4);\coordinate(Q4)at(0,#3,#4);
    \draw[dashed](P1)--(P2)(P1)--(P4)(P1)--(Q1);
    \draw(P2)--(P3)--(P4)(Q1)--(Q2)--(Q3)--(Q4)--cycle;
    \draw(P2)--(Q2)(P3)--(Q3)(P4)--(Q4);
    \draw[->](P2)--($(P2)+(1.2,0,0)$)node[below left]{$x$};
    \draw[->](P4)--($(P4)+(0,1.1,0)$)node[below]{$y$};
    \draw[->](Q1)--($(Q1)+(0,0,1)$)node[left]{$z$};
    \node[above right]at(P1){$\hO\equiv O$};
    \node[left]at(P2){$\hX$};\node[below]at(P3){$\hXY$};
    \node[below right]at(P4){$\hY$};\node[left]at(Q1){$\hOt$};
    \node[left]at(Q2){$\hXt$};\node[right]at(Q3){$\hXYt$};
    \node[above right]at(Q4){$\hYt$};
  \end{tikzpicture}}
`;

const CUSTOM_MACRO_RULES: Array<{ pattern: RegExp; preamble: string }> = [
  { pattern: /\\BTDoThi\b/, preamble: ROYAL_GRAPH_MACROS },
  { pattern: /\\BTHop(?:Ten)?\b/, preamble: ROYAL_BOX_MACROS },
];

const VIETNAMESE_PREAMBLE = [
  "\\usepackage[utf8]{inputenc}",
  "\\usepackage[T5]{fontenc}",
  "\\usepackage[vietnamese]{babel}",
].join("\n");

/**
 * TikZ blocks are stored independently from the source document preamble.
 * BlueMath/Hoang Blue documents therefore need their semantic palette restored
 * before the standalone renderer compiles the block.
 */
const COLOR_RULES: Array<{ pattern: RegExp; preamble: string }> = [
  { pattern: /\bHBdong\b/, preamble: "\\definecolor{HBdong}{HTML}{8A5A2B}" },
  { pattern: /\bHBson\b/, preamble: "\\definecolor{HBson}{HTML}{B23A26}" },
  { pattern: /\bHBxam\b/, preamble: "\\definecolor{HBxam}{HTML}{5E5348}" },
  { pattern: /\bHBcatDam\b/, preamble: "\\definecolor{HBcatDam}{HTML}{EFDCBB}" },
  { pattern: /\bRSblue\b/, preamble: "\\definecolor{RSblue}{HTML}{0081C8}" },
  { pattern: /\bRSnavy\b/, preamble: "\\definecolor{RSnavy}{HTML}{00537F}" },
  { pattern: /\bRSnavyDark\b/, preamble: "\\definecolor{RSnavyDark}{HTML}{003A59}" },
  { pattern: /\bRSred\b/, preamble: "\\definecolor{RSred}{HTML}{E31837}" },
  { pattern: /\bRSredDark\b/, preamble: "\\definecolor{RSredDark}{HTML}{B01029}" },
  { pattern: /\bRSgold\b/, preamble: "\\definecolor{RSgold}{HTML}{FDB913}" },
  { pattern: /\bRSgoldDeep\b/, preamble: "\\definecolor{RSgoldDeep}{HTML}{D99B0F}" },
  { pattern: /\bRSgrey\b/, preamble: "\\definecolor{RSgrey}{HTML}{5A5A5A}" },
  { pattern: /\bRSink\b/, preamble: "\\definecolor{RSink}{HTML}{1F2430}" },
  { pattern: /\bRSbgBlue\b/, preamble: "\\definecolor{RSbgBlue}{HTML}{F2F7FF}" },
  { pattern: /\bRSbgRed\b/, preamble: "\\definecolor{RSbgRed}{HTML}{FFF2F4}" },
  { pattern: /\bRSbgGold\b/, preamble: "\\definecolor{RSbgGold}{HTML}{FFFBF0}" },
];

/**
 * Inspects tikzCode and returns any extra preamble lines that the HF Space
 * needs to compile the diagram successfully.
 */
function detectExtraPreamble(tikzCode: string): string {
  // Công thức trong node/nhãn TikZ thường dùng dfrac, text, overrightarrow…
  // Renderer độc lập không bảo đảm nạp AMS như tài liệu gốc của giáo viên.
  const lines: string[] = ["\\usepackage{amsmath,amssymb}"];
  if (/[^\u0000-\u007f]/.test(tikzCode)) lines.push(VIETNAMESE_PREAMBLE);
  for (const rule of LIBRARY_RULES) {
    if (rule.pattern.test(tikzCode) && !lines.includes(rule.preamble)) {
      lines.push(rule.preamble);
    }
  }
  for (const rule of COLOR_RULES) {
    if (rule.pattern.test(tikzCode) && !lines.includes(rule.preamble)) {
      lines.push(rule.preamble);
    }
  }
  for (const rule of CUSTOM_MACRO_RULES) {
    if (rule.pattern.test(tikzCode) && !lines.includes(rule.preamble)) {
      lines.push(rule.preamble);
    }
  }
  return lines.join("\n");
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface ConvertTikzOptions {
  timeoutMs?: number;
}

export interface ProcessMathContentResult {
  content: string;
  convertedCount: number;
  failedCount: number;
}

export interface StoredTikzImage {
  url: string;
  key: string;
  contentType: "image/svg+xml" | "image/png";
}

interface TikzRenderResponse {
  status?: string;
  image_base64?: string;
  /** Optional MIME type hint from HF (e.g. "image/svg+xml" or "image/png").
   *  When the HF Space is updated to return SVG it can set this field and the
   *  client will automatically use the correct data URI without further changes. */
  mime_type?: string;
  error?: string;
  detail?: {
    message?: string;
    latex_error?: string;
  };
}

function conciseRendererError(payload: TikzRenderResponse, responseText: string): string {
  const latexError = payload.detail?.latex_error?.trim();
  if (latexError) {
    const errorLines = latexError
      .split("\n")
      .filter((line) => line.trim().startsWith("!"));
    const importantLine = errorLines.find((line) => !/fatal error/i.test(line))
      ?? errorLines.at(-1);
    return [payload.detail?.message, importantLine, latexError.slice(-700)]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 1200);
  }
  return (payload.error?.trim() || payload.detail?.message?.trim() || responseText.trim()).slice(0, 1200);
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

function decodeRenderedImage(imageBase64: string, mimeHint?: string): {
  body: Buffer;
  contentType: "image/svg+xml" | "image/png";
  extension: "svg" | "png";
} {
  const trimmed = imageBase64.trim();
  const dataUri = trimmed.match(/^data:(image\/(?:svg\+xml|png));base64,([\s\S]+)$/i);
  const hintedMime = dataUri?.[1]?.toLowerCase() ?? mimeHint?.toLowerCase();
  const contentType = hintedMime === "image/svg+xml" ? "image/svg+xml" : "image/png";
  const rawBase64 = dataUri?.[2] ?? trimmed;
  const body = Buffer.from(rawBase64, "base64");
  if (body.length === 0) throw new Error("TikZ renderer returned an empty image.");
  return { body, contentType, extension: contentType === "image/svg+xml" ? "svg" : "png" };
}

export async function storeTikzDataUri(imageDataUri: string): Promise<StoredTikzImage> {
  const decoded = decodeRenderedImage(imageDataUri);
  const hash = createHash("sha256").update(decoded.body).digest("hex");
  const key = `tikz-renders/${hash}.${decoded.extension}`;
  const uploaded = await uploadToR2({
    body: decoded.body,
    contentType: decoded.contentType,
    fileName: `${hash}.${decoded.extension}`,
    folder: "tikz-renders",
    objectKey: key,
    metadata: { source: "tikz-renderer", sha256: hash },
  });
  if (!uploaded.url) throw new Error("R2_PUBLIC_URL_REQUIRED");
  return { url: uploaded.url, key: uploaded.key, contentType: decoded.contentType };
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
export async function convertTikzToStoredImage(
  tikzCode: string,
  options: ConvertTikzOptions = {},
): Promise<StoredTikzImage> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const { signal, clear } = createTimeoutSignal(timeoutMs);

  try {
    const extraPreamble = detectExtraPreamble(tikzCode);
    const body: Record<string, string> = { tikz_code: tikzCode };
    if (extraPreamble) body.extra_preamble = extraPreamble;

    for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt += 1) {
      const response = await fetch(TIKZ_RENDER_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
        cache: "no-store",
      });

      const responseText = await response.text();
      let payload: TikzRenderResponse = {};
      try {
        payload = JSON.parse(responseText) as TikzRenderResponse;
      } catch {
        // The renderer can return a plain-text or HTML error for failed builds.
      }

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < MAX_RENDER_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 750));
          continue;
        }
        const detail = conciseRendererError(payload, responseText);
        const conciseDetail = detail ? ` — ${detail}` : "";
        throw new Error(`TikZ render HTTP ${response.status}: ${response.statusText}${conciseDetail}`);
      }

      if (payload.status !== "success" || !payload.image_base64) {
        throw new Error(payload.error ?? "TikZ render API returned an invalid response.");
      }

      const dataUri = toImageDataUri(payload.image_base64, payload.mime_type);
      return storeTikzDataUri(dataUri);
    }
    throw new Error("TikZ renderer did not return a result.");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`TikZ render timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clear();
  }
}

export async function convertTikzToImage(
  tikzCode: string,
  options: ConvertTikzOptions = {},
): Promise<string> {
  return (await convertTikzToStoredImage(tikzCode, options)).url;
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

async function migrateInlineRenderedImages(content: string): Promise<ProcessMathContentResult> {
  const tags = content.match(/<img\b[^>]*>/gi) ?? [];
  const dataUris = [...new Set(tags
    .filter((tag) => tag.includes("math-rendered-svg"))
    .map((tag) => tag.match(/\bsrc=["'](data:image\/(?:svg\+xml|png);base64,[^"']+)["']/i)?.[1])
    .filter((value): value is string => Boolean(value)))];
  if (dataUris.length === 0) return { content, convertedCount: 0, failedCount: 0 };

  let migrated = content;
  let convertedCount = 0;
  let failedCount = 0;
  await Promise.all(dataUris.map(async (dataUri) => {
    try {
      const stored = await storeTikzDataUri(dataUri);
      migrated = migrated.split(dataUri).join(stored.url);
      convertedCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error("Could not migrate inline TikZ image to R2:", error);
    }
  }));
  return { content: migrated, convertedCount, failedCount };
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
  const rendered = await convertBlocksToImages(
    content,
    TIKZPICTURE_RE,
    (block) => block,
    options,
  );
  const migrated = await migrateInlineRenderedImages(rendered.content);
  return {
    content: migrated.content,
    convertedCount: rendered.convertedCount + migrated.convertedCount,
    failedCount: rendered.failedCount + migrated.failedCount,
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
