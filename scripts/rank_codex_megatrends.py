"""
Rank the Megatrend Codex — a transparent, from-scratch corroboration score.

Replaces the old accumulated `rank_score` (a number that had been hand-patched by
incrementing it after every batch ingest, rather than recomputed) with a documented
formula derived fresh, every run, from what's actually cited in each dossier:

    rank_score = 100 * distinct_source_classes + 3 * distinct_cited_reports + 1 * distinct_months

- distinct_source_classes: how many independent kinds of source corroborate this
  megatrend (deck / mintel / tyson / hartman / internet — counted from the reports
  and web URLs actually cited in the dossier, not a stored/stale list).
- distinct_cited_reports: how many different reports are cited anywhere in the dossier.
- distinct_months: how many different calendar months those reports' stated dates span
  (persistence over time, not just volume).

Deliberately EXCLUDED from the score: Google Trends demand data (rising_terms,
avg_yoy_growth). That data is stale (measured once, 2026-07-24, covering only 2 of the
118 reports now in the system) and would badly distort ranking if trusted. The demand
fields are left untouched in `strength` for display — just not used to rank.

Usage:
    python scripts/rank_codex_megatrends.py            # dry run: print the new order
    python scripts/rank_codex_megatrends.py --apply    # write rank + classes to BigQuery
"""

import argparse
import json
import logging
import re
from collections import Counter

from src.common import bq_client, dataset_ref

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

_MONTHS = (
    "january|february|march|april|may|june|july|august|september|october|november|december|"
    "jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec"
)
_MONTH_NUM = {
    name[:3]: i + 1
    for i, name in enumerate(
        "jan feb mar apr may jun jul aug sep oct nov dec".split()
    )
}
_YEAR_RE = re.compile(r"\b(20[0-3]\d)\b")
_MONTH_RE = re.compile(rf"\b({_MONTHS})\b", re.IGNORECASE)
_NUMERIC_DATE_RE = re.compile(r"\b(20[0-3]\d)-(\d{2})-\d{2}\b")


def parse_year_month(document_date: str | None) -> tuple[int, int | None] | None:
    """Best-effort (year, month-or-None) from a free-text document_date. Returns None
    if no year is even findable — plenty of these strings are genuinely messy."""
    if not document_date:
        return None
    s = document_date.strip()
    m = _NUMERIC_DATE_RE.search(s)
    if m:
        return int(m.group(1)), int(m.group(2))
    ym = _YEAR_RE.search(s)
    if not ym:
        return None
    year = int(ym.group(1))
    mm = _MONTH_RE.search(s)
    month = _MONTH_NUM.get(mm.group(1)[:3].lower()) if mm else None
    return year, month


def collect_cites(dossier: dict) -> list[dict]:
    """Every {kind, report_id?, url?} cite object anywhere in the dossier, including
    tyson_questions and whitespace — for RANKING purposes every citation counts as
    corroboration regardless of which section it lives in."""
    cites: list[dict] = []

    def walk(obj):
        if isinstance(obj, dict):
            if "cite" in obj and isinstance(obj["cite"], dict):
                cites.append(obj["cite"])
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for v in obj:
                walk(v)

    walk(dossier)
    return cites


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the new rank + classes to BigQuery")
    args = parser.parse_args()

    client = bq_client()
    project_id, dataset_id = dataset_ref()

    reports = {
        r["report_id"]: {"source_tag": r["source_tag"], "document_date": r["document_date"]}
        for r in client.query(
            f"SELECT report_id, source_tag, document_date FROM `{project_id}.{dataset_id}.reports`"
        ).result()
    }

    rows = list(client.query(
        f"SELECT `key`, name, tagline, strength, dossier FROM `{project_id}.{dataset_id}.codex_megatrends`"
    ).result())

    results = []
    for row in rows:
        dossier = json.loads(row["dossier"])
        cites = collect_cites(dossier)

        report_ids = {c["report_id"] for c in cites if c.get("kind") != "web" and c.get("report_id")}
        has_web = any(c.get("kind") == "web" for c in cites)

        classes = set()
        months = set()
        for rid in report_ids:
            info = reports.get(rid)
            if not info:
                continue
            classes.add(info["source_tag"] or "deck")
            ym = parse_year_month(info["document_date"])
            if ym:
                months.add(ym)
        if has_web:
            classes.add("internet")

        n_classes, n_reports, n_months = len(classes), len(report_ids), len(months)
        rank_score = 100 * n_classes + 3 * n_reports + 1 * n_months

        # Preserve demand fields as-is — displayed, not scored.
        old_strength = json.loads(row["strength"])
        new_strength = {
            "classes": sorted(classes),
            "report_count": n_reports,
            "month_count": n_months,
            "rising_terms": old_strength.get("rising_terms", 0),
            "avg_yoy_growth": old_strength.get("avg_yoy_growth", 0.0),
            "rank_score": rank_score,
        }
        results.append({
            "key": row["key"], "name": row["name"], "tagline": row["tagline"],
            "strength": new_strength, "dossier": row["dossier"],
        })

    results.sort(key=lambda r: r["strength"]["rank_score"], reverse=True)

    print(f"\n{'Rank':<5}{'Megatrend':<28}{'Score':>7}{'Classes':>9}{'Reports':>9}{'Months':>8}   Classes")
    print("-" * 90)
    for i, r in enumerate(results, start=1):
        st = r["strength"]
        print(f"{i:<5}{r['name']:<28}{st['rank_score']:>7}{len(st['classes']):>9}{st['report_count']:>9}{st['month_count']:>8}   {', '.join(st['classes'])}")

    if args.apply:
        from datetime import datetime, timezone
        from src.common import load_json_rows

        now = datetime.now(timezone.utc).isoformat()
        new_rows = [
            {
                "key": r["key"], "name": r["name"], "tagline": r["tagline"], "rank": i,
                "strength": json.dumps(r["strength"]), "dossier": r["dossier"],
                "created_at": now,
            }
            for i, r in enumerate(results, start=1)
        ]
        load_json_rows(client, f"{project_id}.{dataset_id}.codex_megatrends", new_rows, replace=True)
        print(f"\nApplied: wrote new rank + classes for {len(new_rows)} megatrends")
    else:
        print("\nDry run — pass --apply to write this order to BigQuery")


if __name__ == "__main__":
    main()
