import { NextResponse } from "next/server";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";

export async function GET() {
  try {
    const rows = await query(`
      SELECT cluster_id, cluster_name, description, source_report_ids, source_megatrend_names,
             source_filenames, file_count, rising_search_count, best_score
      FROM \`${PROJECT_ID}.${DATASET}.megatrend_clusters\`
      ORDER BY best_score DESC
      LIMIT 5
    `);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch best megatrends:", error);
    return NextResponse.json({ error: "Failed to fetch best megatrends" }, { status: 500 });
  }
}
