import { NextResponse } from "next/server";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";

// Maps OneDrive/SharePoint folder labels → short source tag used by SOURCE_META in the UI
const FOLDER_TAG: Record<string, string> = {
  "Secondary Resource Library": "kantar",
  "Trend Reports (SharePoint Central)": "trend_central",
};

// Live numbers for the methodology page: what's ingested, how fresh, how much is measured.
export async function GET() {
  try {
    const [sources, sharepointFiles, measures, synthesis] = await Promise.all([
      query(`
        SELECT COALESCE(source_tag, 'deck') AS tag,
               COUNT(*) AS reports,
               SUM(num_nodes) AS nodes,
               MAX(uploaded_at) AS last_upload
        FROM \`${PROJECT_ID}.${DATASET}.reports\`
        GROUP BY tag ORDER BY reports DESC
      `),
      query(`
        SELECT source_folder,
               COUNT(*) AS file_count,
               COUNTIF(ingested) AS ingested_count,
               MAX(last_scanned) AS last_scanned
        FROM \`${PROJECT_ID}.${DATASET}.sharepoint_files\`
        GROUP BY source_folder
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

    // Normalise sharepoint rows to the same shape as ingested-report rows
    type SpRow = { source_folder: string; file_count: number; ingested_count: number; last_scanned: string };
    const spSources = (sharepointFiles as SpRow[])
      .filter((r) => r.file_count > 0)
      .map((r) => ({
        tag: FOLDER_TAG[r.source_folder] ?? "sharepoint",
        reports: r.file_count,
        ingested: r.ingested_count,
        nodes: null as null,
        last_upload: r.last_scanned,
      }));

    const allSources = [...(sources as object[]), ...spSources];

    return NextResponse.json({ sources: allSources, measures: measures[0], synthesis: synthesis[0] });
  } catch (error) {
    console.error("Methodology stats failed:", error);
    return NextResponse.json({ error: "Failed to fetch methodology stats" }, { status: 500 });
  }
}
