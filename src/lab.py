"""
TrendLens — White Space Scout (the /lab page)

Brings back product IDEAS from the parts of the internet the deck-driven funnel
structurally cannot see. The rest of TrendLens starts from uploaded decks and
works outward; this starts from idea-rich corners of the open web (global
launches, viral dishes, menu innovation, startup CPG) and works inward through
two gates:

  1. NOVELTY gate — every candidate is checked against everything the system
     already knows (deck taxonomy, web discoveries, existing innovation ideas,
     synthesized megatrends). Anything already covered anywhere is discarded.
     The rest of the app is used only as a rejection filter, never as the frame.
  2. BUILDABILITY gate — survivors are judged against Tyson's actual portfolio
     and manufacturing lines (config/brands.yaml). Novel-but-unbuildable ideas
     are kept but flagged, so the page can show them separately.

Pipeline:
  harvest (Google News RSS, idea-rich seed queries from config/settings.yaml)
  -> Claude idea-candidate extraction over the corpus (chunked, source-indexed)
  -> Python prefilter (exact/substring match vs known names — free rejections)
  -> Claude novelty gate vs the known universe (cite the closest known item)
  -> Claude Tyson buildability gate (brand, concept, fit score)
  -> table `lab_ideas` (append, stamped with run_id; the API reads the latest run)
     + `lab_signals` (harvest audit, full replace)

Usage:
    python -m src.lab                 # full run (harvest -> extract -> gates -> write)
    python -m src.lab --harvest-only  # harvest to output/lab/harvest.json (no LLM, no BQ writes)
    python -m src.lab --from-dump     # run LLM stages from output/lab/harvest.json (no re-harvest)
"""

import argparse
import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import yaml
from google.cloud import bigquery

from src import trend_math
from src.common import CONFIG_DIR, bq_client, complete_json, dataset_ref, load_json_rows, load_settings
from src.discover_web import fetch_body, google_news_rss

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

HARVEST_DUMP = Path(__file__).parent.parent / "output" / "lab" / "harvest.json"
EXTRACT_CHUNK = 35   # news sources per idea-extraction call
GATE_CHUNK = 25      # candidates per novelty/fit call


IDEA_EXTRACT_PROMPT = """You are hunting for NEW PRODUCT IDEAS for a protein and prepared-foods company (chicken, sausage, breakfast, deli, hot dogs, frozen meals and snacks), inside real news articles. The goal: formats, dishes, and occasion plays that exist somewhere in the world — launched, on a menu, or genuinely viral — but that a US grocery shopper cannot buy today.

Below are {n} sources (headline + snippet, sometimes article text), each with an index.

## Sources
{corpus}

## What qualifies
A concrete protein- or prepared-food-centered THING with a real format twist:
- New formats of familiar proteins: "Korean cheese corn dog", "chicken skin chips", "folded fried-chicken wrap", "hot dog served in a croissant sleeve"
- Dishes going viral with a repeatable format: "birria ramen cup", "chicken katsu sando"
- Occasion/channel plays proven elsewhere: "konbini hot-case fried chicken", "breakfast yakitori skewers"
- The idea must plausibly involve meat, poultry, egg, or a prepared meal/snack — that is the company's world.

## Automatic rejects — do NOT extract
- Bare new FLAVORS of existing products (a new flavor of wings, chips, sausage) — the FORMAT must be the story
- Line extensions, retailer exclusives, seasonal skins, co-branding stunts
- Beverages, confectionery, dairy, bakery with no protein center
- Trends/narratives, behaviours, market stats, recalls, chain business/openings news

## Rules
- ONLY extract what these sources actually show exists — no invented products, no outside knowledge.
- "wow": one sentence on the format or occasion twist that makes it new — no marketing language.
- "novelty_score": 0-100, how far this is from anything in mainstream US retail today (a new wing flavor ≈ 10; a viral dish with a repeatable format ≈ 50; a proven foreign format unknown in the US ≈ 70+).
- "origin": where it exists per the sources (e.g. "Japan", "Korea", "TikTok", "US c-stores", "UK retail"), or null.
- "search_term": a short phrase a US consumer would type into Google to find it.
- "sources": the index numbers of the sources that support it.

## Output — ONLY JSON, no fencing:
{{"ideas": [{{"name": "...", "description": "...", "wow": "...", "novelty_score": 60, "origin": "...", "search_term": "...", "sources": [0, 3]}}]}}
Quality over quantity. If none qualify, return {{"ideas": []}}."""


