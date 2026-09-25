import type { ClassResourceType } from "@/utils/classroomTypes";

export interface NormalizedResourceLink {
  url: string;
  embedUrl: string;
  provider: string;
}

function googleFileId(url: URL): string | null {
  const pathMatch = url.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return pathMatch?.[1] ?? url.searchParams.get("id");
}

export function normalizeResourceLink(
  rawUrl: string,
  type: ClassResourceType,
): NormalizedResourceLink | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "youtu.be" || host.endsWith("youtube.com")) {
    const videoId = host === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0]
      : url.searchParams.get("v")
        ?? url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1];
    if (videoId) {
      return {
        url: url.toString(),
        embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
        provider: "YouTube",
      };
    }
  }

  if (host === "vimeo.com" || host.endsWith("player.vimeo.com")) {
    const videoId = url.pathname.match(/(?:video\/)?(\d+)/)?.[1];
    if (videoId) {
      return {
        url: url.toString(),
        embedUrl: `https://player.vimeo.com/video/${videoId}`,
        provider: "Vimeo",
      };
    }
  }

  if (host === "drive.google.com") {
    const fileId = googleFileId(url);
    if (fileId) {
      return {
        url: url.toString(),
        embedUrl: `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`,
        provider: "Google Drive",
      };
    }
  }

  if (host === "docs.google.com" && url.pathname.includes("/presentation/")) {
    const fileId = googleFileId(url);
    if (fileId) {
      return {
        url: url.toString(),
        embedUrl: `https://docs.google.com/presentation/d/${encodeURIComponent(fileId)}/embed?start=false&loop=false&delayms=3000`,
        provider: "Google Slides",
      };
    }
  }

  const provider = type === "pdf" ? "Tài liệu trực tuyến" : type === "slides" ? "Bài trình chiếu" : "Video trực tuyến";
  return { url: url.toString(), embedUrl: url.toString(), provider };
}
