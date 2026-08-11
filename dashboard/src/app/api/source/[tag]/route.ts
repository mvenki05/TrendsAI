import { NextResponse } from "next/server";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";

const ALLOWED_TAGS = new Set(["mintel", "tyson", "hartman"]);

// Tagged-source intelligence: every report with the given source_tag plus its
// full extracted taxonomy (megatrends -> subtrends -> evidence nodes).
export async function GET(_req: Request, { params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  if (!ALLOWED_TAGS.has(tag)) {
    return NextResponse.json({ error: "Unknown source tag" }, { status: 404 });
  }
  try {
    const [reports, nodes] = await Promise.all([
      query(`
        SELECT report_id, filename, title, document_date, num_megatrends, num_nodes, uploaded_at
        FROM \`${PROJECT_ID}.${DATASET}.reports\`
        WHERE source_tag = '${tag}'
        ORDER BY uploaded_at DESC
      `),
      query(`
        SELECT n.node_id, n.report_id, n.parent_id, n.level, n.name, n.description,
               n.search_term, n.megatrend_name, n.subtrend_name,
               ts.yoy_growth, ts.is_rising, ts.has_data
        FROM \`${PROJECT_ID}.${DATASET}.taxonomy_nodes\` n
        JOIN \`${PROJECT_ID}.${DATASET}.reports\` r USING (report_id)
        LEFT JOIN \`${PROJECT_ID}.${DATASET}.trend_searches\` ts
          ON ts.node_id = n.node_id AND ts.report_id = n.report_id
        WHERE r.source_tag = '${tag}'
        ORDER BY n.report_id, n.megatrend_name, n.subtrend_name, n.level
      `),
    ]);
    return NextResponse.json({ reports, nodes });
  } catch (error) {
    console.error(`Failed to fetch ${tag} data:`, error);
    return NextResponse.json({ error: "Failed to fetch source data" }, { status: 500 });
  }
}
