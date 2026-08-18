"""
Mark the 5 SharePoint-sourced reports as ingested in the sharepoint_files table.
Run this script >90 minutes after the initial scan (BigQuery streaming buffer restriction).

Usage:
    python scripts/mark_sharepoint_ingested.py
"""

import os
import sys
from pathlib import Path

import yaml
from google.cloud import bigquery

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

REPORT_IDS = [
    "rep_1f96691ef6e2",
    "rep_5d6fd3c96063",
    "rep_f4bfc99a1d3b",
    "rep_aa7f8c934a18",
    "rep_fdd5e744c1f8",
]


def main():
    cfg = yaml.safe_load((PROJECT_ROOT / "config" / "settings.yaml").read_text())
    bq = cfg["bigquery"]
    project = os.getenv("BIGQUERY_PROJECT", bq["project_id"])
    dataset = os.getenv("BIGQUERY_DATASET", bq["dataset"])

    client = bigquery.Client(project=project)
    ids_lit = ", ".join(f"'{r}'" for r in REPORT_IDS)

    sql = f"""
        UPDATE `{project}.{dataset}.sharepoint_files` sf
        SET
          ingested = TRUE,
          report_id = r.report_id,
          ingested_at = CURRENT_TIMESTAMP()
        FROM (
          SELECT report_id, filename
          FROM `{project}.{dataset}.reports`
          WHERE report_id IN ({ids_lit})
        ) r
        WHERE sf.file_name = r.filename
          AND sf.ingested = FALSE
    """

    result = client.query(sql).result()
    print(f"Done. Updated sharepoint_files for {len(REPORT_IDS)} reports.")


if __name__ == "__main__":
    main()
