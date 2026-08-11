import { NextResponse } from "next/server";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";

// Our own trend map: megatrend -> subtrend -> products/ingredients/behaviours/psychographics,
// reverse-engineered bottom-up from the internet (world + US).
export async function GET() {
  try {
    const nodes = await query(`
      SELECT node_id, parent_id, level, name, description, geo, search_term, support,
             sources, megatrend_name, subtrend_name, overlap_deck, evidence_origin, created_at
      FROM \`${PROJECT_ID}.${DATASET}.trend_map_nodes\`
      ORDER BY megatrend_name, subtrend_name, level, support DESC
    `);
    return NextResponse.json({ nodes });
  } catch (error) {
    console.error("Failed to fetch trend map:", error);
    return NextResponse.json({ error: "Failed to fetch trend map" }, { status: 500 });
  }
}
