import type { Cite } from "@/lib/citations";

export interface StatItem {
  label: string;
  value: string;
  delta?: string;
  direction?: "up" | "down" | "flat";
  good?: boolean;
  cite_n?: number | null;
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
    }));

  const { takeaways, rest: body } = pullTakeaways(afterStats);

  return dedupeCitations({ takeaways, body: body.trim(), stats, citations });
}

// The prompt asks the model to reuse one number per source, but it still sometimes lists the
// same file under two numbers (e.g. [10] and [11] both rep_x p.2). Mechanical backstop: merge
// citations that point at the same file (report_id, or exact URL), keep the first one's page,
// renumber 1..N in order, and rewrite every [n] marker and stat cite_n to match.
function dedupeCitations(parsed: ParsedAnswer): ParsedAnswer {
  const keyOf = (c: Cite) => (c.kind === "web" ? `web:${c.url}` : `report:${c.report_id}`);
  const newNByKey = new Map<string, number>();
  const kept: { n: number; cite: Cite }[] = [];
  const remap = new Map<number, number>();
  for (const c of parsed.citations) {
    const key = keyOf(c.cite);
    let n = newNByKey.get(key);
    if (n === undefined) {
      n = kept.length + 1;
      newNByKey.set(key, n);
      kept.push({ n, cite: c.cite });
    }
    remap.set(c.n, n);
  }

  // Markers with no matching source (generation cut off before the Sources block finished, or
  // the model never listed it) would render as dead brackets, so they are removed outright.
  const rewrite = (text: string) =>
    text
      .replace(/([ \t]?)\[(\d+)\]/g, (m, ws, d) => (remap.has(Number(d)) ? `${ws}[${remap.get(Number(d))}]` : ""))
      // [3][3] left behind when two numbers merged
      .replace(/(\[(\d+)\])(?:\s*\[\2\])+/g, "$1");

  return {
    takeaways: parsed.takeaways.map(rewrite),
    body: rewrite(parsed.body),
    stats: parsed.stats.map((s) => ({ ...s, cite_n: s.cite_n != null && remap.has(s.cite_n) ? remap.get(s.cite_n)! : s.cite_n })),
    citations: kept,
  };
}
