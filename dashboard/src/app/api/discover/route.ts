import { NextResponse } from "next/server";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";

// All web-discovered taxonomy items, grouped client-side by megatrend.
export async function GET() {
  try {
    const rows = await query(`
      SELECT n.discovery_id, n.megatrend, n.level, n.name, n.search_term, n.support, n.sources, n.in_deck,
             n.current_interest, n.yoy_growth, n.is_rising, n.has_data, n.interest_series,
             n.classification, n.acceleration, n.is_durable,
             n.description, n.relation, n.subtrend, n.mapped_megatrend,
             mc.description AS mega_description
      FROM \`${PROJECT_ID}.${DATASET}.discovered_nodes\` n
      LEFT JOIN \`${PROJECT_ID}.${DATASET}.megatrend_clusters\` mc ON mc.cluster_name = n.megatrend
      ORDER BY n.megatrend, n.level, n.support DESC
    `);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch discovered nodes:", error);
    return NextResponse.json({ error: "Failed to fetch discovered nodes" }, { status: 500 });
  }
}
