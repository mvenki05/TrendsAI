"""
TrendLens — Megatrend Codex bundle builder (automated dossier refresh).

Now that src.common.complete_json() calls Claude via the LiteLLM gateway instead of
requiring a live Claude Code session (see CLAUDE.md's former "no local API key"
constraint), the Codex dossier refresh no longer needs the session-populate
scratchpad pattern. This script + scripts/generate_codex_dossier.py + scripts/
load_codex_dossier.py replace it for one canonical megatrend at a time.

This is a REFRESH, not a from-scratch regeneration: the existing `codex_megatrends`
dossier is the continuity anchor, and this script's job is only to find NEW evidence
to merge into it.

For a given canonical `key` (see config/codex_canon.json):
  1. Reads the existing codex_megatrends row (dossier JSON + table name/tagline).
  2. Walks the dossier for every {report_id} actually cited anywhere in its body
     (same pattern as scripts/rank_codex_megatrends.py's collect_cites — the
     dossier's own sources[] bibliography can drift out of sync with its body, so
     it is not trusted here either).
  3. Searches report_text_chunks (scripts/backfill_report_text.py's page-level text
     index, already used by Ask TrendLens) for reports matching the canon's search
     terms that aren't already cited — this is the new-evidence pool.
  4. Writes output/codex_build/bundle_<key>.json for the generator step.

Usage:
    python scripts/build_codex_bundle.py protein
"""

import json
import logging
import sys
from pathlib import Path

import google.cloud.bigquery as bq

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.common import bq_client, dataset_ref  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).parent.parent
CANON_PATH = ROOT / "config" / "codex_canon.json"
OUT_DIR = ROOT / "output" / "codex_build"

MAX_CHUNKS_PER_REPORT = 6  # bound bundle size for reports with many matching pages


def collect_cited_report_ids(dossier: dict) -> set[str]:
    """Every report_id actually cited anywhere in the dossier body — not just its
    (possibly stale) sources[] bibliography. Mirrors rank_codex_megatrends.collect_cites."""
    ids: set[str] = set()

    def walk(obj):
        if isinstance(obj, dict):
            cite = obj.get("cite")
            if isinstance(cite, dict) and cite.get("kind") != "web" and cite.get("report_id"):
                ids.add(cite["report_id"])
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for v in obj:
                walk(v)

    walk(dossier)
    return ids


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    key = sys.argv[1]

    canon = json.loads(CANON_PATH.read_text(encoding="utf-8"))
    if key not in canon:
        raise SystemExit(f"'{key}' not in {CANON_PATH} — add it (search_terms) first")
    search_terms = canon[key]["search_terms"]

    client = bq_client()
    project_id, dataset_id = dataset_ref()
    T = f"{project_id}.{dataset_id}"

    row = next(iter(client.query(
        f"SELECT `key`, name, tagline, rank, strength, dossier FROM `{T}.codex_megatrends` WHERE `key` = @key",
        job_config=bq.QueryJobConfig(query_parameters=[bq.ScalarQueryParameter("key", "STRING", key)]),
    ).result()), None)
    if row is None:
        raise SystemExit(f"No existing codex_megatrends row for key='{key}' — this script only refreshes an existing dossier")

    existing_dossier = json.loads(row["dossier"])
    cited_report_ids = collect_cited_report_ids(existing_dossier)
    logger.info("Existing dossier for '%s': %d reports already cited in its body", key, len(cited_report_ids))

    search_condition = " OR ".join(f'SEARCH(c.text, @term{i})' for i in range(len(search_terms)))
    params = [bq.ScalarQueryParameter(f"term{i}", "STRING", t) for i, t in enumerate(search_terms)]
    params.append(bq.ArrayQueryParameter("cited", "STRING", sorted(cited_report_ids) or [""]))

    candidate_query = f"""
    SELECT c.report_id, c.page, c.text, r.filename, r.title, r.document_date, r.source_tag, r.uploaded_at
    FROM `{T}.report_text_chunks` c
    JOIN `{T}.reports` r USING(report_id)
    WHERE ({search_condition}) AND c.report_id NOT IN UNNEST(@cited)
    ORDER BY r.uploaded_at DESC, c.report_id, c.chunk_index
    """
    rows = list(client.query(candidate_query, job_config=bq.QueryJobConfig(query_parameters=params)).result())

    new_evidence: dict[str, dict] = {}
    for r in rows:
        rid = r["report_id"]
        entry = new_evidence.setdefault(rid, {
            "report_id": rid,
            "label": r["title"] or r["filename"],
            "source_tag": r["source_tag"],
            "document_date": r["document_date"],
            "chunks": [],
        })
        if len(entry["chunks"]) < MAX_CHUNKS_PER_REPORT:
            entry["chunks"].append({"page": r["page"], "text": r["text"]})

    bundle = {
        "key": key,
        "table_name": row["name"],
        "table_tagline": row["tagline"],
        "existing_dossier": existing_dossier,
        "new_evidence": list(new_evidence.values()),
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"bundle_{key}.json"
    out_path.write_text(json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")

    total_chunks = sum(len(e["chunks"]) for e in new_evidence.values())
    logger.info(
        "Wrote %s: %d new-evidence reports (%d chunks, %d chars) not yet cited in the '%s' dossier",
        out_path, len(new_evidence), total_chunks, len(json.dumps(new_evidence)), key,
    )


if __name__ == "__main__":
    main()