NOVELTY_PROMPT = """You are the NOVELTY GATE of a food-trend intelligence system for Tyson Foods. The system already tracks a known universe of trends, subtrends, products, ingredients and concepts (from uploaded industry decks, web discovery, and existing innovation concepts). Your job: for each candidate idea below, decide whether the system ALREADY COVERS it.

## Known universe (everything the system already tracks)
{known}

## Candidate ideas
{candidates}

## Rules
- "Covered" means the known universe contains the same or an essentially equivalent item — same format/idea, minor wording differences. A shared ingredient or theme alone is NOT coverage: "protein soda" is NOT covered by "protein" or "functional drinks".
- Judge each candidate independently. Be strict about real duplicates and generous to genuinely new formats.
- For EVERY candidate return: "name" (echoed exactly), "is_new" (true if NOT covered), "closest_known" (the single nearest known item, or null if nothing comes close), "novelty_reason" (one sentence: if new, what makes it different from the closest known item; if covered, why it duplicates it).

## Output — ONLY JSON, no fencing:
{{"verdicts": [{{"name": "...", "is_new": true, "closest_known": "...", "novelty_reason": "..."}}]}}"""


FIT_PROMPT = """You are the BUILDABILITY GATE of a food innovation system for Tyson Foods. Each idea below was found on the open internet and is genuinely new to the system. Decide whether Tyson could realistically build and sell it, anchor it to a real Tyson product category, and shape the buildable ones into Tyson concepts.

## Tyson portfolio & capabilities
{portfolio}

## Tyson's actual retail categories (from its live product catalog, with SKU counts)
{categories}

## Novel ideas
{candidates}

## Rules
- "buildable" = true only if a protein-centric or prepared-food version is plausible on Tyson's existing manufacturing lines with one of its brands, AND the result lands in one of the categories above. (A Korean corn dog: yes — breading/frying lines, FVAP. Freeze-dried candy: no category, no line.)
- For buildable ideas fill in: "category" (the single best-fit category name, EXACTLY as written above), "tyson_brand" (best-fit brand — recorded for later brand-mapping only), "concept_name" (a BRAND-NEUTRAL working name for the translation — never include a brand name), "pitch" (one sentence: how the idea's FORMAT — not just its flavor — maps onto the category and lines; no brand names), "fit_score" (0-100: manufacturing adjacency + brand permission + how directly it lands in the category), "fit_rationale" (one sentence, no brand names).
- The translation must preserve what makes the idea new. If the Tyson version loses the twist (it becomes an ordinary product), set "buildable": false instead.
- For non-buildable ideas: "buildable": false, "category": null, "fit_rationale": one sentence on why not; set the other fields null.
- Judge only from the idea descriptions — do not invent evidence or market claims.

## Output — ONLY JSON, no fencing:
{{"fits": [{{"name": "...", "buildable": true, "category": "FVAP", "tyson_brand": "...", "concept_name": "...", "pitch": "...", "fit_score": 78, "fit_rationale": "..."}}]}}"""


