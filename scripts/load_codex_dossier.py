"""
TrendLens — Megatrend Codex dossier loader (automated dossier refresh, step 3).

Writes output/codex_build/dossier_<key>.json (scripts/generate_codex_dossier.py) back
into `codex_megatrends`, replacing only that key's row — the other 9 canonical
megatrends' rows pass through unchanged. Then regenerates `sources[]` (the
bibliography) deterministically from every citation actually used in the dossier
body, since an LLM-maintained bibliography drifts (see scripts/build_codex_bundle.py's
collect_cited_report_ids docstring for the same finding).

Does NOT compute rank/strength itself — run scripts/rank_codex_megatrends.py --apply
right after this, same as any other codex_megatrends write, so rank stays a fresh
computation across all 10 rather than something this script would have to duplicate.

Usage:
    python scripts/load_codex_dossier.py protein            # dry run: show the diff
    python scripts/load_codex_dossier.py protein --apply     # write it
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import google.cloud.bigquery as bq

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.common import bq_client, dataset_ref, load_json_rows  # noqa: E402

ROOT = Path(__file__).parent.parent
BUILD_DIR = ROOT / "output" / "codex_build"


def collect_cited_report_ids(dossier: dict) -> set[str]:
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("key")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    key = args.key

    dossier_path = BUILD_DIR / f"dossier_{key}.json"
    if not dossier_path.exists():
        raise SystemExit(f"{dossier_path} missing — run scripts/generate_codex_dossier.py {key} first")
    dossier = json.loads(dossier_path.read_text(encoding="utf-8"))

    client = bq_client()
    project_id, dataset_id = dataset_ref()
    T = f"{project_id}.{dataset_id}"

    cited_ids = collect_cited_report_ids(dossier)
    report_meta = {
        r["report_id"]: {"label": r["title"] or r["filename"], "source_tag": r["source_tag"]}
        for r in client.query(
            f"SELECT report_id, filename, title, source_tag FROM `{T}.reports` WHERE report_id IN UNNEST(@ids)",
            job_config=bq.QueryJobConfig(query_parameters=[bq.ArrayQueryParameter("ids", "STRING", sorted(cited_ids) or [""])]),
        ).result()
    }
    dossier["sources"] = [
        {"kind": "report", "report_id": rid, "label": report_meta[rid]["label"], "source_tag": report_meta[rid]["source_tag"]}
        for rid in sorted(cited_ids) if rid in report_meta
    ]
    missing_meta = cited_ids - set(report_meta)
    if missing_meta:
        print(f"WARNING: {len(missing_meta)} cited report_ids have no matching reports row: {missing_meta}")

    existing_rows = list(client.query(f"SELECT `key`, name, tagline, rank, strength, dossier, created_at FROM `{T}.codex_megatrends`").result())
    existing_by_key = {r["key"]: r for r in existing_rows}
    if key not in existing_by_key:
        raise SystemExit(f"No existing codex_megatrends row for key='{key}'")

    old = existing_by_key[key]
    old_dossier = json.loads(old["dossier"])
    old_cited = collect_cited_report_ids(old_dossier)
    new_cited = cited_ids - old_cited

    print(f"'{key}': {len(old_cited)} -> {len(cited_ids)} cited reports ({len(new_cited)} new)")
    print(f"  subtrends: {len(old_dossier.get('subtrends', []))} -> {len(dossier.get('subtrends', []))}")
    print(f"  key_stats: {len(old_dossier.get('key_stats', []))} -> {len(dossier.get('key_stats', []))}")
    print(f"  tyson_questions: {len(old_dossier.get('tyson_questions', []))} -> {len(dossier.get('tyson_questions', []))}")
    print(f"  tyson_ideas: {len(old_dossier.get('tyson_ideas', []))} -> {len(dossier.get('tyson_ideas', []))}")
    print(f"  whitespace: {len(old_dossier.get('whitespace', []))} -> {len(dossier.get('whitespace', []))}")
    if new_cited:
        print(f"  newly cited: {sorted(new_cited)}")

    if not args.apply:
        print("\nDry run — pass --apply to write this, then run scripts/rank_codex_megatrends.py --apply")
        return

    now = datetime.now(timezone.utc).isoformat()
    new_rows = []
    for r in existing_rows:
        if r["key"] == key:
            new_rows.append({
                "key": key, "name": r["name"], "tagline": r["tagline"], "rank": r["rank"],
                "strength": r["strength"], "dossier": json.dumps(dossier, ensure_ascii=False),
                "created_at": now,
            })
        else:
            new_rows.append({
                "key": r["key"], "name": r["name"], "tagline": r["tagline"], "rank": r["rank"],
                "strength": r["strength"], "dossier": r["dossier"],
                "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else r["created_at"],
            })
    load_json_rows(client, f"{T}.codex_megatrends", new_rows, replace=True)
    print(f"\nApplied: wrote refreshed '{key}' dossier ({len(new_rows)} total rows kept). Now run:\n  python scripts/rank_codex_megatrends.py --apply")


if __name__ == "__main__":
    main()
