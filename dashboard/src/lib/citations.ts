import { apiUrl } from "@/lib/api";

// Shared citation contract — every synthesized claim in TrendLens resolves to either
// an internal report page (served via /api/file/[id]) or an external URL.
export interface Cite {
  kind: "report" | "web";
  report_id?: string;
  url?: string;
  label?: string;
  page?: number;
}

export interface CitedSegment { text: string; cite?: Cite | null }

// Stable identity for a citation: same doc+page (or same URL) = same reference number.
export function citeKey(cite?: Cite | null): string | null {
  if (!cite) return null;
  if (cite.kind === "web" && cite.url) return `w|${cite.url}`;
  if (cite.report_id) return `r|${cite.report_id}|${cite.page ?? ""}`;
  return null;
}

export function citeHref(cite: Cite): string | null {
  if (cite.kind === "web" && cite.url) return cite.url;
  // Local: Next /api/file/[id] reads local disk. Hosted: FastAPI /api/trends/file/{id}
  // streams the same document from GCS (pushed by src/push_sources_gcs.py).
  if (cite.report_id) return apiUrl(`/file/${cite.report_id}${cite.page ? `#page=${cite.page}` : ""}`);
  return null;
}

export interface RefEntry { n: number; cite: Cite }

// Assigns stable sequential numbers to citations in first-seen (display) order —
// the same document+page (or URL) always resolves to the same number. Callers decide
// their own traversal order by calling `add` in the order citations should be numbered.
export function createRefTracker() {
  const map = new Map<string, number>();
  const list: RefEntry[] = [];
  function add(c?: Cite | null) {
    const k = citeKey(c);
    if (!k || !c || map.has(k)) return;
    map.set(k, map.size + 1);
    list.push({ n: map.size, cite: c });
  }
  function refFor(c?: Cite | null): number | undefined {
    const k = citeKey(c);
    return k ? map.get(k) : undefined;
  }
  return { add, refFor, list };
}
