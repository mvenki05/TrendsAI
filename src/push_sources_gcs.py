"""Push report source documents to GCS so the hosted TrendLens can serve them.

For every report in BigQuery, finds the original file on local disk using the
same candidate paths as dashboard/src/app/api/file/[id]/route.ts and uploads it
to gs://trendlens-sources-783822/sources/<report_id><ext> (idempotent: skips
blobs whose size already matches). The hosted backend streams these via
GET /api/trends/file/{report_id}.

Run after ingesting new reports (also invoked by the monorepo's
sync_to_cima.py --trends step):  python src/push_sources_gcs.py [--dry-run]
"""
from __future__ import annotations

import argparse
import logging
import re
from pathlib import Path

from google.cloud import bigquery, storage

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("push_sources_gcs")

ROOT = Path(__file__).resolve().parents[1]
PROJECT_ID = "dev-2534-puw-growth-2295ed"
DATASET = "trend_intelligence"
BUCKET_PROJECT = "lab-strattechadvsrtca-783822"
BUCKET = "trendlens-sources-783822"


def _candidates(report_id: str, filename: str, sharepoint_path: str | None) -> list[Path]:
    ext = Path(filename).suffix.lower()
    paths = [
        ROOT / "uploads" / f"{report_id}{ext}",
        ROOT / "uploads" / filename,
        ROOT / "uploads" / "mintel" / filename,
        ROOT / "uploads" / "tyson" / filename,
        ROOT / "docs" / filename,
    ]
    if sharepoint_path:
        paths.append(Path(sharepoint_path))
        # Reports ingested on a teammate's machine store THEIR OneDrive root;
        # the same SharePoint library syncs locally — re-root under this user.
        local_root = str(Path.home() / "OneDrive - Tyson Online")
        rerooted = re.sub(r"^C:\\Users\\[^\\]+\\OneDrive - Tyson Online",
                          lambda _: local_root,  # lambda: literal repl, no \U escape parsing
                          sharepoint_path, flags=re.IGNORECASE)
        if rerooted != sharepoint_path:
            paths.append(Path(rerooted))
    return paths


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    bq = bigquery.Client(project=PROJECT_ID)
    rows = list(bq.query(f"""
        SELECT r.report_id, r.filename, sp.file_path AS sharepoint_path
        FROM `{PROJECT_ID}.{DATASET}.reports` r
        LEFT JOIN `{PROJECT_ID}.{DATASET}.sharepoint_files` sp USING (report_id)
    """).result())

    bucket = storage.Client(project=BUCKET_PROJECT).bucket(BUCKET)
    uploaded = skipped = missing = 0
    missing_names: list[str] = []

    def _push(local: Path, blob_name: str) -> bool:
        blob = bucket.blob(blob_name)
        if blob.exists():
            blob.reload()
            if blob.size == local.stat().st_size:
                return False
        if not args.dry_run:
            blob.upload_from_filename(str(local))
        log.info("  up: %s <- %s", blob_name, local.name)
        return True

    for r in rows:
        local = next((p for p in _candidates(r.report_id, r.filename, r.sharepoint_path)
                      if p.is_file()), None)
        if local is None:
            missing += 1
            missing_names.append(f"{r.report_id}  {r.filename}")
            continue
        ext = Path(r.filename).suffix.lower()
        if _push(local, f"sources/{r.report_id}{ext}"):
            uploaded += 1
        else:
            skipped += 1
        # PPTX decks may have a converted PDF rendition — the hosted backend
        # prefers it (inline render + #page= deep links, like the local route).
        rendition = ROOT / "uploads" / f"{r.report_id}.pdf"
        if ext == ".pptx" and rendition.is_file():
            _push(rendition, f"sources/{r.report_id}.pdf")

    log.info("Done: %d uploaded, %d already current, %d/%d missing locally.",
             uploaded, skipped, missing, len(rows))
    if missing_names:
        log.warning("Missing (links will 404 hosted):")
        for m in missing_names:
            log.warning("  %s", m)


if __name__ == "__main__":
    main()
