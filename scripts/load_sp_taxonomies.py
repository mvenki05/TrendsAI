"""
Load taxonomy JSONs extracted from SharePoint reports into BigQuery.

Usage:
    python scripts/load_sp_taxonomies.py [--scratchpad <dir>]

Reads taxonomy_rep_sp_*.json files from the scratchpad, builds taxonomy_nodes rows,
deletes any existing rows for those report_ids, then appends the new rows.
Also marks reports.status='extracted' and sharepoint_files.ingested=true.
"""

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

SCRATCHPAD = Path(r"C:\Users\MANDAP~1\AppData\Local\Temp\claude\C--Users-mandapative-OneDrive---Tyson-Online-General---Marketing-Analytics-Enterprise-Reporting-13--AI-Agent-Rohit-TrendsAgent\bc4cb8fa-70b8-4858-9289-b0cc27453712\scratchpad")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scratchpad", type=Path, default=SCRATCHPAD)
    args = parser.parse_args()

    from src.common import bq_client, dataset_ref, load_json_rows
    from src.extract_taxonomy import build_node_rows

    client = bq_client()
    project_id, dataset_id = dataset_ref()
    now = datetime.now(timezone.utc).isoformat()

    taxonomy_files = sorted(args.scratchpad.glob("taxonomy_rep_sp_*.json"))
    if not taxonomy_files:
        logger.error("No taxonomy_rep_sp_*.json files found in %s", args.scratchpad)
        sys.exit(1)

    logger.info("Found %d taxonomy files: %s", len(taxonomy_files), [f.name for f in taxonomy_files])

    all_rows = []
    report_ids = []

    for tf in taxonomy_files:
        taxonomy = json.loads(tf.read_text(encoding="utf-8"))
        report_id = taxonomy.get("report_id")
        if not report_id:
            logger.warning("Skipping %s — no report_id field", tf.name)
            continue
        rows = build_node_rows(taxonomy, report_id, now)
        logger.info("  %s → %d taxonomy_nodes rows", report_id, len(rows))
        all_rows.extend(rows)
        report_ids.append(report_id)

    if not report_ids:
        logger.error("No valid taxonomy files found")
        sys.exit(1)

    # DELETE existing nodes for these reports (idempotent re-run)
    ids_literal = ", ".join(f"'{r}'" for r in report_ids)
    delete_sql = f"DELETE FROM `{project_id}.{dataset_id}.taxonomy_nodes` WHERE report_id IN ({ids_literal})"
    logger.info("Deleting existing taxonomy_nodes rows for: %s", report_ids)
    client.query(delete_sql).result()

    # Insert new rows
    table_ref = f"{project_id}.{dataset_id}.taxonomy_nodes"
    logger.info("Inserting %d taxonomy_nodes rows...", len(all_rows))
    load_json_rows(client, table_ref, all_rows, replace=False)
    logger.info("taxonomy_nodes inserted OK")

    # Update reports.status
    logger.info("Updating reports.status = 'extracted' for %d reports...", len(report_ids))
    update_sql = f"""
        UPDATE `{project_id}.{dataset_id}.reports`
        SET status = 'extracted'
        WHERE report_id IN ({ids_literal})
    """
    client.query(update_sql).result()
    logger.info("reports updated OK")

    # Mark sharepoint_files.ingested = true
    logger.info("Marking sharepoint_files.ingested = true...")
    sp_sql = f"""
        UPDATE `{project_id}.{dataset_id}.sharepoint_files`
        SET ingested = true, report_id = rids.rid
        FROM UNNEST([{", ".join(f'STRUCT("{r}" AS rid)' for r in report_ids)}]) AS rids
        WHERE sharepoint_files.report_id = rids.rid
    """
    client.query(sp_sql).result()
    logger.info("sharepoint_files updated OK")

    logger.info("Done. Loaded %d reports, %d taxonomy_nodes total.", len(report_ids), len(all_rows))
    for rid in report_ids:
        print(f"  LOADED: {rid}")


if __name__ == "__main__":
    main()
