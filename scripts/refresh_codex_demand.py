"""
TrendLens — Megatrend Codex demand refresh.

The `demand` block (risers/decliners) baked into each codex_megatrends dossier was a
frozen snapshot from a single 2026-07-24 Google Trends measurement. Live re-checks
found it materially stale — some terms had drifted or even flipped sign since (e.g.
"fermented vegetables" was -20.5% in the protein dossier; a fresh measurement gives
+0.8%). This is a pure-data fix, no LLM needed for the numbers themselves:

  1. Collect every {term} appearing in any dossier's demand.risers/decliners.
  2. Re-measure each one live via a real browser (src.trends_browser, the same
     mechanism map_searches.py uses) and re-derive yoy_growth via src.trend_math
     (which guards against the low-base "+1245%" artifact map_searches.py's simpler
     metrics_for() doesn't).
  3. Re-partition each dossier's terms into risers (yoy > 0) / decliners (yoy <= 0)
     from the FRESH numbers — a term that flipped sign moves to the other bucket
     instead of sitting there contradicting its own label. A term Google blocked on
     this run keeps its previous value untouched rather than being dropped or nulled.
  4. Recompute strength.rising_terms / avg_yoy_growth from the fresh numbers (the
     only two `strength` fields rank_codex_megatrends.py doesn't itself recompute —
     it just carries them forward from whatever's already there).
  5. One tiny LLM call per affected key rewrites `demand.summary` (a single sentence)
     to match the fresh numbers — everything else in this script is arithmetic.

Also reports which dossiers have an empty demand block entirely (convenience,
cleanlabel, blur, glp1 as of this writing) — those need real term selection, which
is out of scope here; this script only refreshes numbers that already exist.

Usage:
    python scripts/refresh_codex_demand.py            # dry run
    python scripts/refresh_codex_demand.py --apply
"""

import argparse
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import google.cloud.bigquery as bq

sys.path.insert(0, str(Path(__file__).parent.parent))
from src import trend_math, trends_browser  # noqa: E402
from src.common import bq_client, complete_json, dataset_ref, load_json_rows  # noqa: E402

