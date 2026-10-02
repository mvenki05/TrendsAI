"""
TrendLens — Megatrend Codex dossier generator (automated dossier refresh, step 2).

Consumes output/codex_build/bundle_<key>.json (scripts/build_codex_bundle.py) and
calls Claude via LiteLLM (src.common.complete_json) to produce ADDITIONS ONLY from
the new-evidence pool, then merges them into the existing dossier in Python.

This is deliberately a delta design, not "echo back the whole dossier reworded":
a first attempt asked the model to return the entire ~120KB dossier merged with 50
new reports in one call (~90K input + 64K output tokens) and the LiteLLM gateway's
own nginx timeout (504) killed it before it finished — regardless of the client-side
requests timeout in src.common.complete_json. Asking for only the new material:
  - keeps each call's input small (existing dossier is reduced to just its subtrend
    names + descriptions, not full evidence/opportunities, for matching purposes)
  - keeps output small (additions, not a ~35K-token full-dossier echo)
  - removes the risk of the model silently dropping unrelated existing content while
    "rewriting" it
  - lets new evidence be processed in batches, so no single call is huge

Usage:
    python scripts/generate_codex_dossier.py protein
"""

import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.common import complete_json  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).parent.parent
BUILD_DIR = ROOT / "output" / "codex_build"

BATCH_CHAR_BUDGET = 60_000  # new-evidence chars per LLM call — keeps each call fast
# A richly-evidenced batch can generate more additions than 16000 tokens holds, truncating
# mid-JSON (hit this rolling out to 9 megatrends: 'functional'/'convenience' both lost an
# entire batch's merged progress when a truncated response repaired down to almost nothing).
MAX_TOKENS_PER_BATCH = 24000

DELTA_PROMPT = """You are extending one dossier in the Tyson Foods TrendLens Megatrend Codex — a cited \
trend-intelligence dossier for Tyson's innovation team. You are given the dossier's EXISTING SUBTRENDS \
(name + description only, for matching) and a batch of NEW_EVIDENCE (report pages not yet cited anywhere \
in this dossier). Your job is ONLY to propose additions — you are not rewriting anything.

VOICE: match this dossier's established prose exactly — long, data-dense analytical sentences that weave \
concrete stats and report attribution into the sentence itself, in the register of: "High in protein is \
the #2 most important package claim (of 40) for American consumers, ranking behind fresh but ahead of \
natural, simple ingredients..." Em dashes (—) are part of this voice for parenthetical asides — use them \
the same way. Do not write short chat-style sentences.

CITATIONS: every addition needs a `cite` object of exactly {"kind": "report", "report_id": ..., "page": ..., \
"label": ...} using ONLY the report_id/page/label you were actually given in NEW_EVIDENCE — never invent one.

For each fact worth keeping in NEW_EVIDENCE, decide:
- If it clearly extends an EXISTING subtrend (by exact name match from the list given), add it to \
  `subtrend_evidence_additions` as {"subtrend": "<exact existing name>", "evidence": {"level": \
  "product"|"ingredient"|"behaviour"|"psychographic", "name": "<short behavior/entity name, lowercase, \
  like an existing one>", "detail": "<one cited sentence>", "cite": {...}}}.
- If it clearly doesn't fit ANY existing subtrend, propose a full NEW subtrend in `new_subtrends`: \
  {"name", "description" (one dense cited-in-prose paragraph), "evidence": [3-6 items shaped like above], \
  "opportunities": [1-3 items: {"name", "concept", "why_now", "builds_on": [evidence names from this \
  subtrend], "tyson_fit": {"category", "tier": "Core"|"Adjacent"|"Stretch", "reason"}}], "geo": "US"}. \
  Only do this for evidence that is genuinely a distinct new angle — most new evidence should extend an \
  existing subtrend instead.
- A standalone punchy number worth surfacing at the top level goes in `key_stats`: {"stat", "cite"}.
- A new "How might Tyson...?" prompt goes in `tyson_questions`: {"question", "cite"}.
- A newly-spotted category whitespace gap goes in `whitespace`: {"name", "note", "cite"}.
- Skip anything redundant with what's already implied by the existing subtrend descriptions, or too minor \
  to matter. Quality over quantity — most batches should yield a handful of additions, not one per report.

Output ONE compact JSON object (no markdown fences, no commentary) with exactly these keys: \
key_stats, subtrend_evidence_additions, new_subtrends, tyson_questions, whitespace. Use empty arrays \
for anything you have nothing to add.

EXISTING_SUBTRENDS (name + description only):
%%SUBTRENDS%%

NEW_EVIDENCE (report pages as {report_id, page, label, text}):
%%EVIDENCE%%
"""

DELTA_REQUIRED_KEYS = ["key_stats", "subtrend_evidence_additions", "new_subtrends", "tyson_questions", "whitespace"]


