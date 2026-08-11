import { BigQuery } from "@google-cloud/bigquery";

const PROJECT_ID = process.env.BIGQUERY_PROJECT || "dev-2534-puw-growth-2295ed";
const DATASET = process.env.BIGQUERY_DATASET || "trend_intelligence";

const client = new BigQuery({ projectId: PROJECT_ID });

/**
 * Recursively flatten BigQuery typed values.
 * BQ DATE/TIMESTAMP fields come back as { value: "2026-04-08" }.
 * This converts them (and any nested occurrences) to plain scalars.
 */
function flattenBQValue(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(flattenBQValue);
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    // BigQuery typed value — unwrap it
    if (Object.keys(obj).length === 1 && "value" in obj) return obj.value;
    return Object.fromEntries(
      Object.entries(obj).map(([k, val]) => [k, flattenBQValue(val)])
    );
  }
  return v;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const options: { query: string; params?: Record<string, unknown> } = { query: sql };
  if (params) options.params = params;
  const [rows] = await client.query(options);
  return (rows as unknown[]).map((r) => flattenBQValue(r)) as T[];
}

export { PROJECT_ID, DATASET };
