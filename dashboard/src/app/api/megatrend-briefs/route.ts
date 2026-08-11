import { NextResponse } from "next/server";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";

const MEGA_ORDER = [
  "Ubiquity of Protein & GLP-1 Nutrition",
  "Food Fusion & Global Flavors",
  "Easy Eats",
  "Bifurcated Budgets",
  "Brand Scrutiny & Clean Label",
  "Alcohol Flavors",
  "Data-Enabled Food Choices",
  "Functional Drinks",
];

export async function GET() {
  try {
    const [innovations, ideas, risingRows, descRows] = await Promise.all([
      query(`
        SELECT megatrend, name, description, relation, sources
        FROM \`${PROJECT_ID}.${DATASET}.discovered_nodes\`
        WHERE level = 'innovation'
        ORDER BY megatrend, discovery_id
      `),
      query(`
        SELECT megatrend, name, description, tyson_brand, permission_tier, validation, format
        FROM \`${PROJECT_ID}.${DATASET}.innovation_ideas\`
        ORDER BY megatrend, idea_id
      `),
      query(`
        SELECT megatrend, COUNT(*) AS rising_count
        FROM \`${PROJECT_ID}.${DATASET}.discovered_nodes\`
        WHERE is_rising = TRUE
        GROUP BY megatrend
      `),
      query(`
        SELECT cluster_name, description
        FROM \`${PROJECT_ID}.${DATASET}.megatrend_clusters\`
      `),
    ]);

    const risingMap = new Map(risingRows.map((r: any) => [r.megatrend, Number(r.rising_count ?? 0)]));
    const descMap = new Map(descRows.map((d: any) => [d.cluster_name, d.description]));

    const innovByMega = new Map<string, any[]>();
    for (const n of innovations as any[]) {
      if (!innovByMega.has(n.megatrend)) innovByMega.set(n.megatrend, []);
      innovByMega.get(n.megatrend)!.push(n);
    }

    const ideasByMega = new Map<string, any[]>();
    for (const idea of ideas as any[]) {
      if (!ideasByMega.has(idea.megatrend)) ideasByMega.set(idea.megatrend, []);
      ideasByMega.get(idea.megatrend)!.push(idea);
    }

    const result = MEGA_ORDER.map((mega) => ({
      megatrend: mega,
      description: descMap.get(mega) ?? null,
      rising_count: risingMap.get(mega) ?? 0,
      innovations: (innovByMega.get(mega) ?? []).slice(0, 5),
      ideas: (ideasByMega.get(mega) ?? []).slice(0, 4),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch megatrend briefs:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
