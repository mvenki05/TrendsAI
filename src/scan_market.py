"""
TrendLens — Market Scan (Open Food Facts)

Takes the top rising INGREDIENTS across ALL reports (deduped, ranked by how many
reports corroborate them + momentum) and finds real US market products for each
via Open Food Facts. Powers the global /market page: "which rising ingredients
are already in market, and who's selling them?"

CACHING / ACCUMULATION: terms already in `market_products` are not re-scanned —
each run only fills gaps, so coverage builds up and re-runs are cheap (OFF changes
slowly). Use --rescan to wipe the cache and scan all selected terms fresh.

Writes the `market_products` table (term-keyed, report-independent cache). The
/market page joins it back to live rising-ingredient aggregates at read time.

Usage:
    python -m src.scan_market            # scan the top rising ingredients (gaps only)
    python -m src.scan_market --rescan   # re-scan all selected terms
"""

import argparse
import json
import logging
import time
from datetime import datetime, timezone

from google.cloud import bigquery

from src import open_food_facts
from src.common import bq_client, dataset_ref, load_json_rows, load_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

_M = load_settings()["market"]
TOP_INGREDIENTS = int(_M["top_ingredients"])
REQUEST_DELAY_S = float(_M["request_delay_seconds"])


def fetch_rising_ingredients(client, project_id, dataset_id, limit: int) -> list[str]:
    """Top rising ingredient terms across all reports, ranked by corroboration then momentum."""
    q = f"""
    SELECT term
    FROM `{project_id}.{dataset_id}.trend_searches`
    WHERE is_rising = TRUE AND node_level = 'ingredient' AND term IS NOT NULL AND term != ''
    GROUP BY term
    ORDER BY COUNT(DISTINCT report_id) DESC, MAX(yoy_growth) DESC
    LIMIT @limit
    """
    job = client.query(q, job_config=bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("limit", "INT64", limit)]))
    return [r["term"] for r in job.result()]


def fetch_cached_terms(client, project_id, dataset_id) -> set[str]:
    q = f"SELECT DISTINCT term FROM `{project_id}.{dataset_id}.market_products`"
    return {r["term"] for r in client.query(q).result()}


def run(rescan: bool = False) -> None:
    client = bq_client()
    project_id, dataset_id = dataset_ref()

    terms = fetch_rising_ingredients(client, project_id, dataset_id, TOP_INGREDIENTS)
    if not terms:
        logger.warning("No rising ingredients found — measure Google Trends on some reports first")
        return

    cached = set() if rescan else fetch_cached_terms(client, project_id, dataset_id)
    to_scan = [t for t in terms if t not in cached]
    logger.info("Top %d rising ingredients (%d cached, %d to scan)", len(terms), len(terms) - len(to_scan), len(to_scan))

    if rescan and terms:
        # Replace cache for the terms we're about to refresh.
        client.query(
            f"DELETE FROM `{project_id}.{dataset_id}.market_products` WHERE term IN UNNEST(@terms)",
            job_config=bigquery.QueryJobConfig(
                query_parameters=[bigquery.ArrayQueryParameter("terms", "STRING", terms)]),
        ).result()

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for idx, term in enumerate(to_scan, 1):
        rec = open_food_facts.scan_term(term)
        logger.info("Market %d/%d: %-28s -> %d products, %d brands",
                    idx, len(to_scan), term, rec["product_count"], rec["brand_count"])
        rows.append({
            "term": rec["term"],
            "product_count": rec["product_count"],
            "brand_count": rec["brand_count"],
            "brands": rec["brands"],
            "products": json.dumps(rec["products"]),
            "has_products": rec["has_products"],
            "scanned_at": now,
        })
        if idx < len(to_scan):
            time.sleep(REQUEST_DELAY_S)

    load_json_rows(client, f"{project_id}.{dataset_id}.market_products", rows)

    with_products = sum(1 for r in rows if r["has_products"])
    logger.info("Scanned %d new terms, %d with market products", len(rows), with_products)


def main() -> None:
    parser = argparse.ArgumentParser(description="TrendLens — Open Food Facts market scan")
    parser.add_argument("--rescan", action="store_true", help="Re-scan all selected terms (wipe their cache)")
    args = parser.parse_args()
    run(rescan=args.rescan)


if __name__ == "__main__":
    main()
