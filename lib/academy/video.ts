import type { VideoProvider } from "@/lib/db/types";

export interface ParsedVideo {
  provider: VideoProvider;
  /** A canonical, embeddable URL safe to place in an <iframe src>. */
  embedUrl: string;
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com"]);

/** YouTube video ids are URL-safe base64-ish tokens. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]+$/;

function youtube(id: string): ParsedVideo | null {
  if (!id || !YOUTUBE_ID.test(id)) return null;
  return { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
}

function vimeo(id: string): ParsedVideo | null {
  if (!/^\d+$/.test(id)) return null;
  return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
}

/**
 * Parse a user-supplied video URL into a canonical embed URL, accepting ONLY
 * YouTube and Vimeo. Returns null for anything else — an unknown host, a
 * non-http(s) protocol, or a malformed URL — so admins can never inject an
 * arbitrary <iframe src> (e.g. javascript:/data: or a look-alike host).
 *
 * Host matching uses the parsed URL hostname (not substring checks), so
 * "vimeo.com.evil.com" is correctly rejected.
 */
export function parseVideoUrl(input: string): ParsedVideo | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();

  if (host === "youtu.be") {
    return youtube(url.pathname.split("/").filter(Boolean)[0] ?? "");
  }

  if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === "/watch") {
      return youtube(url.searchParams.get("v") ?? "");
    }
    const embed = url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/);
    return embed ? youtube(embed[1]) : null;
  }

  if (host === "player.vimeo.com") {
    const m = url.pathname.match(/^\/video\/(\d+)/);
    return m ? vimeo(m[1]) : null;
  }

  if (VIMEO_HOSTS.has(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    return vimeo(segments[segments.length - 1] ?? "");
  }

  return null;
}
