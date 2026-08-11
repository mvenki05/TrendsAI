"""
TrendLens — Search Mapping (real Google Trends growth, via browser, cached)

For each product/ingredient extracted from a report, measure its real Google
Trends interest over the last 12 months and compute growth (current interest,
YoY %, rising/not). Uses a real Chromium browser (src/trends_browser.py), which
Google throttles far less than the pytrends back-channel.

CACHING / ACCUMULATION: terms already measured with data are NOT re-fetched.
Each run only measures the gaps, so coverage builds up and re-runs are cheap.
(Google Trends changes little day-to-day, so measure on demand, then reuse.)

Usage:
    python -m src.map_searches rep_xxxxxxxx
"""

import argparse
import json
import logging
import uuid
from datetime import datetime, timezone

from google.cloud import bigquery

from src import trends_browser
from src.common import bq_client, dataset_ref, load_json_rows

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

MAX_TERMS = 150
RISING_GROWTH_PCT = 15.0
RISING_MIN_INTEREST = 2


def fetch_terms(client, project_id, dataset_id, report_id) -> list[dict]:
    q = f"""
    SELECT node_id, level AS node_level, name AS node_name, LOWER(search_term) AS term,
           subtrend_name, megatrend_name
    FROM `{project_id}.{dataset_id}.taxonomy_nodes`
    WHERE report_id = @rid AND level IN ('product', 'ingredient') AND search_term IS NOT NULL
    """
    job = client.query(q, job_config=bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("rid", "STRING", report_id)]))
    return [dict(r) for r in job.result()]


def fetch_existing_measured(client, project_id, dataset_id, report_id) -> dict[str, dict]:
    """Previously measured terms (cache): {term: metrics+series}.

    Only terms that also have a stored interest_series count as cached, so reports
    measured before the graph feature get their series backfilled on the next run.
    """
    q = f"""
    SELECT term, ANY_VALUE(current_interest) ci, ANY_VALUE(yoy_growth) yoy,
           ANY_VALUE(is_rising) ris, ANY_VALUE(interest_series) ser
    FROM `{project_id}.{dataset_id}.trend_searches`
    WHERE report_id = @rid AND has_data = TRUE AND interest_series IS NOT NULL
    GROUP BY term
    """
    job = client.query(q, job_config=bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("rid", "STRING", report_id)]))
    out = {}
    for r in job.result():
        try:
            series = json.loads(r["ser"]) if r["ser"] else []
        except (ValueError, TypeError):
            series = []
        out[r["term"]] = {"current_interest": r["ci"], "yoy_growth": r["yoy"], "is_rising": r["ris"],
                          "has_data": True, "interest_series": series}
    return out


def metrics_for(series: list[int]) -> dict:
    """current interest + YoY growth + rising flag from a weekly series (list of ints)."""
    vals = [int(v) for v in series if v is not None]
    if not vals:
        return {"current_interest": None, "yoy_growth": None, "is_rising": False, "has_data": False}
    current = sum(vals[-4:]) / len(vals[-4:])
    prior = sum(vals[:4]) / len(vals[:4]) if len(vals) >= 8 else None
    yoy = round((current / prior - 1) * 100, 1) if prior and prior > 0 else None
    is_rising = bool(yoy is not None and yoy >= RISING_GROWTH_PCT and current >= RISING_MIN_INTEREST)
    return {"current_interest": int(round(current)), "yoy_growth": yoy,
            "is_rising": is_rising, "has_data": current > 0, "interest_series": vals}


def run(report_id: str, synthesize: bool = True) -> None:
    client = bq_client()
    project_id, dataset_id = dataset_ref()

    nodes = fetch_terms(client, project_id, dataset_id, report_id)
    if not nodes:
        logger.warning("No product/ingredient terms for report %s", report_id)
        _mark_status(client, project_id, dataset_id, report_id, "mapped")
        return

    unique_terms = list(dict.fromkeys(n["term"] for n in nodes if n["term"]))[:MAX_TERMS]
    cached = fetch_existing_measured(client, project_id, dataset_id, report_id)
    to_fetch = [t for t in unique_terms if t not in cached]
    logger.info("Report %s: %d terms (%d cached, %d to measure)",
                report_id, len(unique_terms), len(cached), len(to_fetch))

    # Measure only the gaps via the real browser.
    series_map = trends_browser.measure(to_fetch) if to_fetch else {}

    term_metrics: dict[str, dict] = dict(cached)
    for t in to_fetch:
        term_metrics[t] = metrics_for(series_map.get(t, []))

    now = datetime.now(timezone.utc).isoformat()
    week_of = datetime.now(timezone.utc).date().isoformat()
    rows = []
    for n in nodes:
        m = term_metrics.get(n["term"], {})
        rows.append({
            "search_id": f"srch_{uuid.uuid4().hex[:12]}",
            "report_id": report_id, "node_id": n["node_id"], "node_level": n["node_level"],
            "term": n["term"], "node_name": n["node_name"],
            "subtrend_name": n["subtrend_name"], "megatrend_name": n["megatrend_name"],
            "current_interest": m.get("current_interest"), "yoy_growth": m.get("yoy_growth"),
            "is_rising": bool(m.get("is_rising")), "has_data": bool(m.get("has_data")),
            "interest_series": json.dumps(m.get("interest_series") or []),
            "week_of": week_of, "captured_at": now,
        })

    client.query(
        f"DELETE FROM `{project_id}.{dataset_id}.trend_searches` WHERE report_id = @rid",
        job_config=bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("rid", "STRING", report_id)]),
    ).result()
    load_json_rows(client, f"{project_id}.{dataset_id}.trend_searches", rows)
    _mark_status(client, project_id, dataset_id, report_id, "mapped")

    measured = sum(1 for r in rows if r["has_data"])
    rising = sum(1 for r in rows if r["is_rising"])
    logger.info("Report %s: %d rows, %d with data, %d rising", report_id, len(rows), measured, rising)

    if synthesize:
        try:
            from src import synthesize_megatrends
            synthesize_megatrends.run()
        except Exception as e:  # noqa: BLE001
            logger.warning("Synthesis after mapping failed (non-fatal): %s", e)


def _mark_status(client, project_id, dataset_id, report_id, status) -> None:
    client.query(
        f"UPDATE `{project_id}.{dataset_id}.reports` SET status = @s WHERE report_id = @rid",
        job_config=bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("s", "STRING", status),
            bigquery.ScalarQueryParameter("rid", "STRING", report_id),
        ]),
    ).result()


def main() -> None:
    parser = argparse.ArgumentParser(description="TrendLens — measure Google Trends growth (browser, cached)")
    parser.add_argument("report_id")
    args = parser.parse_args()
    run(args.report_id)


if __name__ == "__main__":
    main()
