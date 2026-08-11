import { NextResponse } from "next/server";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";

// Invented Tyson innovation concepts + the emerging real-world recipes that inspired/validate them.
export async function GET() {
  try {
    const [ideas, recipes] = await Promise.all([
      query(`
        SELECT i.idea_id, i.megatrend, i.name, i.description, i.rides_subtrend,
               i.evidence, i.tyson_brand, i.format,
               i.fit_verdict, i.fit_brand, i.fit_match_count, i.fit_examples,
               i.permission_tier, i.permission_reason, i.occasion,
               i.validation, i.validation_reason, i.evidence_manifestation, i.evidence_sources,
               mc.description AS mega_description
        FROM \`${PROJECT_ID}.${DATASET}.innovation_ideas\` i
        LEFT JOIN \`${PROJECT_ID}.${DATASET}.megatrend_clusters\` mc ON mc.cluster_name = i.megatrend
        ORDER BY i.megatrend, i.name
      `),
      query(`
        SELECT recipe_id, megatrend, title, source, url
        FROM \`${PROJECT_ID}.${DATASET}.web_recipes\`
        ORDER BY megatrend, title
      `),
    ]);
    return NextResponse.json({ ideas, recipes });
  } catch (error) {
    console.error("Failed to fetch innovation ideas:", error);
    return NextResponse.json({ error: "Failed to fetch innovation ideas" }, { status: 500 });
  }
}
