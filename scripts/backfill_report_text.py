"""
TrendLens — Report Full-Text Backfill

Populates `report_text_chunks`: one row per PDF page / PPTX slide, across every
ingested report. This is what lets the Ask TrendLens chat (dashboard/src/lib/ask/
tools.ts -> search_report_text) find passage-level facts (e.g. a specific stat
buried in a report's body) that never made it into the extracted taxonomy nodes.

Pure text extraction — no LLM, runs locally. Reuses src.extract_taxonomy.extract_text
so page/slide numbering matches what taxonomy extraction and cite-page backfill saw.

Usage:
    python scripts/backfill_report_text.py            # all reports missing chunks
    python scripts/backfill_report_text.py --all      # re-extract every report
    python scripts/backfill_report_text.py rep_xxx    # just one report
"""

import argparse
import logging
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.common import bq_client, dataset_ref, load_json_rows  # noqa: E402
from src.extract_taxonomy import extract_text  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).parent.parent
MAX_CHUNK_CHARS = 8000  # generous — pages/slides are almost always far smaller


def _resolve_source(report_id: str, filename: str, sharepoint_path: str | None) -> Path | None:
    """Find a local, still-readable copy of this report. Prefers the original
    (so [PAGE n]/[SLIDE n] numbering is unambiguous) but falls back to a PDF
    rendition for a PPTX whose original went missing."""
    ext = Path(filename).suffix.lower()
    candidates = [
        ROOT / "uploads" / f"{report_id}{ext}",
        ROOT / "uploads" / f"{report_id}.pdf",
        ROOT / "uploads" / filename,
        ROOT / "uploads" / "mintel" / filename,
        ROOT / "uploads" / "tyson" / filename,
        ROOT / "docs" / filename,
        *([Path(sharepoint_path)] if sharepoint_path else []),
    ]
    for p in candidates:
        if p.suffix.lower() in (".pdf", ".pptx") and p.exists():
            return p
    return None


MARKER_RE = re.compile(r"\[(?:PAGE|SLIDE) (\d+)\]\n?")


def chunk_text(text: str) -> list[tuple[int | None, str]]:
    """Split on [PAGE n] / [SLIDE n] markers into (page_number, page_text)."""
    marker = MARKER_RE
    parts = marker.split(text)
    # re.split with one group alternates: [pre-text, num, text, num, text, ...]
    if len(parts) == 1:
        body = text.strip()
        return [(None, body[:MAX_CHUNK_CHARS])] if body else []

    chunks: list[tuple[int | None, str]] = []
    pre = parts[0].strip()
    if pre:
        chunks.append((None, pre[:MAX_CHUNK_CHARS]))
    for i in range(1, len(parts), 2):
        page = int(parts[i])
        body = parts[i + 1].strip() if i + 1 < len(parts) else ""
        if body:
            chunks.append((page, body[:MAX_CHUNK_CHARS]))
    return chunks


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report_id", nargs="?", help="Only backfill this one report")
    parser.add_argument("--all", action="store_true", help="Re-extract every report, not just ones missing chunks")
    args = parser.parse_args()

    client = bq_client()
    project_id, dataset = dataset_ref()
    T = f"{project_id}.{dataset}"

    reports = list(client.query(
        f"SELECT report_id, filename FROM `{T}.reports`"
        + (" WHERE report_id = @rid" if args.report_id else ""),
        job_config=bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("rid", "STRING", args.report_id or ""),
        ]) if args.report_id else None,
    ).result())
    sharepoint_paths = {
        r["report_id"]: r["file_path"]
        for r in client.query(f"SELECT report_id, file_path FROM `{T}.sharepoint_files` WHERE report_id IS NOT NULL").result()
    }

    already_indexed: set[str] = set()
    if not args.all and not args.report_id:
        already_indexed = {
            r["report_id"] for r in client.query(f"SELECT DISTINCT report_id FROM `{T}.report_text_chunks`").result()
        }

    now = datetime.now(timezone.utc).isoformat()
    all_rows: list[dict] = []
    done = skipped = missing = failed = 0

    for r in reports:
        rid, filename = r["report_id"], r["filename"]
        if rid in already_indexed:
            skipped += 1
            continue
        src = _resolve_source(rid, filename, sharepoint_paths.get(rid))
        if not src:
            logger.warning("No local file for %s (%s) — skipping", rid, filename)
            missing += 1
            continue
        try:
            text, _source_type = extract_text(src)
        except Exception as exc:
            logger.error("Extraction failed for %s (%s): %s", rid, filename, exc)
            failed += 1
            continue
        chunks = chunk_text(text)
        for i, (page, body) in enumerate(chunks):
            all_rows.append({
                "report_id": rid,
                "chunk_index": i,
                "page": page,
                "text": body,
                "indexed_at": now,
            })
        done += 1
        logger.info("Indexed %s (%s): %d chunks", rid, filename, len(chunks))

    if args.report_id or args.all:
        # Targeted or full re-run: clear existing chunks for these reports first.
        rids = [r["report_id"] for r in reports]
        if rids:
            client.query(
                f"DELETE FROM `{T}.report_text_chunks` WHERE report_id IN UNNEST(@rids)",
                job_config=bigquery.QueryJobConfig(query_parameters=[
                    bigquery.ArrayQueryParameter("rids", "STRING", rids),
                ]),
            ).result()

    if all_rows:
        load_json_rows(client, f"{T}.report_text_chunks", all_rows, replace=False)

    logger.info(
        "Done: %d reports indexed (%d chunks), %d already indexed, %d missing source file, %d failed",
        done, len(all_rows), skipped, missing, failed,
    )


if __name__ == "__main__":
    main()
