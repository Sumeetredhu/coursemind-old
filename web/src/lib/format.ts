import type { Citation, Source } from "./types";

export function clock(seconds: number | null | undefined) {
  const total = Math.floor(seconds ?? 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}

export function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function shortLabel(citation: Citation) {
  return citation.kind === "youtube" ? clock(citation.start) : `p. ${citation.page}`;
}

export function wholeSource(source: Source): Citation {
  return {
    id: `source-${source.id}`,
    source_id: source.id,
    title: source.title,
    kind: source.kind,
    page: source.kind === "pdf" ? 1 : null,
    bbox: null,
    start: source.kind === "youtube" ? 0 : null,
    end: null,
    video_id: source.video_id,
    label: source.kind === "youtube" ? "from the start" : "page 1",
    snippet: "",
  };
}

export function sourceMeta(source: Source) {
  if (source.kind === "youtube") {
    return source.duration_sec ? `Video · ${clock(source.duration_sec)}` : "Video";
  }
  return source.page_count ? `PDF · ${plural(source.page_count, "page")}` : "PDF";
}
