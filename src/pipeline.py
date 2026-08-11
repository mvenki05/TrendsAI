"""
TrendLens — Upload Pipeline

Runs the full chain for one uploaded file:
    extract taxonomy → measure Google Trends growth → re-synthesize best megatrends

The dashboard's /api/upload spawns this as a detached subprocess.

Usage:
    python -m src.pipeline "<file path>" [report_id]
"""

import argparse
import logging

from src import extract_taxonomy, map_searches, synthesize_megatrends

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def run(file_path: str, report_id: str | None = None, filename: str | None = None) -> str:
    # 1) Extract taxonomy — this makes the report viewable (~90s). Fast path.
    logger.info("=== Pipeline: extract ===")
    rid = extract_taxonomy.run(file_path, report_id=report_id, filename=filename)

    # 2) Synthesize now so the report + Best Megatrends are usable immediately,
    #    before the slow Google Trends step.
    logger.info("=== Pipeline: initial synthesis ===")
    try:
        synthesize_megatrends.run()
    except Exception as e:
        logger.warning("Initial synthesis failed (non-fatal): %s", e)

    # 3) Measure Google Trends growth (best-effort; re-synthesizes at the end).
    #    Often the IP is throttled — that's fine, the report is already usable and
    #    the user can re-run growth on demand via the "Measure Google Trends" button.
    logger.info("=== Pipeline: measure Google Trends ===")
    try:
        map_searches.run(rid)
    except Exception as e:
        logger.warning("Growth step failed (non-fatal): %s", e)

    logger.info("=== Pipeline complete: %s ===", rid)
    return rid


def main() -> None:
    parser = argparse.ArgumentParser(description="TrendLens upload pipeline")
    parser.add_argument("file", help="Path to the uploaded .pptx/.pdf")
    parser.add_argument("report_id", nargs="?", default=None, help="Pre-assigned report id (replace in place)")
    parser.add_argument("filename", nargs="?", default=None, help="Original filename to record")
    args = parser.parse_args()
    run(args.file, report_id=args.report_id, filename=args.filename)


if __name__ == "__main__":
    main()
