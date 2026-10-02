// Browser-only helper: download a file from a route handler with fetch, so a
// failure can be shown on the page (toast) instead of opening a blank error
// page. Returns null on success, or the error text to show.

const XLSX_TYPE = "spreadsheetml";

export async function fetchDownload(
  url: string,
  init: RequestInit,
  fallbackName: string,
  fallbackError: string,
): Promise<string | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return (await res.text()) || fallbackError;
    // A guard redirect (session expired) ends on an HTML page, not a file.
    if (!res.headers.get("Content-Type")?.includes(XLSX_TYPE)) return fallbackError;
    const name = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get("Content-Disposition") ?? "")?.[1];
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = href;
    a.download = name ? decodeURIComponent(name) : fallbackName;
    a.click();
    URL.revokeObjectURL(href);
    return null;
  } catch {
    return fallbackError;
  }
}
