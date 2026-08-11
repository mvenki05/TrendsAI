import { NextResponse } from "next/server";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";

export async function GET() {
  try {
    const rows = await query(`
      SELECT report_id, filename, title, document_date, source_type, num_megatrends, num_nodes, status, uploaded_at
      FROM \`${PROJECT_ID}.${DATASET}.reports\`
      ORDER BY uploaded_at DESC
      LIMIT 100
    `);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch reports:", error);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}
