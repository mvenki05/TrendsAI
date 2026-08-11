"""
TrendLens — Downloads watcher: auto-ingest reports you download from Mintel (or anywhere).

You browse the Mintel portal in your own logged-in Chrome and click Download on
any report. This script watches your Downloads folder; every new PDF/PPTX is
POSTed to the dashboard's existing /api/upload endpoint, which saves its own
canonical copy (uploads/<report_id>.pdf) and runs the full extraction pipeline
(megatrends -> subtrends -> products/ingredients + Google Trends validation).

No credentials, no scraping — it only handles files you chose to download.

Usage:
    python scripts/ingest_downloads.py            # watch until Ctrl+C
    python scripts/ingest_downloads.py --once     # ingest what's already there, then exit
    python scripts/ingest_downloads.py --minutes 30   # watch for 30 minutes

Requires the dashboard dev server running (cd dashboard && npm run dev).
"""

import argparse
import logging
import time
from pathlib import Path

import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DOWNLOADS = Path.home() / "Downloads"
UPLOAD_URL = "http://localhost:3000/api/upload"
EXTENSIONS = {".pdf", ".pptx"}
POLL_SECONDS = 3
STABLE_CHECKS = 2   # size must be unchanged this many polls before ingesting (download finished)


def _candidates(seen: set[Path]) -> list[Path]:
    out = []
    for p in DOWNLOADS.iterdir():
        if p.suffix.lower() in EXTENSIONS and p not in seen and not p.name.startswith("~"):
            out.append(p)
    return out


def _wait_until_stable(path: Path) -> bool:
    """True once the file size stops changing (download complete)."""
    last, stable = -1, 0
    for _ in range(120):
        try:
            size = path.stat().st_size
        except OSError:
            return False
        if size == last and size > 0:
            stable += 1
            if stable >= STABLE_CHECKS:
                return True
        else:
            stable = 0
        last = size
        time.sleep(POLL_SECONDS)
    return False


def ingest(path: Path) -> bool:
    """POST to the dashboard's upload API (which saves its own canonical copy in uploads/)."""
    with open(path, "rb") as f:
        try:
            r = requests.post(UPLOAD_URL, files={"file": (path.name, f)}, timeout=120)
        except requests.RequestException as e:
            logger.error("Upload failed for %s (is the dashboard running?): %s", path.name, e)
            return False
    if r.ok:
        logger.info("Ingested %s -> report_id %s (%s)", path.name,
                    r.json().get("report_id", "?"), r.json().get("status", "processing"))
        return True
    logger.error("Upload rejected for %s: HTTP %s %s", path.name, r.status_code, r.text[:200])
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Watch Downloads and ingest new PDF/PPTX reports")
    parser.add_argument("--once", action="store_true", help="Ingest existing files then exit")
    parser.add_argument("--minutes", type=float, default=None, help="Stop watching after N minutes")
    args = parser.parse_args()

    seen: set[Path] = set(DOWNLOADS.glob("*")) if not args.once else set()
    if args.once:
        # Only files from the last 24h, so we don't ingest ancient downloads.
        cutoff = time.time() - 86400
        for p in _candidates(set()):
            if p.stat().st_mtime >= cutoff:
                ingest(p)
        return

    logger.info("Watching %s for new PDF/PPTX — download reports from Mintel now (Ctrl+C to stop)", DOWNLOADS)
    deadline = time.time() + args.minutes * 60 if args.minutes else None
    try:
        while deadline is None or time.time() < deadline:
            for p in _candidates(seen):
                seen.add(p)
                logger.info("New file detected: %s — waiting for download to finish…", p.name)
                if _wait_until_stable(p):
                    ingest(p)
                else:
                    logger.warning("%s never stabilized — skipped", p.name)
            time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        logger.info("Stopped.")


if __name__ == "__main__":
    main()
