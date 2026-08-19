import { NextResponse } from "next/server";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";

// Live numbers for the methodology page: what's ingested, how fresh, how much is measured.
export async function GET() {
  try {
    const [sources, measures, synthesis] = await Promise.all([
      query(`
        SELECT COALESCE(source_tag, 'deck') AS tag,
               COUNT(*) AS reports,
               SUM(num_nodes) AS nodes,
               MAX(uploaded_at) AS last_upload
        FROM \`${PROJECT_ID}.${DATASET}.reports\`
        GROUP BY tag ORDER BY reports DESC
      `),
      query(`
        SELECT COUNT(*) AS measured_terms,
               COUNTIF(is_rising) AS rising,
               COUNTIF(has_data) AS with_data
        FROM \`${PROJECT_ID}.${DATASET}.trend_searches\`
      `),
      query(`
        SELECT
          (SELECT COUNT(*) FROM \`${PROJECT_ID}.${DATASET}.codex_megatrends\` WHERE dossier IS NOT NULL) AS dossiers,
          (SELECT COUNT(*) FROM \`${PROJECT_ID}.${DATASET}.discovered_nodes\`) AS web_finds,
          (SELECT COUNT(*) FROM \`${PROJECT_ID}.${DATASET}.trend_map_nodes\`) AS map_nodes,
          (SELECT COUNT(*) FROM \`${PROJECT_ID}.${DATASET}.lab_ideas\`) AS lab_ideas,
          (SELECT COUNT(*) FROM \`${PROJECT_ID}.${DATASET}.tyson_products\`) AS tyson_skus
      `),
    ]);

    return NextResponse.json({ sources, measures: measures[0], synthesis: synthesis[0] });
  } catch (error) {
    console.error("Methodology stats failed:", error);
    return NextResponse.json({ error: "Failed to fetch methodology stats" }, { status: 500 });
  }
}
