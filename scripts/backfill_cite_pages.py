"""
Backfill `page` numbers into Megatrend Codex citations (codex_megatrends.dossier).

For every report-kind cite in each dossier, fuzzy-matches the cited claim's text
(stat / evidence detail / horizon detail / whitespace note) against the per-page
text of the source PDF and stamps the best-matching page onto the cite, so the
dashboard can deep-link `/api/file/<rid>#page=N`.

Pure text matching — no LLM, runs locally.

Usage:
    python scripts/backfill_cite_pages.py            # dry run: report matches
    python scripts/backfill_cite_pages.py --apply    # write updates to BigQuery
"""

import argparse
import json
import logging
import re
import sys
from pathlib import Path

from pypdf import PdfReader

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.common import bq_client, dataset_ref  # noqa: E402

logger = logging.getLogger(__name__)

ROOT = Path(__file__).parent.parent

STOPWORDS = frozenset(
    "the and for with that this from are was were will have has had not you your "
    "our their they them its into over under more most less than then when where "
    "what which while about after before between during against also just like "
    "some such only very can could would should there these those being been how "
    "who whom does doing each other same all any both few own too now new".split()
)

_NUM_RE = re.compile(r"\$?\d+(?:[.,]\d+)?%?")
_WORD_RE = re.compile(r"[a-z]{4,}")


def _resolve_pdf(report_id: str, filename: str) -> Path | None:
    """Mirror the /api/file/[id] route's candidate order; PDFs only (#page= anchors
    don't work for PPTX, which browsers download instead of rendering)."""
    ext = Path(filename).suffix.lower()
    candidates = [
        ROOT / "uploads" / f"{report_id}{ext}",
        ROOT / "uploads" / filename,
        ROOT / "uploads" / "mintel" / filename,
        ROOT / "uploads" / "tyson" / filename,
        ROOT / "docs" / filename,
    ]
    for p in candidates:
        if p.suffix.lower() == ".pdf" and p.exists():
            return p
    return None


def _page_texts(pdf_path: Path) -> list[str]:
    reader = PdfReader(str(pdf_path))
    return [(page.extract_text() or "").lower() for page in reader.pages]


def _context_tokens(context: str) -> tuple[list[str], list[str]]:
    """Return (numeric anchors, distinctive word tokens) from a cite's claim text."""
    low = context.lower()
    nums = [n for n in _NUM_RE.findall(low) if len(n.strip("$%")) >= 2 or "%" in n or "$" in n]
    words = [w for w in _WORD_RE.findall(low) if w not in STOPWORDS]
    return nums, list(dict.fromkeys(words))


def best_page(context: str, pages: list[str]) -> tuple[int | None, float]:
    """Score each page by numeric-anchor hits (strong) + rare-word overlap (weak);
    return (1-based page, score) or (None, score) when no page is convincing."""
    nums, words = _context_tokens(context)
    if not nums and len(words) < 2:
        return None, 0.0
    n_pages = len(pages)
    df = {w: sum(1 for p in pages if w in p) for w in words}
    best_i, best_score = None, 0.0
    for i, page in enumerate(pages):
        score = sum(5.0 for n in nums if n in page)
        for w in words:
            if w in page:
                d = df[w]
                score += 3.0 if d <= 2 else (1.0 if d <= max(2, n_pages // 4) else 0.2)
        if score > best_score:
            best_i, best_score = i, score
    # Require a numeric hit or solid rare-word evidence before trusting the match.
    has_num_hit = best_i is not None and any(n in pages[best_i] for n in nums)
    if best_i is None or best_score < (4.0 if has_num_hit else 7.0):
        return None, best_score
    return best_i + 1, best_score


def _cite_sites(dossier: dict) -> list[tuple[str, str, dict]]:
    """Yield (site label, claim context text, cite dict) for every report cite."""
    sites: list[tuple[str, str, dict]] = []

    def add(label: str, context: str, cite: dict | None) -> None:
        if cite and cite.get("kind") == "report" and cite.get("report_id"):
            sites.append((label, context, cite))

    for ks in dossier.get("key_stats") or []:
        add("key_stat", ks.get("stat") or "", ks.get("cite"))
    for st in dossier.get("subtrends") or []:
        for ev in st.get("evidence") or []:
            add(f"subtrend:{st.get('name')}", f"{ev.get('name') or ''} {ev.get('detail') or ''}", ev.get("cite"))
    for horizon, items in (dossier.get("horizons") or {}).items():
        for h in items or []:
            add(f"horizon:{horizon}", f"{h.get('title') or ''} {h.get('detail') or ''}", h.get("cite"))
    for ws in dossier.get("whitespace") or []:
        add("whitespace", f"{ws.get('name') or ''} {ws.get('note') or ''}", ws.get("cite"))
    return sites


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write updated dossiers to BigQuery")
    args = parser.parse_args()

    client = bq_client()
    project_id, dataset = dataset_ref()

    reports = {
        r["report_id"]: r["filename"]
        for r in client.query(f"SELECT report_id, filename FROM `{project_id}.{dataset}.reports`").result()
    }
    rows = list(client.query(
        f"SELECT `key`, dossier FROM `{project_id}.{dataset}.codex_megatrends` WHERE dossier IS NOT NULL"
    ).result())

    page_cache: dict[str, list[str] | None] = {}

    def pages_for(rid: str) -> list[str] | None:
        if rid not in page_cache:
            fname = reports.get(rid)
            pdf = _resolve_pdf(rid, fname) if fname else None
            page_cache[rid] = _page_texts(pdf) if pdf else None
            if page_cache[rid] is None:
                logger.warning("No local PDF for %s (%s) — cites left whole-document", rid, fname)
        return page_cache[rid]

    total = matched = 0
    for row in rows:
        dossier = json.loads(row["dossier"])
        changed = False
        for label, context, cite in _cite_sites(dossier):
            total += 1
            pages = pages_for(cite["report_id"])
            if not pages:
                continue
            page, score = best_page(context, pages)
            if page is not None:
                matched += 1
                if cite.get("page") != page:
                    cite["page"] = page
                    changed = True
                logger.info("[%s] %s -> p.%d (score %.1f): %.70s", row["key"], label, page, score, context.strip())
            else:
                logger.info("[%s] %s -> no confident page (score %.1f): %.70s", row["key"], label, score, context.strip())
        if changed and args.apply:
            from google.cloud import bigquery
            client.query(
                f"UPDATE `{project_id}.{dataset}.codex_megatrends` SET dossier = @dossier WHERE `key` = @key",
                job_config=bigquery.QueryJobConfig(query_parameters=[
                    bigquery.ScalarQueryParameter("dossier", "STRING", json.dumps(dossier, ensure_ascii=False)),
                    bigquery.ScalarQueryParameter("key", "STRING", row["key"]),
                ]),
            ).result()
            logger.info("[%s] dossier updated in BigQuery", row["key"])

    mode = "APPLIED" if args.apply else "DRY RUN"
    logger.info("%s: %d/%d report cites matched to a page", mode, matched, total)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    main()
