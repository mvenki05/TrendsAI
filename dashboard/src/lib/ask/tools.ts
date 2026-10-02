import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";
import type { Cite, CitedSegment } from "@/lib/citations";

const T = `\`${PROJECT_ID}.${DATASET}`;
const LIMIT = 6;

// ---------------------------------------------------------------------------
// Tool schemas (OpenAI-compatible function-calling format, as served by the
// LiteLLM gateway) — Claude decides which of these to call, and how many times,
// while answering a question.
// ---------------------------------------------------------------------------

export const TOOL_DEFS = [
  {
    type: "function" as const,
    function: {
      name: "search_megatrends",
      description:
        "Search the Megatrend Codex — TrendLens's 10 canonical, fully-synthesized, fully-cited megatrend dossiers " +
        "(definition, what's happening now, horizons, key stats, subtrends, Tyson opportunities, white space). " +
        "This is the richest and most authoritative source in the system — check it first for any question about " +
        "a trend, a consumer behavior, or 'what should Tyson do about X'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keywords describing the trend or topic, e.g. 'clean label', 'GLP-1', 'value seeking'." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_report_text",
      description:
        "Full-text search over the actual body text of ingested reports (every page/slide, not just what got extracted " +
        "into taxonomy items). Use this when search_megatrends / search_reports_and_taxonomy / search_insights don't " +
        "surface a specific passage-level fact or stat you'd expect a report to contain — e.g. a precise figure, a named " +
        "study, or wording tied to one exact page. Returns snippets with the report and page number for citation.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keywords or phrase likely to appear verbatim near the fact, e.g. 'portion size' or 'GLP-1'." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_reports_and_taxonomy",
      description:
        "Search ingested source reports (agency decks, Mintel, Hartman Group, Tyson digests) and the taxonomy " +
        "extracted from them (megatrend/subtrend/product/ingredient/behaviour items). Use for 'which report(s) " +
        "cover X' or to find a specific extracted item and which document it came from.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keywords to search report titles/filenames and extracted item names/descriptions." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_insights",
      description:
        "Search Tyson's monthly internal digest insight cards and the cross-document themes clustered from them " +
        "(learnings, implications, recommendations, survey questions). Use for 'what has Tyson's own research said " +
        "about X' or questions about internal digest themes.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keywords to search insight card/theme text." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_ideas",
      description:
        "Search Tyson innovation product concepts, White Space Scout ideas (novel products found on the open web), " +
        "and web-discovered/trend-map signals — all with permission tiers, novelty scores, or web sources where " +
        "available. Use for 'what product ideas exist for X' or 'what's novel/emerging around X'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keywords describing the product concept or trend signal." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_trends_numeric",
      description:
        "Look up actual Google Trends search-interest measurements TrendLens has captured for a specific term " +
        "(current interest 0-100, year-over-year % change, whether it's rising). Checks both terms extracted from " +
        "ingested reports AND terms measured on-demand for a past chat question. Use whenever a question asks " +
        "about real demand/popularity numbers for a specific food, ingredient, or product term. If it returns " +
        "nothing, say plainly that TrendLens has no measurement for that exact term — do not estimate or guess.",
      parameters: {
        type: "object",
        properties: {
          term: { type: "string", description: "The specific term to look up, e.g. 'protein chips', 'birria tacos'." },
        },
        required: ["term"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_tyson_products",
      description:
        "Look up Tyson's actual existing product catalog (~6,300 SKUs) by category, brand, or keyword. Use to check " +
        "whether Tyson already has a product in a given space before claiming something is white space.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "A category, brand, or product keyword, e.g. 'frozen value-added poultry', 'Jimmy Dean'." },
        },
        required: ["query"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Curated dossier shape returned to the model — the full dossier JSON is large
// (100-200KB); this trims it to what's useful for answering while preserving
// every embedded Cite object so the final answer can reuse the same citations
// the Megatrend Codex page itself uses.
// ---------------------------------------------------------------------------

interface DossierJSON {
  key: string;
  name: string;
  tagline?: string;
  definition?: string;
  definition_cited?: CitedSegment[];
  why_it_matters_to_tyson?: string;
  now?: string;
  now_cited?: CitedSegment[];
  key_stats?: { stat: string; cite?: Cite }[];
  subtrends?: { name: string; description?: string; geo?: string | null; opportunities?: { name: string; concept: string; tyson_fit?: { tier?: string } }[] }[];
  horizons?: Record<"short" | "medium" | "long", { title: string; detail: string; cite?: Cite }[]>;
  demand?: { summary?: string; risers?: { term: string; yoy: number }[]; decliners?: { term: string; yoy: number }[] };
  tyson_questions?: (string | { question: string; cite?: Cite | null })[];
  whitespace?: { name: string; note?: string; cite?: Cite }[];
}

function curateDossier(raw: string) {
  let d: DossierJSON;
  try { d = JSON.parse(raw); } catch { return null; }
  return {
    key: d.key,
    name: d.name,
    tagline: d.tagline,
    definition: d.definition,
    definition_cited: d.definition_cited,
    why_it_matters_to_tyson: d.why_it_matters_to_tyson,
    now: d.now,
    now_cited: d.now_cited,
    key_stats: d.key_stats?.slice(0, 8),
    subtrends: d.subtrends?.slice(0, 5).map((s) => ({
      name: s.name,
      description: s.description,
      geo: s.geo,
      top_opportunities: s.opportunities?.slice(0, 2).map((o) => ({ name: o.name, concept: o.concept, tier: o.tyson_fit?.tier })),
    })),
    horizons: d.horizons && {
      short: d.horizons.short?.slice(0, 4),
      medium: d.horizons.medium?.slice(0, 4),
      long: d.horizons.long?.slice(0, 4),
    },
    demand: d.demand && {
      summary: d.demand.summary,
      risers: d.demand.risers?.slice(0, 5),
      decliners: d.demand.decliners?.slice(0, 5),
    },
    tyson_questions: d.tyson_questions?.slice(0, 8),
    whitespace: d.whitespace?.slice(0, 6),
  };
}

async function searchMegatrends(q: string) {
  const rows = await query<{ key: string; name: string; tagline: string | null; rank: number | null; dossier: string | null }>(
    `SELECT key, name, tagline, rank, dossier FROM ${T}.codex_megatrends\`
     WHERE SEARCH(name, @q) OR SEARCH(tagline, @q) OR SEARCH(dossier, @q)
     ORDER BY STARTS_WITH(LOWER(name), LOWER(@q)) DESC, rank
     LIMIT 3`,
    { q },
  );
  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    tagline: r.tagline,
    rank: r.rank,
    dossier: r.dossier ? curateDossier(r.dossier) : null,
  }));
}

// Trims a full page/slide of text down to a window around the first matching query
// token, so the model gets the relevant sentence(s) rather than a whole page of tokens.
// SEARCH() matches tokens regardless of order/adjacency, so — unlike a plain substring
// lookup — the query as a whole phrase may not appear verbatim; fall back to whichever
// individual token hits earliest in the text.
function snippetAround(text: string, q: string, radius = 500): string {
  const lower = text.toLowerCase();
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  let idx = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i !== -1 && (idx === -1 || i < idx)) idx = i;
  }
  if (idx === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + radius);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

async function searchReportText(q: string) {
  const rows = await query<{ report_id: string; page: number | null; text: string; title: string | null; filename: string }>(
    `SELECT c.report_id, c.page, c.text, r.title, r.filename
     FROM ${T}.report_text_chunks\` c
     JOIN ${T}.reports\` r USING (report_id)
     WHERE SEARCH(c.text, @q)
     ORDER BY c.report_id, c.page
     LIMIT ${LIMIT}`,
    { q },
  );
  return rows.map((r) => ({
    report_id: r.report_id,
    page: r.page,
    label: r.title || r.filename,
    snippet: snippetAround(r.text, q),
    cite: { kind: "report" as const, report_id: r.report_id, page: r.page ?? undefined, label: r.title || r.filename },
  }));
}

async function searchReportsAndTaxonomy(q: string) {
  const [reports, nodes] = await Promise.all([
    query<{ report_id: string; title: string | null; filename: string; source_type: string | null; document_date: string | null; source_tag: string | null }>(
      `SELECT report_id, title, filename, source_type, document_date, source_tag FROM ${T}.reports\`
       WHERE SEARCH(title, @q) OR SEARCH(filename, @q)
       ORDER BY STARTS_WITH(LOWER(title), LOWER(@q)) DESC, uploaded_at DESC
       LIMIT ${LIMIT}`,
      { q },
    ),
    query<{ report_id: string; name: string; description: string | null; level: string; megatrend_name: string | null; subtrend_name: string | null }>(
      `SELECT report_id, name, description, level, megatrend_name, subtrend_name FROM ${T}.taxonomy_nodes\`
       WHERE (SEARCH(name, @q) OR SEARCH(description, @q)) AND level != 'megatrend'
       ORDER BY STARTS_WITH(LOWER(name), LOWER(@q)) DESC
       LIMIT ${LIMIT}`,
      { q },
    ),
  ]);
  return { reports, taxonomy_items: nodes };
}

async function searchInsights(q: string) {
  const [cards, themes] = await Promise.all([
    query<{ card_id: string; report_id: string; source_kind: string; month: string; learning: string | null; implication: string | null; recommendations: string | null; theme: string | null; filename: string }>(
      `SELECT c.card_id, c.report_id, c.source_kind, c.month, c.learning, c.implication, c.recommendations, c.theme, r.filename
       FROM ${T}.insight_cards\` c
       JOIN ${T}.reports\` r USING (report_id)
       WHERE SEARCH(c.learning, @q) OR SEARCH(c.implication, @q)
          OR SEARCH(c.recommendations, @q) OR SEARCH(c.theme, @q)
       ORDER BY c.month DESC
       LIMIT ${LIMIT}`,
      { q },
    ),
    query<{ theme_id: string; name: string; description: string | null; card_count: number | null; month_count: number | null; combined_implication: string | null }>(
      `SELECT theme_id, name, description, card_count, month_count, combined_implication
       FROM ${T}.insight_themes\`
       WHERE SEARCH(name, @q) OR SEARCH(description, @q) OR SEARCH(combined_implication, @q)
       ORDER BY month_count DESC
       LIMIT ${LIMIT}`,
      { q },
    ),
  ]);
  return { digest_cards: cards, cross_document_themes: themes };
}

async function searchIdeas(q: string) {
  const [ideas, labIdeas, discovered, mapNodes] = await Promise.all([
    query<{ idea_id: string; megatrend: string; name: string; description: string | null; tyson_brand: string | null; permission_tier: string | null; validation: string | null }>(
      `SELECT idea_id, megatrend, name, description, tyson_brand, permission_tier, validation
       FROM ${T}.innovation_ideas\`
       WHERE SEARCH(name, @q) OR SEARCH(description, @q) OR SEARCH(evidence, @q)
       LIMIT ${LIMIT}`,
      { q },
    ),
    query<{ name: string; description: string | null; wow: string | null; novelty_score: number | null; sources: string | null }>(
      `SELECT name, description, wow, novelty_score, sources
       FROM ${T}.lab_ideas\`
       WHERE run_id = (SELECT run_id FROM ${T}.lab_ideas\` ORDER BY created_at DESC LIMIT 1)
         AND (SEARCH(name, @q) OR SEARCH(description, @q))
       LIMIT ${LIMIT}`,
      { q },
    ).catch(() => []),
    query<{ name: string; description: string | null; megatrend: string; sources: string | null }>(
      `SELECT name, description, megatrend, sources
       FROM ${T}.discovered_nodes\`
       WHERE level != 'megatrend' AND (SEARCH(name, @q) OR SEARCH(description, @q))
       LIMIT ${LIMIT}`,
      { q },
    ).catch(() => []),
    query<{ name: string; description: string | null; megatrend_name: string | null; sources: string | null }>(
      `SELECT name, description, megatrend_name, sources
       FROM ${T}.trend_map_nodes\`
       WHERE level != 'megatrend' AND (SEARCH(name, @q) OR SEARCH(description, @q))
       LIMIT ${LIMIT}`,
      { q },
    ).catch(() => []),
  ]);
  const parseSources = <R extends { sources: string | null }>(rows: R[]) =>
    rows.map((r) => ({ ...r, sources: r.sources ? JSON.parse(r.sources) : [] }));
  return {
    tyson_innovation_concepts: ideas,
    white_space_scout_ideas: parseSources(labIdeas),
    web_discovered_signals: parseSources(discovered),
    trend_map_signals: parseSources(mapNodes),
  };
}

async function searchTrendsNumeric(term: string) {
  // interest_series (12 months of weekly Google Trends ints, as a JSON string) rides along
  // on every row here purely so the API route can pull real sparkline data out of it — the
  // route strips it back off before the row goes to the model, to avoid spending tokens on
  // a 52-number array it doesn't need to see.
  const [fromReports, adhoc] = await Promise.all([
    query<{ term: string; node_name: string | null; megatrend_name: string | null; subtrend_name: string | null; current_interest: number | null; yoy_growth: number | null; is_rising: boolean | null; interest_series: string | null }>(
      `SELECT term, node_name, megatrend_name, subtrend_name, current_interest, yoy_growth, is_rising, interest_series
       FROM ${T}.trend_searches\`
       WHERE SEARCH(term, @q) OR SEARCH(node_name, @q)
       ORDER BY week_of DESC
       LIMIT ${LIMIT}`,
      { q: term },
    ),
    // Terms measured on-demand for a past chat question (see scripts/measure_term.py) —
    // covers terms that were never part of an ingested report's taxonomy.
    query<{ term: string; current_interest: number | null; yoy_growth: number | null; is_rising: boolean | null; classification: string | null; interest_series: string | null }>(
      `SELECT term, current_interest, yoy_growth, is_rising, classification, interest_series
       FROM ${T}.chat_trend_lookups\`
       WHERE SEARCH(term, @q)
       ORDER BY measured_at DESC
       LIMIT ${LIMIT}`,
      { q: term },
    ).catch(() => []),
  ]);
  return {
    from_report_taxonomy: fromReports,
    on_demand_measurements: adhoc,
  };
}

async function listTysonProducts(q: string) {
  return query<{ item: string | null; brand: string | null; category: string | null; segment: string | null }>(
    `SELECT item, brand, category, segment
     FROM ${T}.tyson_products\`
     WHERE SEARCH(item, @q) OR SEARCH(brand, @q) OR SEARCH(category, @q) OR SEARCH(segment, @q)
     LIMIT 15`,
    { q },
  );
}

export async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  // SEARCH() (unlike CONTAINS_SUBSTR) errors on a query with no tokens, so a blank
  // arg must be rejected here rather than reaching BigQuery.
  const q = String(args.query ?? args.term ?? "").trim();
  if (!q) return { error: "Empty search query — provide keywords to search for." };

  switch (name) {
    case "search_megatrends":
      return searchMegatrends(q);
    case "search_report_text":
      return searchReportText(q);
    case "search_reports_and_taxonomy":
      return searchReportsAndTaxonomy(q);
    case "search_insights":
      return searchInsights(q);
    case "search_ideas":
      return searchIdeas(q);
    case "search_trends_numeric":
      return searchTrendsNumeric(q);
    case "list_tyson_products":
      return listTysonProducts(q);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
