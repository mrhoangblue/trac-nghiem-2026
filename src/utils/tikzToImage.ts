const TIKZ_RENDER_ENDPOINT =
  process.env.TIKZ_RENDER_ENDPOINT ?? "https://frankii1990-tikz-render.hf.space/render";

const DEFAULT_TIMEOUT_MS = 30_000;

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

function createTimeoutSignal(timeoutMs: number): {
  signal: AbortSignal;
  clear: () => void;
} {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function toPngDataUrl(imageBase64: string): string {
  const trimmed = imageBase64.trim();
  if (trimmed.startsWith("data:image/")) return trimmed;
  return `data:image/png;base64,${trimmed}`;
}

function buildTikzImageTag(imageSrc: string): string {
  return `<img src="${imageSrc}" alt="TikZ Diagram" class="tikz-image mx-auto my-2 max-w-full" />`;
}

/**
 * Calls the Hugging Face TikZ renderer and returns a browser-ready PNG data URL.
 *
 * Server-side only by design: call this from Route Handlers, Server Actions, or
 * other server utilities so the upload flow stores rendered images in Firestore.
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
      headers: {
        "Content-Type": "application/json",
      },
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

/**
 * Finds all \begin{tikzpicture}...\end{tikzpicture} blocks inside a content
 * string, renders each block to PNG, and replaces successful blocks with <img>.
 *
 * Failed blocks are intentionally kept unchanged so one bad diagram does not
 * break the whole upload.
 */
export async function processTikzToImagesWithStats(
  content: string,
  options: ConvertTikzOptions = {},
): Promise<ProcessMathContentResult> {
  const tikzBlockRegex =
    /\\begin\{tikzpicture\}(?:\s*\[[^\]]*\])?[\s\S]*?\\end\{tikzpicture\}/g;
  const tikzBlocks = Array.from(content.matchAll(tikzBlockRegex), (match) => match[0]);

  if (tikzBlocks.length === 0) {
    return {
      content,
      convertedCount: 0,
      failedCount: 0,
    };
  }

  const uniqueBlocks = [...new Set(tikzBlocks)];
  const conversions = new Map<string, string>();
  let failedCount = 0;

  await Promise.all(
    uniqueBlocks.map(async (tikzBlock) => {
      try {
        const imageSrc = await convertTikzToImage(tikzBlock, options);
        conversions.set(tikzBlock, buildTikzImageTag(imageSrc));
      } catch (error) {
        failedCount += tikzBlocks.filter((block) => block === tikzBlock).length;
        console.error("Failed to convert TikZ block:", error);
      }
    }),
  );

  let processedContent = content;
  for (const [tikzBlock, imageTag] of conversions) {
    processedContent = processedContent.split(tikzBlock).join(imageTag);
  }

  return {
    content: processedContent,
    convertedCount: tikzBlocks.length - failedCount,
    failedCount,
  };
}

export async function processTikzToImages(
  content: string,
  options: ConvertTikzOptions = {},
): Promise<string> {
  const result = await processTikzToImagesWithStats(content, options);
  return result.content;
}

// Backward-compatible names used by older code paths in this project.
export const processMathContentWithStats = processTikzToImagesWithStats;
export const processMathContent = processTikzToImages;