SUBTREND_CLUSTER_PROMPT = """You are finding EMERGING MARKET TRENDS bottom-up, from product ideas a scout harvested off the open internet for Tyson Foods. Each idea is a real product, dish, or format that exists somewhere but is new to the company's trend system.

## Scout finds (accumulated across runs)
{ideas}

## Existing megatrends (from uploaded industry decks)
{megatrends}

## Task
Group related finds into EMERGING SUBTRENDS — a named market direction a product team could plan against (e.g. several Japanese convenience formats → one "konbini-ization" subtrend).

## Hard rules — cite or die
- Every subtrend must cite >= 2 member finds by their exact "name" values. Singletons stay unclustered.
- Use ONLY the finds above — no outside knowledge, no invented themes, no industry-report buzzwords.
- Name subtrends in plain consumer language from what the evidence shows. "description": 1-2 sentences on the market direction, referencing the kind of evidence.
- For each subtrend set "maps_to_megatrend": the existing megatrend name it expresses (exactly as listed), or null if none genuinely covers it — null means the decks are blind to it, which is the most valuable finding.
- Leave genuinely unrelated finds unclustered — do NOT force everything into a group.

## Output — ONLY JSON, no fencing:
{{"subtrends": [{{"name": "...", "description": "...", "maps_to_megatrend": null, "idea_names": ["...", "..."]}}]}}"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm(name: str) -> str:
    return re.sub(r"\s+", " ", name.lower().strip())


def load_portfolio() -> str:
    """Render config/brands.yaml as prompt context for the buildability gate."""
    with open(CONFIG_DIR / "brands.yaml", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    lines = [str(cfg.get("company", "")).strip(), "", "Brands:"]
    lines += [f"- {b['name']}: {b['plays']}" for b in cfg.get("brands", [])]
    lines += ["", "Manufacturing lines:"]
    lines += [f"- {m}" for m in cfg.get("manufacturing_lines", [])]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Harvest + extraction
# ---------------------------------------------------------------------------

def harvest_news(seed_queries: list[str], max_body_fetch: int) -> list[dict]:
    """Idea-rich Google News harvest -> deduped corpus with bodies attached."""
    seen: set[str] = set()
    corpus: list[dict] = []
    for q in seed_queries:
        for it in google_news_rss(q):
            key = _norm(it["title"])
            if key not in seen:
                seen.add(key)
                it["seed_query"] = q
                corpus.append(it)
        time.sleep(1.0)
    logger.info("News harvest: %d unique articles from %d queries", len(corpus), len(seed_queries))
    for i, it in enumerate(corpus):
        if i < max_body_fetch:
            it["text"] = fetch_body(it)
            time.sleep(0.2)
        else:
            it["text"] = f"{it['title']} — {it['snippet']}"
    return corpus


def extract_ideas(corpus: list[dict]) -> list[dict]:
    """Claude extracts concrete idea candidates per corpus chunk; merged by normalized name."""
    merged: dict[str, dict] = {}
    for start in range(0, len(corpus), EXTRACT_CHUNK):
        chunk = corpus[start:start + EXTRACT_CHUNK]
        block = "\n".join(f"[{i}] ({it.get('source') or 'unknown'}) {it['text'][:600]}" for i, it in enumerate(chunk))
        try:
            out = complete_json(IDEA_EXTRACT_PROMPT.format(n=len(chunk), corpus=block))
        except Exception as e:  # noqa: BLE001
            logger.warning("Idea extraction failed for chunk at %d: %s", start, e)
            continue
        for it in out.get("ideas", []):
            nm = (it.get("name") or "").strip()
            idxs = [i for i in (it.get("sources") or []) if isinstance(i, int) and 0 <= i < len(chunk)]
            if not nm or not idxs:
                continue
            srcs = [{"title": chunk[i]["title"], "url": chunk[i].get("link"),
                     "source": chunk[i].get("source") or "unknown"} for i in dict.fromkeys(idxs)]
            key = _norm(nm)
            try:
                novelty = float(it["novelty_score"]) if it.get("novelty_score") is not None else None
            except (TypeError, ValueError):
                logger.warning("Non-numeric novelty_score %r for %r — stored as null", it.get("novelty_score"), nm)
                novelty = None
            if key in merged:
                merged[key]["_sources"].extend(srcs)
                if novelty is not None:
                    merged[key]["novelty_score"] = max(merged[key].get("novelty_score") or 0, novelty)
            else:
                merged[key] = {
                    "name": nm,
                    "description": (it.get("description") or "").strip() or None,
                    "wow": str(it.get("wow") or "").strip() or None,
                    "novelty_score": novelty,
                    "origin": (it.get("origin") or "").strip() or None,
                    "search_term": (it.get("search_term") or "").strip().lower() or None,
                    "_sources": srcs,
                }
    logger.info("Extraction: %d distinct idea candidates", len(merged))
    return list(merged.values())


# ---------------------------------------------------------------------------
# Known universe + gates
# ---------------------------------------------------------------------------

def fetch_known_universe(client: bigquery.Client, project_id: str, dataset_id: str) -> list[dict]:
    """Everything the system already tracks: [{name, where}] across the four sources."""
    queries = {
        "deck taxonomy": f"SELECT DISTINCT name FROM `{project_id}.{dataset_id}.taxonomy_nodes` WHERE name IS NOT NULL",
        "web discovery": f"SELECT DISTINCT name FROM `{project_id}.{dataset_id}.discovered_nodes` WHERE name IS NOT NULL",
        "innovation concepts": f"SELECT DISTINCT name FROM `{project_id}.{dataset_id}.innovation_ideas` WHERE name IS NOT NULL",
        "megatrends": f"SELECT DISTINCT cluster_name AS name FROM `{project_id}.{dataset_id}.megatrend_clusters`",
    }
    known: list[dict] = []
    for where, q in queries.items():
        try:
            known += [{"name": r["name"], "where": where} for r in client.query(q).result()]
        except Exception as e:  # noqa: BLE001
            logger.warning("Known-universe read failed for %s (skipped): %s", where, e)
    logger.info("Known universe: %d items", len(known))
    return known


def prefilter_known(candidates: list[dict], known: list[dict]) -> tuple[list[dict], list[dict]]:
    """Free rejections before the LLM gate: exact or substring name match vs the known universe.
    Returns (still_candidates, auto_rejected) — rejected rows get closest_known/novelty_reason set."""
    keep: list[dict] = []
    rejected: list[dict] = []
    by_norm = [(_norm(k["name"]), k) for k in known if k.get("name")]
    for c in candidates:
        n = _norm(c["name"])
        hit = next((k for kn, k in by_norm if kn == n or f" {kn} " in f" {n} " or f" {n} " in f" {kn} "), None)
        if hit:
            c["is_new"] = False
            c["closest_known"] = f"{hit['name']} ({hit['where']})"
            c["novelty_reason"] = "Name matches an item the system already tracks."
            rejected.append(c)
        else:
            keep.append(c)
    logger.info("Prefilter: %d auto-rejected as already known, %d go to the novelty gate",
                len(rejected), len(keep))
    return keep, rejected


def novelty_gate(candidates: list[dict], known: list[dict]) -> None:
    """Claude judges each remaining candidate vs the known universe; annotates in place."""
    known_block = "\n".join(f"- {k['name']} ({k['where']})" for k in known) or "(the system tracks nothing yet)"
    by_norm = {_norm(c["name"]): c for c in candidates}
    for start in range(0, len(candidates), GATE_CHUNK):
        chunk = candidates[start:start + GATE_CHUNK]
        cand_block = "\n".join(f'- "{c["name"]}": {c.get("description") or ""}' for c in chunk)
        try:
            out = complete_json(NOVELTY_PROMPT.format(known=known_block, candidates=cand_block))
        except Exception as e:  # noqa: BLE001
            logger.warning("Novelty gate failed for chunk at %d: %s", start, e)
            continue
        for v in out.get("verdicts", []):
            c = by_norm.get(_norm(str(v.get("name") or "")))
            if c is None:
                continue
            c["is_new"] = bool(v.get("is_new"))
            c["closest_known"] = str(v.get("closest_known") or "").strip() or None
            c["novelty_reason"] = str(v.get("novelty_reason") or "").strip() or None
    new = sum(1 for c in candidates if c.get("is_new"))
    logger.info("Novelty gate: %d / %d candidates are new to the system", new, len(candidates))


def fetch_tyson_categories(client: bigquery.Client, project_id: str, dataset_id: str) -> str:
    """Real Tyson retail categories with SKU counts, rendered for the fit gate prompt."""
    try:
        rows = client.query(
            f"SELECT category, COUNT(*) AS n FROM `{project_id}.{dataset_id}.tyson_products` "
            "WHERE category IS NOT NULL GROUP BY category ORDER BY n DESC").result()
        return "\n".join(f"- {r['category']} ({r['n']} SKUs)" for r in rows)
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not read tyson_products categories (fit gate runs without them): %s", e)
        return "(catalog unavailable — judge from the portfolio above)"


def fit_gate(candidates: list[dict], portfolio: str, categories: str) -> None:
    """Claude judges Tyson buildability for novel candidates; annotates in place."""
    by_norm = {_norm(c["name"]): c for c in candidates}
    for start in range(0, len(candidates), GATE_CHUNK):
        chunk = candidates[start:start + GATE_CHUNK]
        lines = []
        for c in chunk:
            seen_in = f" (seen in: {c['origin']})" if c.get("origin") else ""
            lines.append(f'- "{c["name"]}"{seen_in}: {c.get("description") or ""}')
        cand_block = "\n".join(lines)
        try:
            out = complete_json(FIT_PROMPT.format(portfolio=portfolio, categories=categories, candidates=cand_block))
        except Exception as e:  # noqa: BLE001
            logger.warning("Fit gate failed for chunk at %d: %s", start, e)
            continue
        for f in out.get("fits", []):
            c = by_norm.get(_norm(str(f.get("name") or "")))
            if c is None:
                continue
            c["buildable"] = bool(f.get("buildable"))
            c["category"] = str(f.get("category") or "").strip() or None
            c["tyson_brand"] = str(f.get("tyson_brand") or "").strip() or None
            c["concept_name"] = str(f.get("concept_name") or "").strip() or None
            c["pitch"] = str(f.get("pitch") or "").strip() or None
            try:
                c["fit_score"] = float(f["fit_score"]) if f.get("fit_score") is not None else None
            except (TypeError, ValueError):
                logger.warning("Non-numeric fit_score %r for %r — stored as null", f.get("fit_score"), c["name"])
                c["fit_score"] = None
            c["fit_rationale"] = str(f.get("fit_rationale") or "").strip() or None
    buildable = sum(1 for c in candidates if c.get("buildable"))
    logger.info("Fit gate: %d / %d novel ideas are Tyson-buildable", buildable, len(candidates))


# ---------------------------------------------------------------------------
# Rows + orchestration
# ---------------------------------------------------------------------------

def _idea_row(c: dict, run_id: str, now: str) -> dict:
    dedup = list({(s["title"], s.get("url")): s for s in c["_sources"]}.values())[:4]
    publishers = {s["source"] for s in c["_sources"] if s.get("source")}
    return {
        "idea_id": f"ws_{uuid.uuid4().hex[:12]}", "run_id": run_id,
        "name": c["name"], "description": c.get("description"), "origin": c.get("origin"),
        "wow": c.get("wow"), "novelty_score": c.get("novelty_score"),
        "search_term": c.get("search_term"), "support": len(publishers),
        "sources": json.dumps(dedup),
        "closest_known": c.get("closest_known"), "novelty_reason": c.get("novelty_reason"),
        "buildable": bool(c.get("buildable")), "category": c.get("category"),
        "tyson_brand": c.get("tyson_brand"),
        "concept_name": c.get("concept_name"), "pitch": c.get("pitch"),
        "fit_score": c.get("fit_score"), "fit_rationale": c.get("fit_rationale"),
        "status": "new", "created_at": now,
    }


def _signal_rows(corpus: list[dict], now: str) -> list[dict]:
    return [{
        "signal_id": f"sig_{uuid.uuid4().hex[:12]}", "source_type": "news",
        "title": it["title"], "url": it.get("link"), "publisher": it.get("source"),
        "seed_query": it.get("seed_query"), "text": it.get("text"),
        "percent_gain": None, "dma_count": None, "harvested_at": now,
    } for it in corpus]


def run_gates_and_write(corpus: list[dict]) -> None:
    """Everything after harvest: extract -> prefilter -> novelty -> fit -> write."""
    cfg = load_settings()["lab"]
    client = bq_client()
    project_id, dataset_id = dataset_ref()
    now = _now()
    run_id = f"run_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"

    candidates = extract_ideas(corpus)
    if not candidates:
        logger.error("No idea candidates extracted — nothing to gate")
        return
    floor = float(cfg.get("novelty_floor", 0))
    dull = [c for c in candidates if (c.get("novelty_score") or 0) < floor]
    if dull:
        logger.info("Novelty floor %.0f: dropping %d dull candidates (%s)", floor, len(dull),
                    ", ".join(c["name"] for c in dull[:8]))
        candidates = [c for c in candidates if c not in dull]
    if not candidates:
        logger.error("No candidates above the novelty floor — nothing to gate")
        return
    candidates.sort(key=lambda c: (c.get("novelty_score") or 0), reverse=True)
    dropped = len(candidates) - int(cfg["max_candidates"])
    if dropped > 0:
        logger.info("Capping candidates at %d (dropping %d lowest-novelty)", cfg["max_candidates"], dropped)
        candidates = candidates[: int(cfg["max_candidates"])]

    known = fetch_known_universe(client, project_id, dataset_id)
    to_gate, auto_rejected = prefilter_known(candidates, known)
    novelty_gate(to_gate, known)
    novel = [c for c in to_gate if c.get("is_new")]
    if novel:
        fit_gate(novel, load_portfolio(), fetch_tyson_categories(client, project_id, dataset_id))

    # Only novel ideas land on the page; auto/LLM-rejected duplicates are not stored.
    rows = [_idea_row(c, run_id, now) for c in novel]
    if not rows:
        logger.error("No novel ideas survived the gates — nothing written (%d duplicates rejected)",
                     len(auto_rejected) + sum(1 for c in to_gate if not c.get("is_new")))
        return
    load_json_rows(client, f"{project_id}.{dataset_id}.lab_ideas", rows)
    load_json_rows(client, f"{project_id}.{dataset_id}.lab_signals", _signal_rows(corpus, now), replace=True)
    logger.info("White Space Scout complete — %d novel ideas written (%d buildable) as %s",
                len(rows), sum(1 for r in rows if r["buildable"]), run_id)


def run_harvest_only() -> None:
    """Harvest news to a local JSON dump — no LLM calls, no BQ writes."""
    cfg = load_settings()["lab"]
    corpus = harvest_news(cfg["seed_queries"], cfg["max_body_fetch"])
    HARVEST_DUMP.parent.mkdir(parents=True, exist_ok=True)
    HARVEST_DUMP.write_text(json.dumps({"harvested_at": _now(), "corpus": corpus},
                                       ensure_ascii=False, indent=1), encoding="utf-8")
    logger.info("Harvest dumped to %s (%d articles)", HARVEST_DUMP, len(corpus))


def run_full() -> None:
    cfg = load_settings()["lab"]
    corpus = harvest_news(cfg["seed_queries"], cfg["max_body_fetch"])
    if not corpus:
        logger.error("Harvest returned no articles — aborting")
        return
    run_gates_and_write(corpus)


def run_validation() -> None:
    """Measure real Google Trends demand for unmeasured scout ideas, then classify.
    Imported lazily: trends_browser needs Playwright, which the LLM-only paths don't."""
    from src import trends_browser  # noqa: PLC0415

    client = bq_client()
    project_id, dataset_id = dataset_ref()
    rows = list(client.query(f"""
        SELECT DISTINCT search_term
        FROM `{project_id}.{dataset_id}.lab_ideas`
        WHERE search_term IS NOT NULL AND has_data IS NULL
    """).result())
    terms = [r["search_term"] for r in rows]
    if not terms:
        logger.info("No unmeasured scout terms — nothing to validate")
        return
    logger.info("Measuring Google Trends for %d scout terms", len(terms))
    series_map = trends_browser.measure(terms)
    for term in terms:
        series = series_map.get(term, [])
        a = trend_math.analyze(series)
        client.query(
            f"""UPDATE `{project_id}.{dataset_id}.lab_ideas`
                SET interest_series=@ser, has_data=@hd, current_interest=@ci, yoy_growth=@yoy,
                    is_rising=@ris, classification=@cls, is_durable=@dur
                WHERE search_term=@t AND has_data IS NULL""",
            job_config=bigquery.QueryJobConfig(query_parameters=[
                bigquery.ScalarQueryParameter("ser", "STRING", json.dumps(series)),
                bigquery.ScalarQueryParameter("hd", "BOOL", bool(a.get("has_data"))),
                bigquery.ScalarQueryParameter("ci", "INT64", a.get("current")),
                bigquery.ScalarQueryParameter("yoy", "FLOAT64", a.get("yoy_growth")),
                bigquery.ScalarQueryParameter("ris", "BOOL", bool(a.get("is_rising"))),
                bigquery.ScalarQueryParameter("cls", "STRING", a.get("classification")),
                bigquery.ScalarQueryParameter("dur", "BOOL", bool(a.get("is_durable"))),
                bigquery.ScalarQueryParameter("t", "STRING", term),
            ]),
        ).result()
    logger.info("Validation complete — %d terms measured", len(terms))


