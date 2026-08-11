"""
TrendLens — Backfill document_date on existing reports

Reports extracted before the `document_date` field existed have no date. This
script populates it WITHOUT regenerating taxonomy nodes (so already-measured
Google Trends data stays linked):

  1. Adds the reports.document_date column if it's missing (idempotent).
  2. For each report still missing a date, re-reads its uploaded file from
     uploads/, runs a focused date-only Claude call, and UPDATEs just that one
     column.

Usage:
    python scripts/backfill_document_date.py            # only reports missing a date
    python scripts/backfill_document_date.py --all       # re-derive for every report
"""

import argparse
import logging
from pathlib import Path

from google.cloud import bigquery

from src.common import bq_client, dataset_ref
from src.extract_taxonomy import extract_document_date, extract_text

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
EXT_FOR = {"pdf": ".pdf", "pptx": ".pptx"}


def ensure_column(client: bigquery.Client, project_id: str, dataset_id: str) -> None:
    client.query(
        f"ALTER TABLE `{project_id}.{dataset_id}.reports` "
        f"ADD COLUMN IF NOT EXISTS document_date STRING"
    ).result()
    logger.info("Ensured reports.document_date column exists")


def find_file(report_id: str, source_type: str | None) -> Path | None:
    # Files are stored as uploads/<report_id><ext>.
    if source_type and source_type in EXT_FOR:
        p = UPLOADS_DIR / f"{report_id}{EXT_FOR[source_type]}"
        if p.exists():
            return p
    for ext in EXT_FOR.values():
        p = UPLOADS_DIR / f"{report_id}{ext}"
        if p.exists():
            return p
    return None


def run(do_all: bool = False) -> None:
    client = bq_client()
    project_id, dataset_id = dataset_ref()
    ensure_column(client, project_id, dataset_id)

    where = "" if do_all else "WHERE document_date IS NULL"
    rows = list(client.query(
        f"SELECT report_id, filename, source_type, document_date "
        f"FROM `{project_id}.{dataset_id}.reports` {where}"
    ).result())

    if not rows:
        logger.info("No reports need a document_date backfill.")
        return

    for r in rows:
        path = find_file(r.report_id, r.source_type)
        if not path:
            logger.warning("  %s (%s): no uploaded file found in uploads/ — skipping",
                           r.report_id, r.filename)
            continue
        try:
            text, _ = extract_text(path)
            date = extract_document_date(text)
        except Exception as e:  # noqa: BLE001 — backfill is best-effort per report
            logger.warning("  %s (%s): extraction failed (%s) — skipping",
                           r.report_id, r.filename, e)
            continue

        client.query(
            f"UPDATE `{project_id}.{dataset_id}.reports` "
            f"SET document_date = @d WHERE report_id = @rid",
            job_config=bigquery.QueryJobConfig(query_parameters=[
                bigquery.ScalarQueryParameter("d", "STRING", date),
                bigquery.ScalarQueryParameter("rid", "STRING", r.report_id),
            ]),
        ).result()
        logger.info("  %s (%s): document_date = %r", r.report_id, r.filename, date)

    logger.info("Backfill complete.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill reports.document_date")
    parser.add_argument("--all", action="store_true",
                        help="Re-derive for every report (default: only those missing a date)")
    args = parser.parse_args()
    run(do_all=args.all)


if __name__ == "__main__":
    main()
