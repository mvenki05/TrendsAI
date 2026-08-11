import { NextResponse } from "next/server";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [report, nodes, searches] = await Promise.all([
      query(
        `SELECT report_id, filename, title, document_date, source_type, num_megatrends, num_nodes, status, uploaded_at
         FROM \`${PROJECT_ID}.${DATASET}.reports\` WHERE report_id = @rid LIMIT 1`,
        { rid: id }
      ),
      query(
        `SELECT node_id, report_id, parent_id, level, name, description, search_term,
                megatrend_name, subtrend_name
         FROM \`${PROJECT_ID}.${DATASET}.taxonomy_nodes\` WHERE report_id = @rid`,
        { rid: id }
      ),
      query(
        `SELECT search_id, report_id, node_id, node_level, term, node_name, subtrend_name,
                megatrend_name, current_interest, yoy_growth, is_rising, has_data, interest_series
         FROM \`${PROJECT_ID}.${DATASET}.trend_searches\` WHERE report_id = @rid`,
        { rid: id }
      ),
    ]);
    return NextResponse.json({ report: report[0] ?? null, nodes, searches });
  } catch (error) {
    console.error("Failed to fetch report:", error);
    return NextResponse.json({ error: "Failed to fetch report" }, { status: 500 });
  }
}
