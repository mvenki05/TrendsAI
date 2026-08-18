"""
Patch tyson_questions in codex_megatrends from plain strings to cited objects.

Pulls every "How might Tyson" question from insight_cards (bites source) with its
report_id + month, fuzzy-matches each dossier question, and replaces the string array
with {question, cite: {kind, report_id, label}} objects.

Questions with no confident match keep the string text but get cite=null.

Usage:
    python scripts/patch_tyson_questions.py
    python scripts/patch_tyson_questions.py --key protein   # single megatrend
    python scripts/patch_tyson_questions.py --dry-run       # print without writing
"""

import argparse
import json
import logging
import sys
from difflib import SequenceMatcher
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.common import bq_client, dataset_ref
from google.cloud import bigquery

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

MATCH_THRESHOLD = 0.72   # SequenceMatcher ratio above which we trust the match


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def best_match(question: str, candidates: list[dict]) -> dict | None:
    """Return the BQ question row with the highest similarity, or None if below threshold."""
    best, best_score = None, 0.0
    for c in candidates:
        s = similarity(question, c["question"])
        if s > best_score:
            best, best_score = c, s
    if best_score >= MATCH_THRESHOLD:
        return best
    return None


def fetch_bq_questions(client, project_id: str, dataset_id: str) -> list[dict]:
    """Pull all bites insight_card questions with their source info."""
    rows = list(client.query(f"""
        SELECT
          report_id,
          month,
          JSON_VALUE(q, '$') AS question
        FROM `{project_id}.{dataset_id}.insight_cards`,
        UNNEST(JSON_QUERY_ARRAY(questions)) AS q
        WHERE source_kind = 'bites'
          AND JSON_VALUE(q, '$') IS NOT NULL
          AND TRIM(JSON_VALUE(q, '$')) != ''
        ORDER BY month DESC
    """).result())
    return [{"report_id": r.report_id, "month": r.month, "question": r.question}
            for r in rows]


def fetch_themes_questions(client, project_id: str, dataset_id: str) -> list[dict]:
    """Pull questions from insight_themes (aggregated across cards — used as fallback)."""
    rows = list(client.query(f"""
        SELECT
          JSON_VALUE(q, '$') AS question
        FROM `{project_id}.{dataset_id}.insight_themes`,
        UNNEST(JSON_QUERY_ARRAY(tyson_questions)) AS q
        WHERE JSON_VALUE(q, '$') IS NOT NULL
    """).result())
    return [{"report_id": None, "month": None, "question": r.question} for r in rows]


def patch_questions(dossier: dict, bq_questions: list[dict], fallback: list[dict]) -> tuple[list, int, int]:
    """
    Replace dossier['tyson_questions'] string list with cited objects.
    Returns (new_list, matched_count, total_count).
    """
    raw = dossier.get("tyson_questions", [])
    # Support both old (string) and partially-new (dict) formats
    questions_text = []
    for q in raw:
        if isinstance(q, str):
            questions_text.append(q)
        elif isinstance(q, dict):
            questions_text.append(q.get("question", ""))

    result = []
    matched = 0
    for q_text in questions_text:
        if not q_text.strip():
            continue
        hit = best_match(q_text, bq_questions) or best_match(q_text, fallback)
        if hit and hit["report_id"]:
            result.append({
                "question": q_text,
                "cite": {
                    "kind": "report",
                    "report_id": hit["report_id"],
                    "label": f"{hit['month']} Tyson Digest",
                }
            })
            matched += 1
        else:
            result.append({"question": q_text, "cite": None})

    return result, matched, len(questions_text)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--key", default=None, help="patch a single megatrend key")
    parser.add_argument("--dry-run", action="store_true", help="print results without writing to BQ")
    args = parser.parse_args()

    client = bq_client()
    project_id, dataset_id = dataset_ref()

    logger.info("Fetching BQ question sources…")
    bq_questions = fetch_bq_questions(client, project_id, dataset_id)
    fallback_questions = fetch_themes_questions(client, project_id, dataset_id)
    logger.info("  %d card questions, %d theme questions loaded", len(bq_questions), len(fallback_questions))

    # Load dossiers
    where = f"WHERE key = '{args.key}'" if args.key else ""
    rows = list(client.query(f"""
        SELECT key, name, dossier FROM `{project_id}.{dataset_id}.codex_megatrends`
        {where}
        ORDER BY rank
    """).result())

    for row in rows:
        dossier = json.loads(row.dossier)
        new_questions, matched, total = patch_questions(dossier, bq_questions, fallback_questions)
        logger.info("  [%s] %d/%d questions matched to source", row.key, matched, total)

        if args.dry_run:
            for q in new_questions:
                cite_label = q["cite"]["label"] if q.get("cite") else "— no match"
                logger.info("    %-80s  %s", q["question"][:80], cite_label)
            continue

        dossier["tyson_questions"] = new_questions
        client.query(
            f"UPDATE `{project_id}.{dataset_id}.codex_megatrends` SET dossier = @d WHERE key = @k",
            job_config=bigquery.QueryJobConfig(query_parameters=[
                bigquery.ScalarQueryParameter("d", "STRING", json.dumps(dossier)),
                bigquery.ScalarQueryParameter("k", "STRING", row.key),
            ])
        ).result()
        logger.info("  [%s] updated in BQ", row.key)

    if not args.dry_run:
        logger.info("Done. Reload /best to see cited questions.")


if __name__ == "__main__":
    main()
