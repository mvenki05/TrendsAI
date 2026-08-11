import { NextResponse } from "next/server";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";

// Combined insights: cross-document themes clustered from the Tyson digest
// insight cards (What's going on / So what / Now what), plus the raw cards.
export async function GET() {
  try {
    const [themes, cards] = await Promise.all([
      query(`
        SELECT theme_id, name, description, card_count, month_count, months,
               source_kinds, key_stats, combined_implication, tyson_questions, created_at
        FROM \`${PROJECT_ID}.${DATASET}.insight_themes\`
        ORDER BY month_count DESC, card_count DESC
      `),
      query(`
        SELECT c.card_id, c.report_id, c.source_kind, c.month, c.learning,
               c.implication, c.recommendations, c.questions, c.theme, r.filename
        FROM \`${PROJECT_ID}.${DATASET}.insight_cards\` c
        JOIN \`${PROJECT_ID}.${DATASET}.reports\` r USING (report_id)
        ORDER BY c.month, c.source_kind
      `),
    ]);
    return NextResponse.json({ themes, cards });
  } catch (error) {
    console.error("Failed to fetch insights:", error);
    return NextResponse.json({ error: "Failed to fetch insights" }, { status: 500 });
  }
}
