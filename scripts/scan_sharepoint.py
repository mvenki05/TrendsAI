"""
TrendLens — SharePoint File Scanner

Walks configured local SharePoint folders (synced via OneDrive), parses the
document date from the filename or first-page text, and registers new files in
the BigQuery `sharepoint_files` table.

Usage:
    python scripts/scan_sharepoint.py              # scan + show pending
    python scripts/scan_sharepoint.py --dry-run    # scan without writing to BQ
    python scripts/scan_sharepoint.py --pending    # list uningest files ≤6 months
"""

import argparse
import hashlib
import logging
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import yaml
from google.cloud import bigquery

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Folders to watch — add more paths here as needed
# ---------------------------------------------------------------------------
WATCH_FOLDERS: list[dict] = [
    {
        # Central SharePoint drop folder — anyone on the team can put trend reports here
        "path": r"C:\Users\mandapative\OneDrive - Tyson Online\General - Marketing Analytics\Trend Reports",
        "label": "Trend Reports (SharePoint Central)",
        "recurse": True,
    },
    {
        "path": r"C:\Users\mandapative\OneDrive - Tyson Online\General - Marketing Analytics\108. Category Shopper Insights\1. Secondary Resource Library",
        "label": "Secondary Resource Library",
        "recurse": False,
    },
]

SUPPORTED_EXTS = {".pdf", ".pptx", ".ppt", ".xlsx", ".xls"}

# How far back to consider "recent"
RECENT_MONTHS = 6

# ---------------------------------------------------------------------------
# Date parsing
# ---------------------------------------------------------------------------

# Month name → number
_MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

def _parse_filename_date(name: str) -> date | None:
    """Try YYYY_MM_ or YYYY-MM- prefix (most Kantar/agency files use this)."""
    m = re.match(r"(\d{4})[_\-](\d{2})[_\-]", name)
    if m:
        y, mo = int(m.group(1)), int(m.group(2))
        if 2000 <= y <= 2035 and 1 <= mo <= 12:
            return date(y, mo, 1)
    # Also try just YYYY anywhere in name as fallback
    m = re.search(r"\b(20\d{2})\b", name)
    if m:
        return date(int(m.group(1)), 1, 1)
    return None


def _parse_content_date(path: Path) -> date | None:
    """Extract text from first page/slide and look for a date pattern."""
    ext = path.suffix.lower()
    text = ""
    try:
        if ext == ".pdf":
            import pypdf
            reader = pypdf.PdfReader(str(path))
            if reader.pages:
                text = reader.pages[0].extract_text() or ""
        elif ext in (".pptx", ".ppt"):
            from pptx import Presentation
            prs = Presentation(str(path))
            for slide in list(prs.slides)[:2]:
                for shape in slide.shapes:
                    if shape.has_text_frame:
                        text += shape.text_frame.text + " "
                if text.strip():
                    break
    except Exception as e:
        logger.debug("Could not extract text from %s: %s", path.name, e)
        return None

    if not text:
        return None

    # "March 2025", "February 2026", etc.
    m = re.search(
        r"\b(january|february|march|april|may|june|july|august|september|october|november|december|"
        r"jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(20\d{2})\b",
        text, re.IGNORECASE,
    )
    if m:
        mo = _MONTH_MAP.get(m.group(1).lower())
        yr = int(m.group(2))
        if mo and 2000 <= yr <= 2035:
            return date(yr, mo, 1)

    # "Q1 2025", "Q3 2026"
    m = re.search(r"\bQ([1-4])\s*(20\d{2})\b", text)
    if m:
        q_to_month = {"1": 1, "2": 4, "3": 7, "4": 10}
        mo = q_to_month[m.group(1)]
        return date(int(m.group(2)), mo, 1)

    # "2025" standalone
    m = re.search(r"\b(20\d{2})\b", text)
    if m:
        return date(int(m.group(1)), 1, 1)

    return None


def get_doc_date(path: Path) -> tuple[date | None, str]:
    """Return (doc_date, date_source)."""
    d = _parse_filename_date(path.name)
    if d:
        return d, "filename"
    d = _parse_content_date(path)
    if d:
        return d, "content"
    return None, "unknown"


# ---------------------------------------------------------------------------
# File hash
# ---------------------------------------------------------------------------

def _win_path(path: Path) -> str:
    """Return a Windows extended-length path string to bypass the 260-char limit."""
    p = str(path.resolve())
    if not p.startswith("\\\\?\\"):
        p = "\\\\?\\" + p
    return p


def is_local(path: Path) -> bool:
    """Return True if the file is physically present on disk (not cloud-only OneDrive)."""
    try:
        import ctypes
        FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS = 0x400000
        FILE_ATTRIBUTE_RECALL_ON_OPEN = 0x40000
        attrs = ctypes.windll.kernel32.GetFileAttributesW(_win_path(path))
        if attrs == -1:
            return False
        return not (attrs & (FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS | FILE_ATTRIBUTE_RECALL_ON_OPEN))
    except Exception:
        return False


def file_id(path: Path, size: int) -> str:
    """Stable ID from path + size — no file read needed."""
    key = f"{path.name}::{size}"
    return hashlib.md5(key.encode()).hexdigest()


# ---------------------------------------------------------------------------
# BigQuery helpers
# ---------------------------------------------------------------------------

def load_settings() -> dict:
    cfg = Path(__file__).parent.parent / "config" / "settings.yaml"
    with open(cfg) as f:
        return yaml.safe_load(f)


