import { NextResponse } from "next/server";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";

// White Space Scout: novel ideas from the latest scout run + emerging subtrends
// clustered bottom-up from all accumulated runs.
export async function GET() {
  try {
    const [ideas, subtrends] = await Promise.all([
      query(`
        SELECT idea_id, run_id, name, description, origin, wow, novelty_score, search_term,
               support, sources, closest_known, novelty_reason, buildable, category,
               tyson_brand, concept_name, pitch, fit_score, fit_rationale, status,
               current_interest, yoy_growth, is_rising, has_data, interest_series,
               classification, is_durable, created_at
        FROM \`${PROJECT_ID}.${DATASET}.lab_ideas\`
        WHERE run_id = (
          SELECT run_id
          FROM \`${PROJECT_ID}.${DATASET}.lab_ideas\`
          ORDER BY created_at DESC
          LIMIT 1
        )
        ORDER BY buildable DESC, fit_score DESC, novelty_score DESC
      `),
      query(`
        SELECT subtrend_id, name, description, idea_names, member_count, run_count,
               rising_count, maps_to_megatrend, created_at
        FROM \`${PROJECT_ID}.${DATASET}.lab_subtrends\`
        ORDER BY (maps_to_megatrend IS NULL) DESC, member_count DESC
      `).catch(() => []),
    ]);
    return NextResponse.json({ ideas, subtrends });
  } catch (error) {
    console.error("Failed to fetch lab data:", error);
    return NextResponse.json({ error: "Failed to fetch lab data" }, { status: 500 });
  }
}