SUMMARY_PROMPT = """This is the demand section of a Tyson Foods TrendLens Megatrend Codex dossier — \
rewrite ONLY its one-sentence summary to match freshly re-measured Google Trends numbers. Match the \
existing voice exactly (analytical, em dashes for asides, specific % call-outs woven into the sentence, \
one takeaway about WHY these terms move the way they do). Do not invent a cause not implied by which \
terms rose vs fell.

OLD_SUMMARY (for voice/style only — its numbers are now stale, ignore them):
%%OLD_SUMMARY%%

FRESH risers (term, yoy%%, descending):
%%RISERS%%

FRESH decliners (term, yoy%%, most negative first):
%%DECLINERS%%

Output ONE compact JSON object: {"summary": "<one sentence>"}
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    client = bq_client()
    project_id, dataset_id = dataset_ref()
    T = f"{project_id}.{dataset_id}"

    rows = list(client.query(f"SELECT `key`, name, tagline, rank, strength, dossier, created_at FROM `{T}.codex_megatrends`").result())

    dossiers = {r["key"]: json.loads(r["dossier"]) for r in rows}
    empty_demand = [k for k, d in dossiers.items() if not d.get("demand", {}).get("risers") and not d.get("demand", {}).get("decliners")]
    populated = [k for k in dossiers if k not in empty_demand]

    all_terms: set[str] = set()
    for k in populated:
        d = dossiers[k]["demand"]
        all_terms.update(x["term"] for x in d.get("risers", []))
        all_terms.update(x["term"] for x in d.get("decliners", []))
    all_terms = sorted(all_terms)

    print(f"Dossiers with a demand block: {populated}")
    print(f"Dossiers with NO demand block (not touched by this script): {empty_demand}")
    print(f"{len(all_terms)} distinct demand terms to re-measure\n")

    # Borrow (report_id, node_id, node_level, node_name, subtrend_name, megatrend_name)
    # from each term's most recent existing row — trend_searches requires non-null
    # report_id/node_id, and this is a genuine re-measurement of the same tracked entity.
    meta_rows = list(client.query(f"""
        SELECT term, ARRAY_AGG(STRUCT(report_id, node_id, node_level, node_name, subtrend_name, megatrend_name)
                                ORDER BY captured_at DESC LIMIT 1)[OFFSET(0)] meta
        FROM `{T}.trend_searches` WHERE term IN UNNEST(@terms) GROUP BY term
    """, job_config=bq.QueryJobConfig(query_parameters=[bq.ArrayQueryParameter("terms", "STRING", all_terms)])).result())
    meta_by_term = {r["term"]: dict(r["meta"]) for r in meta_rows}

    unmeasurable = [t for t in all_terms if t not in meta_by_term]
    if unmeasurable:
        print(f"WARNING: {len(unmeasurable)} terms have no prior trend_searches row at all "
              f"(can't satisfy trend_searches' NOT NULL report_id/node_id) — skipping: {unmeasurable}")
    terms_to_measure = [t for t in all_terms if t in meta_by_term]

    print(f"Measuring {len(terms_to_measure)} terms via a real browser (~{len(terms_to_measure) * 6 // 60} min)...")
    series_map = trends_browser.measure(terms_to_measure)

    now = datetime.now(timezone.utc).isoformat()
    week_of = datetime.now(timezone.utc).date().isoformat()
    fresh: dict[str, dict] = {}
    new_rows = []
    for term in terms_to_measure:
        m = trend_math.analyze(series_map.get(term, []))
        fresh[term] = m
        meta = meta_by_term[term]
        new_rows.append({
            "search_id": f"srch_{uuid.uuid4().hex[:12]}",
            "report_id": meta["report_id"], "node_id": meta["node_id"], "node_level": meta["node_level"],
            "term": term, "node_name": meta["node_name"],
            "subtrend_name": meta["subtrend_name"], "megatrend_name": meta["megatrend_name"],
            "current_interest": m.get("current"), "yoy_growth": m.get("yoy_growth"),
            "is_rising": bool(m.get("is_rising")), "has_data": bool(m.get("has_data")),
            "interest_series": json.dumps([int(v) for v in series_map.get(term, []) if v is not None]),
            "week_of": week_of, "captured_at": now,
        })
        status = m.get("classification", "no-data")
        print(f"  {term:35s} yoy={m.get('yoy_growth')!s:>8} interest={m.get('current')!s:>4}  {status}")

    kept_stale, moved, dropped_low_base = 0, 0, 0
    new_dossiers = {}
    for key in populated:
        d = dossiers[key]
        old_demand = d["demand"]
        pool = {x["term"]: x["yoy"] for x in old_demand.get("risers", [])}
        pool.update({x["term"]: x["yoy"] for x in old_demand.get("decliners", [])})

        for term in list(pool):
            m = fresh.get(term)
            if m and m.get("yoy_growth") is not None:
                if m.get("low_base"):
                    # trend_math's own guard: baseline < 5 makes the % swing statistically
                    # meaningless (this is exactly the "+1245%" artifact) — don't platform it
                    # as a headline stat, even freshly measured.
                    del pool[term]
                    dropped_low_base += 1
                else:
                    pool[term] = m["yoy_growth"]
            else:
                kept_stale += 1  # blocked/no-data this run — leave the old value alone

        risers = sorted([{"term": t, "yoy": y} for t, y in pool.items() if y is not None and y > 0],
                        key=lambda x: -x["yoy"])
        decliners = sorted([{"term": t, "yoy": y} for t, y in pool.items() if y is not None and y <= 0],
                           key=lambda x: x["yoy"])
        old_terms_bucket = {x["term"]: "riser" for x in old_demand.get("risers", [])}
        old_terms_bucket.update({x["term"]: "decliner" for x in old_demand.get("decliners", [])})
        for r in risers:
            if old_terms_bucket.get(r["term"]) == "decliner":
                moved += 1
        for r in decliners:
            if old_terms_bucket.get(r["term"]) == "riser":
                moved += 1

        rising_terms = sum(1 for t in pool if fresh.get(t, {}).get("is_rising"))
        yoy_values = [y for y in pool.values() if y is not None]
        avg_yoy = round(sum(yoy_values) / len(yoy_values), 1) if yoy_values else 0.0

        summary_resp = complete_json(
            SUMMARY_PROMPT
            .replace("%%OLD_SUMMARY%%", old_demand.get("summary", ""))
            .replace("%%RISERS%%", json.dumps(risers, ensure_ascii=False))
            .replace("%%DECLINERS%%", json.dumps(decliners, ensure_ascii=False)),
            max_tokens=600,
        )

        d["demand"] = {"summary": summary_resp.get("summary", old_demand.get("summary", "")),
                       "risers": risers, "decliners": decliners}
        new_dossiers[key] = (d, rising_terms, avg_yoy)
        print(f"\n'{key}': {len(risers)} risers, {len(decliners)} decliners, "
              f"rising_terms={rising_terms}, avg_yoy={avg_yoy}")
        print(f"  new summary: {d['demand']['summary']}")

    print(f"\n{kept_stale} term-instances kept their old (stale) value this run (blocked/no fresh data)")
    print(f"{moved} term-instances moved bucket (riser<->decliner) after re-measurement")
    print(f"{dropped_low_base} term-instances dropped from their dossier's demand list (fresh measurement hit trend_math's low-base guard)")

    if not args.apply:
        print("\nDry run — pass --apply to write this to BigQuery")
        return

    out_rows = []
    for r in rows:
        key = r["key"]
        if key in new_dossiers:
            d, rising_terms, avg_yoy = new_dossiers[key]
            strength = json.loads(r["strength"])
            strength["rising_terms"] = rising_terms
            strength["avg_yoy_growth"] = avg_yoy
            out_rows.append({
                "key": key, "name": r["name"], "tagline": r["tagline"], "rank": r["rank"],
                "strength": json.dumps(strength), "dossier": json.dumps(d, ensure_ascii=False),
                "created_at": now,
            })
        else:
            out_rows.append({
                "key": key, "name": r["name"], "tagline": r["tagline"], "rank": r["rank"],
                "strength": r["strength"], "dossier": r["dossier"],
                "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else r["created_at"],
            })

    if new_rows:
        load_json_rows(client, f"{T}.trend_searches", new_rows)
    load_json_rows(client, f"{T}.codex_megatrends", out_rows, replace=True)
    print(f"\nApplied: {len(new_rows)} fresh trend_searches rows written, "
          f"{len(new_dossiers)} dossiers' demand blocks refreshed.")


if __name__ == "__main__":
    main()
