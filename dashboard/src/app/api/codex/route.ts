import { NextResponse } from "next/server";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";

// The Megatrend Codex: one deeply-detailed, fully-cited dossier per canonical megatrend.
export async function GET() {
  try {
    const megatrends = await query(`
      SELECT key, name, tagline, rank, strength, dossier
      FROM \`${PROJECT_ID}.${DATASET}.codex_megatrends\`
      ORDER BY rank
    `);
    return NextResponse.json({ megatrends });
  } catch (error) {
    console.error("Failed to fetch codex:", error);
    return NextResponse.json({ error: "Failed to fetch codex" }, { status: 500 });
  }
}