def already_seen(client: bigquery.Client, project: str, dataset: str, file_ids: set[str]) -> set[str]:
    """Return which file_ids already exist in sharepoint_files."""
    if not file_ids:
        return set()
    ids_lit = ", ".join(f"'{i}'" for i in file_ids)
    q = f"SELECT file_id FROM `{project}.{dataset}.sharepoint_files` WHERE file_id IN ({ids_lit})"
    return {row.file_id for row in client.query(q).result()}


def upsert_rows(client: bigquery.Client, project: str, dataset: str, rows: list[dict], dry_run: bool) -> None:
    if not rows:
        return
    if dry_run:
        logger.info("[dry-run] Would insert %d rows into sharepoint_files", len(rows))
        return
    errors = client.insert_rows_json(f"{project}.{dataset}.sharepoint_files", rows)
    if errors:
        logger.error("BQ insert errors: %s", errors)
    else:
        logger.info("Inserted %d new file rows", len(rows))


# ---------------------------------------------------------------------------
# Main scan
# ---------------------------------------------------------------------------

def scan(dry_run: bool = False) -> list[dict]:
    settings = load_settings()
    bq = settings["bigquery"]
    project = os.getenv("BIGQUERY_PROJECT", bq["project_id"])
    dataset = os.getenv("BIGQUERY_DATASET", bq["dataset"])
    client = bigquery.Client(project=project)

    now = datetime.now(tz=timezone.utc).isoformat()
    all_files: list[Path] = []

    for folder_cfg in WATCH_FOLDERS:
        root = Path(folder_cfg["path"])
        if not root.exists():
            logger.warning("Folder not found: %s", root)
            continue
        pattern = "**/*" if folder_cfg.get("recurse") else "*"
        for p in root.glob(pattern):
            if p.is_file() and p.suffix.lower() in SUPPORTED_EXTS:
                all_files.append(p)

    logger.info("Found %d supported files across watch folders", len(all_files))

    # Build file metadata using stat only (no file read — avoids triggering OneDrive downloads)
    file_meta: list[tuple[Path, str, int]] = []
    for p in all_files:
        try:
            size = os.stat(_win_path(p)).st_size
            fid = file_id(p, size)
            file_meta.append((p, fid, size))
        except Exception as e:
            logger.warning("Could not stat %s: %s", p.name, e)

    logger.info("Stat'd %d files", len(file_meta))

    # In dry-run mode skip BQ lookup so we can test without network
    if dry_run:
        new_files = file_meta
        logger.info("[dry-run] Treating all %d files as new (skipping BQ check)", len(new_files))
    else:
        known = already_seen(client, project, dataset, {fid for _, fid, _ in file_meta})
        new_files = [(p, fid, sz) for p, fid, sz in file_meta if fid not in known]
        logger.info("%d new files (not yet in BQ)", len(new_files))

    rows: list[dict] = []
    for p, fid, size in new_files:
        folder_label = next(
            (fc["label"] for fc in WATCH_FOLDERS if p.is_relative_to(Path(fc["path"]))),
            "unknown",
        )
        # Filename date is always instant; only read content if file is already local
        doc_date = _parse_filename_date(p.name)
        date_src = "filename" if doc_date else "unknown"
        if not doc_date and is_local(p):
            doc_date = _parse_content_date(p)
            date_src = "content" if doc_date else "unknown"

        local_flag = "local" if is_local(p) else "cloud-only"
        logger.info("  %s [%s] → date=%s (%s)", p.name, local_flag,
                    doc_date.isoformat() if doc_date else "unknown", date_src)
        rows.append({
            "file_id":       fid,
            "file_name":     p.name,
            "file_path":     str(p),
            "source_folder": folder_label,
            "doc_date":      doc_date.isoformat() if doc_date else None,
            "date_source":   date_src,
            "file_size":     size,
            "file_ext":      p.suffix.lower().lstrip("."),
            "ingested":      False,
            "report_id":     None,
            "ingested_at":   None,
            "first_seen":    now,
            "last_scanned":  now,
        })

    upsert_rows(client, project, dataset, rows, dry_run)
    return rows


def show_pending(months: int = RECENT_MONTHS) -> None:
    settings = load_settings()
    bq = settings["bigquery"]
    project = os.getenv("BIGQUERY_PROJECT", bq["project_id"])
    dataset = os.getenv("BIGQUERY_DATASET", bq["dataset"])
    client = bigquery.Client(project=project)

    cutoff = (date.today() - timedelta(days=months * 30)).isoformat()
    q = f"""
        SELECT file_name, doc_date, date_source, file_size, source_folder
        FROM `{project}.{dataset}.sharepoint_files`
        WHERE ingested = FALSE
          AND doc_date >= '{cutoff}'
        ORDER BY doc_date DESC
    """
    results = list(client.query(q).result())
    if not results:
        print(f"\nNo pending files from the last {months} months.\n")
        return
    print(f"\n{'FILE':<65} {'DATE':<12} {'SOURCE':<10} {'SIZE':>8}")
    print("-" * 100)
    for r in results:
        size_kb = (r.file_size or 0) // 1024
        print(f"{r.file_name:<65} {str(r.doc_date):<12} {r.date_source:<10} {size_kb:>6} KB")
    print(f"\n{len(results)} file(s) ready to ingest.\n")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scan SharePoint folders for new files")
    parser.add_argument("--dry-run", action="store_true", help="Parse dates but don't write to BQ")
    parser.add_argument("--pending", action="store_true", help="Show pending files only (no scan)")
    args = parser.parse_args()

    if args.pending:
        show_pending()
        sys.exit(0)

    scan(dry_run=args.dry_run)
    show_pending()