def fetch_all_ideas(client: bigquery.Client, project_id: str, dataset_id: str) -> list[dict]:
    """All scout finds across runs, deduped by normalized name (latest row wins)."""
    rows = [dict(r) for r in client.query(f"""
        SELECT name, description, origin, category, run_id, is_rising, created_at
        FROM `{project_id}.{dataset_id}.lab_ideas`
        ORDER BY created_at DESC
    """).result()]
    seen: dict[str, dict] = {}
    for r in rows:
        seen.setdefault(_norm(r["name"]), r)
    return list(seen.values())


def run_clustering() -> None:
    """Cluster accumulated scout finds into emerging subtrends (full replace = idempotent)."""
    client = bq_client()
    project_id, dataset_id = dataset_ref()
    now = _now()
    ideas = fetch_all_ideas(client, project_id, dataset_id)
    if len(ideas) < 4:
        logger.error("Only %d scout finds — not enough to cluster", len(ideas))
        return
    by_norm = {_norm(i["name"]): i for i in ideas}
    runs_by_norm = {}
    for r in client.query(f"SELECT name, COUNT(DISTINCT run_id) AS rc "
                          f"FROM `{project_id}.{dataset_id}.lab_ideas` GROUP BY name").result():
        runs_by_norm[_norm(r["name"])] = int(r["rc"])
    try:
        mega_names = [r["cluster_name"] for r in client.query(
            f"SELECT cluster_name FROM `{project_id}.{dataset_id}.megatrend_clusters`").result()]
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not read megatrends (mapping skipped): %s", e)
        mega_names = []

    lines = [f'- "{i["name"]}" [{i.get("category") or "no category"}, seen: {i.get("origin") or "?"}] — '
             f'{i.get("description") or ""}' for i in ideas]
    out = complete_json(SUBTREND_CLUSTER_PROMPT.format(
        ideas="\n".join(lines), megatrends=json.dumps(mega_names)))

    rows = []
    for s in out.get("subtrends", []):
        members = [by_norm[_norm(str(n))] for n in (s.get("idea_names") or []) if _norm(str(n)) in by_norm]
        if len(members) < 2:
            logger.warning("Dropping subtrend %r — cites fewer than 2 known finds", s.get("name"))
            continue
        rows.append({
            "subtrend_id": f"st_{uuid.uuid4().hex[:12]}",
            "name": str(s.get("name") or "").strip(),
            "description": str(s.get("description") or "").strip() or None,
            "idea_names": json.dumps([m["name"] for m in members]),
            "member_count": len(members),
            "run_count": max(len({m["run_id"] for m in members}),
                             max((runs_by_norm.get(_norm(m["name"]), 1) for m in members), default=1)),
            "rising_count": sum(1 for m in members if m.get("is_rising")),
            "maps_to_megatrend": (str(s.get("maps_to_megatrend")).strip()
                                  if s.get("maps_to_megatrend") else None),
            "created_at": now,
        })
    if not rows:
        logger.error("No valid subtrends produced — table left unchanged")
        return
    load_json_rows(client, f"{project_id}.{dataset_id}.lab_subtrends", rows, replace=True)
    logger.info("Clustering complete — %d emerging subtrends from %d finds (%d not in any megatrend)",
                len(rows), len(ideas), sum(1 for r in rows if not r["maps_to_megatrend"]))


