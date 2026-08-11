"""
TrendLens — Cross-File Synthesis ("best megatrends")

Looks across ALL uploaded reports, merges semantically-equivalent megatrends
into canonical clusters, and ranks them by two REAL signals:
  - corroboration: how many files independently call the megatrend out
  - momentum: how many rising Google searches it has across those files

Writes `megatrend_clusters` (replaces all rows each run).

Usage:
    python -m src.synthesize_megatrends
"""

import argparse
import logging
import uuid
from datetime import datetime, timezone

from google.cloud import bigquery

from src.common import bq_client, complete_json, dataset_ref, load_json_rows

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


CLUSTER_PROMPT = """You are merging megatrends extracted from several different market reports. The same underlying megatrend often appears under different names across files (e.g. "Ubiquity of Protein" and "Protein Everywhere"). Group the items below into canonical clusters.

## Megatrends (one per line: INDEX | NAME | from FILE)
{items}

## Output
Return ONLY valid JSON, no fencing:

{{
  "clusters": [
    {{
      "cluster_name": "a clear canonical name",
      "description": "1 sentence describing the shared theme",
      "members": [0, 3]   // the INDEX numbers of the megatrends in this cluster
    }}
  ]
}}

Rules:
- Every index must appear in exactly one cluster.
- Merge only genuinely equivalent megatrends; if something is unique, it's its own cluster of one.
- Return ONLY the JSON object.
"""


def fetch_megatrends(client, project_id, dataset_id) -> list[dict]:
    """All megatrends across all reports + filename + rising-search count."""
    q = f"""
    WITH mts AS (
        SELECT n.report_id, n.megatrend_name, ANY_VALUE(n.description) AS description, r.filename
        FROM `{project_id}.{dataset_id}.taxonomy_nodes` n
        JOIN `{project_id}.{dataset_id}.reports` r USING (report_id)
        WHERE n.level = 'megatrend'
        GROUP BY n.report_id, n.megatrend_name, r.filename
    ),
    rising AS (
        SELECT report_id, megatrend_name, COUNT(*) AS rising_count
        FROM `{project_id}.{dataset_id}.trend_searches`
        WHERE is_rising
        GROUP BY report_id, megatrend_name
    )
    SELECT m.report_id, m.megatrend_name, m.description, m.filename,
           COALESCE(rs.rising_count, 0) AS rising_count
    FROM mts m LEFT JOIN rising rs USING (report_id, megatrend_name)
    """
    return [dict(r) for r in client.query(q).result()]


def cluster_megatrends(items: list[dict]) -> list[dict]:
    """Ask Claude to merge equivalent megatrends. Falls back to 1-cluster-per-item."""
    if len(items) == 1:
        return [{"cluster_name": items[0]["megatrend_name"],
                 "description": items[0].get("description") or "", "members": [0]}]
    lines = "\n".join(
        f"{i} | {it['megatrend_name']} | from {it['filename']}" for i, it in enumerate(items)
    )
    try:
        result = complete_json(CLUSTER_PROMPT.format(items=lines))
        clusters = result.get("clusters", [])
        if clusters:
            return clusters
    except Exception as e:
        logger.warning("Clustering LLM failed (%s) — using 1 cluster per megatrend", e)
    # Fallback: each item its own cluster
    return [{"cluster_name": it["megatrend_name"], "description": it.get("description") or "",
             "members": [i]} for i, it in enumerate(items)]


def run() -> None:
    client = bq_client()
    project_id, dataset_id = dataset_ref()

    items = fetch_megatrends(client, project_id, dataset_id)
    if not items:
        logger.error("No megatrends found — extract at least one report first")
        return
    logger.info("Synthesizing across %d megatrends from %d files",
                len(items), len({it["report_id"] for it in items}))

    clusters = cluster_megatrends(items)

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for cl in clusters:
        members = [items[i] for i in cl.get("members", []) if 0 <= i < len(items)]
        if not members:
            continue
        report_ids = sorted({m["report_id"] for m in members})
        rising = sum(m["rising_count"] for m in members)
        file_count = len(report_ids)
        rows.append({
            "cluster_id": f"clu_{uuid.uuid4().hex[:12]}",
            "cluster_name": cl.get("cluster_name") or members[0]["megatrend_name"],
            "description": cl.get("description") or "",
            "source_report_ids": report_ids,
            "source_megatrend_names": sorted({m["megatrend_name"] for m in members}),
            "source_filenames": sorted({m["filename"] for m in members}),
            "file_count": file_count,
            "rising_search_count": rising,
            # Ranking key from two real signals: corroboration dominant, momentum tiebreak.
            "best_score": float(file_count * 1000 + rising),
            "synthesized_at": now,
        })

    # Replace all clusters (global synthesis).
    client.query(f"DELETE FROM `{project_id}.{dataset_id}.megatrend_clusters` WHERE TRUE").result()
    load_json_rows(client, f"{project_id}.{dataset_id}.megatrend_clusters", rows)

    logger.info("Wrote %d megatrend clusters", len(rows))
    for r in sorted(rows, key=lambda r: r["best_score"], reverse=True):
        logger.info("  %-32s | files=%d | rising=%d", r["cluster_name"], r["file_count"], r["rising_search_count"])


def main() -> None:
    argparse.ArgumentParser(description="TrendLens — cross-file megatrend synthesis").parse_args()
    run()


if __name__ == "__main__":
    main()