def batch_evidence(new_evidence: list[dict]) -> list[list[dict]]:
    """Flatten to one {report_id, page, label, text} entry per chunk, then bucket by
    BATCH_CHAR_BUDGET so no single LLM call gets an oversized prompt."""
    flat = []
    for report in new_evidence:
        for chunk in report["chunks"]:
            flat.append({
                "report_id": report["report_id"],
                "page": chunk["page"],
                "label": report["label"],
                "text": chunk["text"],
            })

    batches: list[list[dict]] = []
    current: list[dict] = []
    current_chars = 0
    for item in flat:
        item_chars = len(item["text"])
        if current and current_chars + item_chars > BATCH_CHAR_BUDGET:
            batches.append(current)
            current, current_chars = [], 0
        current.append(item)
        current_chars += item_chars
    if current:
        batches.append(current)
    return batches


def call_batch(subtrend_index: list[dict], batch: list[dict]) -> dict:
    prompt = (
        DELTA_PROMPT
        .replace("%%SUBTRENDS%%", json.dumps(subtrend_index, ensure_ascii=False))
        .replace("%%EVIDENCE%%", json.dumps(batch, ensure_ascii=False))
    )
    delta = complete_json(prompt, max_tokens=MAX_TOKENS_PER_BATCH)
    missing = [k for k in DELTA_REQUIRED_KEYS if k not in delta]
    if missing:
        raise RuntimeError(f"Delta response missing keys {missing}: {list(delta.keys())}")
    return delta


def merge_delta(dossier: dict, delta: dict) -> list[str]:
    """Splice one batch's additions into `dossier` in place. Returns human-readable
    log lines describing what was added, for the run summary."""
    log: list[str] = []

    for stat in delta["key_stats"]:
        dossier.setdefault("key_stats", []).append(stat)
    if delta["key_stats"]:
        log.append(f"+{len(delta['key_stats'])} key_stats")

    by_name = {s["name"]: s for s in dossier.get("subtrends", [])}
    unmatched = 0
    for add in delta["subtrend_evidence_additions"]:
        sub = by_name.get(add["subtrend"])
        if sub is None:
            unmatched += 1
            continue
        sub.setdefault("evidence", []).append(add["evidence"])
    if delta["subtrend_evidence_additions"]:
        log.append(f"+{len(delta['subtrend_evidence_additions']) - unmatched} subtrend evidence items"
                    + (f" ({unmatched} unmatched subtrend name, dropped)" if unmatched else ""))

    for new_sub in delta["new_subtrends"]:
        if new_sub["name"] in by_name:
            by_name[new_sub["name"]].setdefault("evidence", []).extend(new_sub.get("evidence", []))
        else:
            dossier.setdefault("subtrends", []).append(new_sub)
            by_name[new_sub["name"]] = new_sub
            log.append(f"+new subtrend '{new_sub['name']}'")

    for q in delta["tyson_questions"]:
        dossier.setdefault("tyson_questions", []).append(q)
    if delta["tyson_questions"]:
        log.append(f"+{len(delta['tyson_questions'])} tyson_questions")

    for w in delta["whitespace"]:
        dossier.setdefault("whitespace", []).append(w)
    if delta["whitespace"]:
        log.append(f"+{len(delta['whitespace'])} whitespace")

    return log


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    key = sys.argv[1]

    bundle_path = BUILD_DIR / f"bundle_{key}.json"
    if not bundle_path.exists():
        raise SystemExit(f"{bundle_path} missing — run scripts/build_codex_bundle.py {key} first")
    bundle = json.loads(bundle_path.read_text(encoding="utf-8"))

    if not bundle["new_evidence"]:
        logger.info("No new evidence for '%s' — nothing to refresh, existing dossier is already current", key)
        return

    dossier = json.loads(json.dumps(bundle["existing_dossier"]))  # deep copy
    subtrend_index = [{"name": s["name"], "description": s["description"]} for s in dossier.get("subtrends", [])]

    batches = batch_evidence(bundle["new_evidence"])
    logger.info("'%s': %d new-evidence reports split into %d batches", key, len(bundle["new_evidence"]), len(batches))

    failed_batches = 0
    for i, batch in enumerate(batches, start=1):
        logger.info("Batch %d/%d: %d chunks, %d chars — calling complete_json...",
                    i, len(batches), len(batch), sum(len(c["text"]) for c in batch))
        try:
            delta = call_batch(subtrend_index, batch)
        except Exception as e:  # noqa: BLE001
            # One truncated/malformed batch shouldn't discard every other batch's already-
            # merged progress for this key — skip it and keep going.
            logger.warning("Batch %d/%d failed, skipping (its evidence is just not added this run): %s", i, len(batches), e)
            failed_batches += 1
            continue
        log_lines = merge_delta(dossier, delta)
        logger.info("Batch %d/%d merged: %s", i, len(batches), "; ".join(log_lines) or "nothing added")
        # A new subtrend from an earlier batch should be matchable by later batches too.
        subtrend_index = [{"name": s["name"], "description": s["description"]} for s in dossier.get("subtrends", [])]

    out_path = BUILD_DIR / f"dossier_{key}.json"
    out_path.write_text(json.dumps(dossier, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Wrote %s (%d chars)%s", out_path, len(json.dumps(dossier)),
                f" — {failed_batches}/{len(batches)} batches skipped" if failed_batches else "")


if __name__ == "__main__":
    main()