def run_from_dump() -> None:
    """Run the LLM stages from a previous --harvest-only dump (cheap prompt iteration)."""
    if not HARVEST_DUMP.exists():
        logger.error("No harvest dump at %s — run --harvest-only first", HARVEST_DUMP)
        return
    corpus = json.loads(HARVEST_DUMP.read_text(encoding="utf-8")).get("corpus", [])
    logger.info("Loaded %d articles from %s", len(corpus), HARVEST_DUMP)
    run_gates_and_write(corpus)


def main() -> None:
    parser = argparse.ArgumentParser(description="TrendLens — White Space Scout (new-idea discovery)")
    parser.add_argument("--harvest-only", action="store_true",
                        help="Harvest signals to output/lab/harvest.json (no LLM, no BQ writes)")
    parser.add_argument("--from-dump", action="store_true",
                        help="Run extraction + gates from output/lab/harvest.json (no re-harvest)")
    parser.add_argument("--validate", action="store_true",
                        help="Measure Google Trends demand for unmeasured scout ideas (Playwright)")
    parser.add_argument("--cluster", action="store_true",
                        help="Cluster accumulated scout finds into emerging subtrends")
    args = parser.parse_args()
    if args.harvest_only:
        run_harvest_only()
    elif args.from_dump:
        run_from_dump()
    elif args.validate:
        run_validation()
    elif args.cluster:
        run_clustering()
    else:
        run_full()


if __name__ == "__main__":
    main()
