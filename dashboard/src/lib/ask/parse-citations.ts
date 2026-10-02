import type { Cite } from "@/lib/citations";

export interface StatItem {
  label: string;
  value: string;
  delta?: string;
  direction?: "up" | "down" | "flat";
  good?: boolean;
  cite_n?: number | null;
  /** The exact search_trends_numeric term (see prompt.ts) — required on the model's output for
   *  any Trends-sourced stat. Used both to attach the real series below and to link out to the
   *  live Google Trends page for independent proof, since these stats never carry a cite_n. */
  term?: string;
  /** Real weekly Google Trends interest history, injected server-side (see api/ask/route.ts)
   *  by matching the model's declared "term" against tool results — never emitted by the
   *  model itself, which never sees these numbers. */
  series?: number[];
}

export interface ParsedAnswer {
  /** 2-4 headline bullets from the "## Key Takeaways" section, if the model included one. */
  takeaways: string[];
  /** Answer text with [n] markers intact; Key Takeaways/Stats/Sources sections stripped off. */
  body: string;
  /** Up to 4 headline figures from the "### Stats" section, if the model included one. */
  stats: StatItem[];
  citations: { n: number; cite: Cite }[];
}

// Pulls one "## Heading" / "### Heading" section (heading + everything up to the next
// ## or ### heading, or end of string) out of `text`, returning its inner content and
// the text with that whole span removed. Sections can be extracted in any order since
// each only touches its own heading + span.
function pullSection(text: string, headingPattern: RegExp): { content: string; rest: string } | null {
  const m = text.match(headingPattern);
  if (!m || m.index === undefined) return null;
  const start = m.index;
  const bodyStart = start + m[0].length;
  const after = text.slice(bodyStart);
  const next = after.match(/\n\s*#{2,3}\s/);
  const bodyEnd = next && next.index !== undefined ? bodyStart + next.index : text.length;
  return { content: text.slice(bodyStart, bodyEnd).trim(), rest: text.slice(0, start) + text.slice(bodyEnd) };
}

// Key Takeaways has no closing heading of its own — the prose body that follows it
// is unmarked — so it can't use pullSection's "up to the next heading" rule (that
// would swallow the entire body as "takeaways"). Instead, walk line-by-line from the
// heading and stop at the first line that isn't a bullet (or blank), capped at 6
// bullets as a backstop in case the body's own first paragraph happens to open with
// a markdown list too.
function pullTakeaways(text: string): { takeaways: string[]; rest: string } {
  const heading = text.match(/##\s*Key Takeaways\s*\n?/i);
  if (!heading || heading.index === undefined) return { takeaways: [], rest: text };
  const start = heading.index;
  const afterHeading = text.slice(start + heading[0].length);

  const takeaways: string[] = [];
  let consumed = 0;
  for (const line of afterHeading.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") {
      consumed += line.length + 1;
      continue;
    }
    if (/^[-*]\s+/.test(trimmed) && takeaways.length < 6) {
      takeaways.push(trimmed.replace(/^[-*]\s+/, ""));
      consumed += line.length + 1;
      continue;
    }
    break;
  }

  const rest = text.slice(0, start) + afterHeading.slice(consumed);
  return { takeaways, rest };
}

// Recovers whichever complete top-level {...} objects appear in a JSON-array fragment,
// tracking string state so braces inside quoted values (URLs, labels) don't miscount.
// Used when the array itself doesn't parse — almost always because generation got cut
// off by the token limit mid-object (long report/web citation lists are the main driver:
// a single Google News redirect URL can run 100+ chars). Salvaging what's complete means
// one truncated citation at the end doesn't take down every citation before it.
function salvageJsonObjects(raw: string): unknown[] {
  const items: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try { items.push(JSON.parse(raw.slice(start, i + 1))); } catch { /* skip malformed object */ }
        start = -1;
      }
    }
  }
  return items;
}

function pullJsonArray(text: string, headingPattern: RegExp): { arr: unknown[]; rest: string } {
  const pulled = pullSection(text, headingPattern);
  if (!pulled) return { arr: [], rest: text };
  // No closing ``` is expected when generation was cut off mid-fence — fall through to
  // end of string rather than failing to match at all.
  const jsonMatch = pulled.content.match(/```json\s*([\s\S]*?)(?:```|$)/i);
  if (!jsonMatch) return { arr: [], rest: pulled.rest };
  try {
    const arr = JSON.parse(jsonMatch[1]);
    return { arr: Array.isArray(arr) ? arr : [], rest: pulled.rest };
  } catch {
    return { arr: salvageJsonObjects(jsonMatch[1]), rest: pulled.rest };
  }
}

// The model is instructed (see prompt.ts) to structure its answer as an optional
// "## Key Takeaways" bullet list, the prose body, an optional "### Stats" json block,
// and an optional "### Sources" json block, in that order. This pulls all three
// structured sections out, leaving plain prose (with [n] markers intact) as the body.
export function parseAnswerCitations(raw: string): ParsedAnswer {
  const { arr: sourcesArr, rest: afterSources } = pullJsonArray(raw, /###\s*Sources\s*\n?/i);
  const citations = sourcesArr
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && typeof (c as Record<string, unknown>).n === "number" && ((c as Record<string, unknown>).kind === "report" || (c as Record<string, unknown>).kind === "web"))
    .map((c) => ({
      n: c.n as number,
      cite: {
        kind: c.kind as "report" | "web",
        report_id: typeof c.report_id === "string" ? c.report_id : undefined,
        url: typeof c.url === "string" ? c.url : undefined,
        page: typeof c.page === "number" ? c.page : undefined,
        label: typeof c.label === "string" ? c.label : undefined,
      },
    }))
    .sort((a, b) => a.n - b.n);

  const { arr: statsArr, rest: afterStats } = pullJsonArray(afterSources, /###\s*Stats\s*\n?/i);
  const stats = statsArr
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && typeof (s as Record<string, unknown>).label === "string" && typeof (s as Record<string, unknown>).value === "string")
    .slice(0, 4)
    .map((s) => ({
      label: s.label as string,
      value: s.value as string,
      delta: typeof s.delta === "string" ? s.delta : undefined,
      direction: (["up", "down", "flat"] as const).includes(s.direction as "up" | "down" | "flat") ? (s.direction as "up" | "down" | "flat") : undefined,
      good: typeof s.good === "boolean" ? s.good : undefined,
      cite_n: typeof s.cite_n === "number" ? s.cite_n : null,
      term: typeof s.term === "string" ? s.term : undefined,
      series: Array.isArray(s.series) && s.series.length > 1 && s.series.every((n) => typeof n === "number") ? (s.series as number[]) : undefined,
    }));

  const { takeaways, rest: body } = pullTakeaways(afterStats);

  return { takeaways, body: body.trim(), stats, citations };
}
