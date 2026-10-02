"""
TrendLens — On-Demand Trend Term Measurement

Ask TrendLens's search_trends_numeric tool only knows terms that were already
extracted from a report (trend_searches) or found by the White Space Scout —
an arbitrary term a user asks about in chat (e.g. "chicken thighs") may never
have been measured. This script runs a real Google Trends pull for specific
term(s) via Playwright and caches the result in `chat_trend_lookups` so the
chat can answer that exact question next time instead of saying "no data."

Usage:
    python scripts/measure_term.py "chicken thighs" "dark meat chicken"
"""

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.common import bq_client, dataset_ref, load_json_rows  # noqa: E402
from src.trend_math import analyze  # noqa: E402
from src.trends_browser import measure  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("terms", nargs="+", help="Term(s) to measure, e.g. \"chicken thighs\"")
    parser.add_argument("--asked-by", default=None, help="Note on what prompted this (e.g. a chat question)")
    args = parser.parse_args()

    client = bq_client()
    project_id, dataset = dataset_ref()
    T = f"{project_id}.{dataset}"

    series_by_term = measure(args.terms)
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for term in args.terms:
        series = series_by_term.get(term, [])
        stats = analyze(series)
        rows.append({
            "term": term,
            "current_interest": stats.get("current"),
            "yoy_growth": stats.get("yoy_growth"),
            "is_rising": stats.get("is_rising"),
            "classification": stats.get("classification"),
            "interest_series": json.dumps(series),
            "asked_by": args.asked_by,
            "measured_at": now,
        })
        logger.info("%s -> %s", term, {k: v for k, v in stats.items() if k != "interest_series"})

    load_json_rows(client, f"{T}.chat_trend_lookups", rows, replace=False)
    logger.info("Cached %d term(s) into chat_trend_lookups", len(rows))


if __name__ == "__main__":
    main()
