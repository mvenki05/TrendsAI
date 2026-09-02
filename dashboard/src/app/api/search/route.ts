import { NextResponse } from "next/server";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";

// Global search: one shallow lookup per content type, merged and grouped client-side.
// CONTAINS_SUBSTR is a case-insensitive substring match — no LIKE-wildcard escaping needed.

export interface SearchResult {
  type: "codex" | "report" | "node" | "idea" | "lab" | "map" | "theme" | "discovery";
  title: string;
  subtitle?: string;
  href: string;
}

const T = `\`${PROJECT_ID}.${DATASET}`;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const params = { q };
  const LIMIT = 6;

  try {
    const [codex, reports, nodes, ideas, lab, map, themes, discovered] = await Promise.all([
      query<{ key: string; name: string; tagline: string | null }>(
        `SELECT key, name, tagline FROM ${T}.codex_megatrends\`
         WHERE CONTAINS_SUBSTR(name, @q) OR CONTAINS_SUBSTR(tagline, @q)
         ORDER BY STARTS_WITH(LOWER(name), LOWER(@q)) DESC, rank LIMIT ${LIMIT}`,
        params
      ),
      query<{ report_id: string; title: string | null; filename: string; source_type: string | null }>(
        `SELECT report_id, title, filename, source_type FROM ${T}.reports\`
         WHERE CONTAINS_SUBSTR(title, @q) OR CONTAINS_SUBSTR(filename, @q)
         ORDER BY STARTS_WITH(LOWER(title), LOWER(@q)) DESC, uploaded_at DESC LIMIT ${LIMIT}`,
        params
      ),
      query<{ report_id: string; name: string; level: string; megatrend_name: string | null }>(
        `SELECT report_id, name, level, megatrend_name FROM ${T}.taxonomy_nodes\`
         WHERE CONTAINS_SUBSTR(name, @q) AND level != 'megatrend'
         ORDER BY STARTS_WITH(LOWER(name), LOWER(@q)) DESC LIMIT ${LIMIT}`,
        params
      ),
      query<{ name: string; megatrend: string | null; permission_tier: string | null }>(
        `SELECT name, megatrend, permission_tier FROM ${T}.innovation_ideas\`
         WHERE CONTAINS_SUBSTR(name, @q) OR CONTAINS_SUBSTR(description, @q)
         ORDER BY STARTS_WITH(LOWER(name), LOWER(@q)) DESC LIMIT ${LIMIT}`,
        params
      ),
      query<{ name: string; description: string | null }>(
        `SELECT name, description FROM ${T}.lab_ideas\`
         WHERE run_id = (SELECT run_id FROM ${T}.lab_ideas\` ORDER BY created_at DESC LIMIT 1)
           AND (CONTAINS_SUBSTR(name, @q) OR CONTAINS_SUBSTR(description, @q))
         ORDER BY STARTS_WITH(LOWER(name), LOWER(@q)) DESC LIMIT ${LIMIT}`,
        params
      ),
      query<{ name: string; megatrend_name: string | null }>(
        `SELECT name, megatrend_name FROM ${T}.trend_map_nodes\`
         WHERE CONTAINS_SUBSTR(name, @q) AND level != 'megatrend'
         ORDER BY STARTS_WITH(LOWER(name), LOWER(@q)) DESC LIMIT ${LIMIT}`,
        params
      ),
      query<{ name: string; description: string | null }>(
        `SELECT name, description FROM ${T}.insight_themes\`
         WHERE CONTAINS_SUBSTR(name, @q) OR CONTAINS_SUBSTR(description, @q)
         ORDER BY STARTS_WITH(LOWER(name), LOWER(@q)) DESC LIMIT ${LIMIT}`,
        params
      ),
      query<{ name: string; megatrend: string | null; description: string | null }>(
        `SELECT name, megatrend, description FROM ${T}.discovered_nodes\`
         WHERE level != 'megatrend' AND (CONTAINS_SUBSTR(name, @q) OR CONTAINS_SUBSTR(description, @q))
         ORDER BY STARTS_WITH(LOWER(name), LOWER(@q)) DESC LIMIT ${LIMIT}`,
        params
      ),
    ]);

    const results: SearchResult[] = [
      ...codex.map((r) => ({ type: "codex" as const, title: r.name, subtitle: r.tagline ?? undefined, href: `/best?key=${r.key}` })),
      ...reports.map((r) => ({ type: "report" as const, title: r.title || r.filename, subtitle: r.source_type ?? undefined, href: `/report/${r.report_id}` })),
      ...nodes.map((r) => ({ type: "node" as const, title: r.name, subtitle: [r.level, r.megatrend_name].filter(Boolean).join(" · "), href: `/report/${r.report_id}` })),
      ...ideas.map((r) => ({ type: "idea" as const, title: r.name, subtitle: [r.megatrend, r.permission_tier].filter(Boolean).join(" · "), href: `/ideas` })),
      ...lab.map((r) => ({ type: "lab" as const, title: r.name, subtitle: r.description ?? undefined, href: `/lab` })),
      ...map.map((r) => ({ type: "map" as const, title: r.name, subtitle: r.megatrend_name ?? undefined, href: `/map` })),
      ...themes.map((r) => ({ type: "theme" as const, title: r.name, subtitle: r.description ?? undefined, href: `/tyson` })),
      ...discovered.map((r) => ({ type: "discovery" as const, title: r.name, subtitle: r.megatrend ?? undefined, href: `/discover` })),
    ];

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search failed:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
