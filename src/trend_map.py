"""
TrendLens — Trend Map (our own megatrend report, reverse-engineered from the internet)

The uploaded agency decks follow one grammar: MEGATREND (consumer force) →
SUBTRENDS (themes) → named ingredients, real products, behaviours and
psychographics as evidence. This module authors the same hierarchy bottom-up
from the open web — world + US — instead of buying it:

  harvest (broad world+US Google News queries from config/settings.yaml
  `trend_map.seed_queries`)
  -> Claude extraction of deck-grammar entities (products / ingredients /
     behaviours / psychographics), each with a geo tag and cited sources
  -> corroboration (>= support_floor distinct publishers)
  -> merge in the White Space Scout's accumulated finds (lab_ideas) as
     pre-corroborated product evidence
  -> Claude bottom-up clustering: entities -> subtrends -> megatrends
     (cite-or-die), each megatrend tagged with a geo lean and compared to the
     uploaded deck megatrends (overlap_deck null = we found something new)
  -> table `trend_map_nodes` (full replace = idempotent), shaped like
     `taxonomy_nodes` so our map and the agency decks compare row for row

Usage:
    python -m src.trend_map                 # full build (harvest -> extract -> cluster -> write)
    python -m src.trend_map --harvest-only  # harvest to output/map/harvest.json (no LLM, no BQ writes)
    python -m src.trend_map --from-dump     # run LLM stages from the harvest dump (no re-harvest)
"""

import argparse
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery

from src.common import bq_client, complete_json, dataset_ref, load_json_rows, load_settings
from src.lab import _norm, harvest_news

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

HARVEST_DUMP = Path(__file__).parent.parent / "output" / "map" / "harvest.json"
EXTRACT_CHUNK = 35
LEVELS = {"products": "product", "ingredients": "ingredient",
          "behaviours": "behaviour", "psychographics": "psychographic"}


MAP_EXTRACT_PROMPT = """You are extracting food & beverage trend evidence from real news articles, to build a bottom-up trend report for the US market with global context. There is NO predefined taxonomy — extract only what the sources actually discuss.

Below are {n} sources (headline + snippet, sometimes article text), each with an index.

## Sources
{corpus}

## What to extract
- "products": specific product types or formats gaining ground (e.g. "protein soda", "korean corn dog") — NOT single branded SKUs unless the format itself is the story
- "ingredients": named ingredients or components being featured (e.g. "tallow", "yuzu", "koji")
- "behaviours": observable consumer ACTIONS (e.g. "eating breakfast at convenience stores")
- "psychographics": VALUES, attitudes or identities driving choices (e.g. "protein as identity")

## Rules
- ONLY extract what these sources genuinely discuss — no outside knowledge, no invented trends.
- HUMAN food & beverage only — never pet food, feed, or kitchenware.
- Be SPECIFIC and concrete. No vague meta-categories ("health trend", "snacking innovation").
- "geo": where the source places it — "US", "global", or a country/region name (e.g. "Japan", "Europe").
- For products and ingredients add "search_term": a short phrase a US consumer would type into Google.
- For EVERY item add "description": one concrete sentence, grounded in the sources.
- For EVERY item list "sources": the index numbers of the sources that support it.

## Output — ONLY JSON, no fencing:
{{
  "products":       [{{"name": "...", "geo": "...", "search_term": "...", "description": "...", "sources": [0, 4]}}],
  "ingredients":    [{{"name": "...", "geo": "...", "search_term": "...", "description": "...", "sources": [2]}}],
  "behaviours":     [{{"name": "...", "geo": "...", "description": "...", "sources": [3]}}],
  "psychographics": [{{"name": "...", "geo": "...", "description": "...", "sources": [1, 5]}}]
}}"""


MAP_CLUSTER_PROMPT = """You are authoring a bottom-up food & beverage MEGATREND REPORT for Tyson Foods — US market with global context — from harvested evidence. This is the reverse of reading an agency deck: the evidence writes the report.

Below are {n} evidence entities. Each has an id, a level (product / ingredient / behaviour / psychographic), a geo, a description, and its publisher support.

## Evidence entities
{entities}

## Task
1. Group related entities into SUBTRENDS — coherent themes a product team could act on (3-6 per megatrend).
2. Roll subtrends into MEGATRENDS (max {max_megatrends}) — the big consumer forces the subtrends share.

## Hard rules — cite or die
- Use ONLY the entities above. NO outside knowledge, NO industry-report buzzwords, NO invented themes.
- Every subtrend must list the entity_ids of >= 2 member entities.
- Every megatrend must be formed from >= 4 entities across its subtrends.
- A good megatrend mixes evidence levels — ingredients AND products AND a behaviour or psychographic — like a real trend report chapter.
- "geo": for each megatrend and subtrend — "US", "global", or the dominant region, judged from its members' geos.
- Name megatrends from what the evidence shows, in plain consumer language. Description: 1-2 sentences on the underlying consumer force.
- Leave genuinely unrelated entities unassigned — do NOT force everything in.

## Deck comparison
These megatrends already exist in our uploaded industry decks: {deck_names}
For each of YOUR megatrends set "overlap_deck" to the matching deck megatrend name if it expresses the same idea, else null (null = we found something the decks don't cover).

## Output — ONLY JSON, no fencing:
{{
  "megatrends": [
    {{
      "name": "...", "description": "...", "geo": "global", "overlap_deck": null,
      "subtrends": [
        {{"name": "...", "description": "...", "geo": "US", "entity_ids": ["ent_a1", "ent_b2"]}}
      ]
    }}
  ]
}}"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _node(level: str, name: str, now: str, *, parent_id: str | None = None, description: str | None = None,
          geo: str | None = None, search_term: str | None = None, support: int | None = None,
          sources: str = "[]", megatrend_name: str | None = None, subtrend_name: str | None = None,
          overlap_deck: str | None = None, evidence_origin: str | None = None) -> dict:
    return {
        "node_id": f"map_{uuid.uuid4().hex[:12]}", "parent_id": parent_id, "level": level,
        "name": name, "description": description, "geo": geo, "search_term": search_term,
        "support": support, "sources": sources, "megatrend_name": megatrend_name,
        "subtrend_name": subtrend_name, "overlap_deck": overlap_deck,
        "evidence_origin": evidence_origin, "created_at": now,
    }


def extract_entities(corpus: list[dict]) -> list[dict]:
    """Claude extracts deck-grammar entities per corpus chunk; merged by (level, normalized name)."""
    merged: dict[tuple[str, str], dict] = {}
    for start in range(0, len(corpus), EXTRACT_CHUNK):
        chunk = corpus[start:start + EXTRACT_CHUNK]
        block = "\n".join(f"[{i}] ({it.get('source') or 'unknown'}) {it['text'][:600]}" for i, it in enumerate(chunk))
        try:
            out = complete_json(MAP_EXTRACT_PROMPT.format(n=len(chunk), corpus=block))
        except Exception as e:  # noqa: BLE001
            logger.warning("Map extraction failed for chunk at %d: %s", start, e)
            continue
        for plural, level in LEVELS.items():
            for it in out.get(plural, []):
                nm = (it.get("name") or "").strip()
                idxs = [i for i in (it.get("sources") or []) if isinstance(i, int) and 0 <= i < len(chunk)]
                if not nm or not idxs:
                    continue
                srcs = [{"title": chunk[i]["title"], "url": chunk[i].get("link"),
                         "source": chunk[i].get("source") or "unknown"} for i in dict.fromkeys(idxs)]
                key = (level, _norm(nm))
                if key in merged:
                    merged[key]["_sources"].extend(srcs)
                else:
                    merged[key] = {
                        "name": nm, "level": level,
                        "description": (it.get("description") or "").strip() or None,
                        "geo": (it.get("geo") or "").strip() or None,
                        "search_term": (it.get("search_term") or "").strip().lower() or None,
                        "evidence_origin": "news", "_sources": srcs,
                    }
    logger.info("Map extraction: %d distinct entities before corroboration", len(merged))
    return list(merged.values())


def corroborate(entities: list[dict], support_floor: int) -> list[dict]:
    kept = []
    for e in entities:
        publishers = {s["source"] for s in e["_sources"] if s.get("source")}
        e["support"] = len(publishers)
        if len(publishers) >= support_floor:
            kept.append(e)
    logger.info("Corroboration: %d / %d entities kept (floor %d)", len(kept), len(entities), support_floor)
    return kept


def scout_evidence(client: bigquery.Client, project_id: str, dataset_id: str) -> list[dict]:
    """White Space Scout finds as pre-corroborated product evidence (deduped by name)."""
    try:
        rows = [dict(r) for r in client.query(f"""
            SELECT name, description, origin, search_term, support, sources
            FROM `{project_id}.{dataset_id}.lab_ideas` ORDER BY created_at DESC""").result()]
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not read scout evidence (skipped): %s", e)
        return []
    seen: dict[str, dict] = {}
    for r in rows:
        seen.setdefault(_norm(r["name"]), r)
    out = []
    for r in seen.values():
        out.append({
            "name": r["name"], "level": "product", "description": r.get("description"),
            "geo": r.get("origin"), "search_term": r.get("search_term"),
            "support": int(r.get("support") or 1), "evidence_origin": "scout",
            "_sources": json.loads(r.get("sources") or "[]"),
        })
    logger.info("Scout evidence: %d pre-corroborated finds merged in", len(out))
    return out


def fetch_deck_names(client: bigquery.Client, project_id: str, dataset_id: str) -> list[str]:
    try:
        return [r["cluster_name"] for r in client.query(
            f"SELECT cluster_name FROM `{project_id}.{dataset_id}.megatrend_clusters`").result()]
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not read deck megatrends (comparison skipped): %s", e)
        return []


def cluster(entities: list[dict], deck_names: list[str], max_megatrends: int) -> list[dict]:
    for i, e in enumerate(entities):
        e["_id"] = f"ent_{i:04d}"
    lines = []
    for e in entities:
        pubs = sorted({s.get("source") for s in e["_sources"] if s.get("source")})
        lines.append(f'- {e["_id"]} [{e["level"]}, {e.get("geo") or "?"}] "{e["name"]}" — '
                     f'{e.get("description") or ""} (publishers: {", ".join(pubs) or "scout evidence"})')
    out = complete_json(MAP_CLUSTER_PROMPT.format(
        n=len(entities), entities="\n".join(lines),
        max_megatrends=max_megatrends, deck_names=json.dumps(deck_names)))
    megatrends = out.get("megatrends", [])
    logger.info("Clustering: %d megatrends proposed", len(megatrends))
    return megatrends


def build_rows(megatrends: list[dict], entities: list[dict], now: str) -> list[dict]:
    """Assemble the full hierarchy: megatrend -> subtrend -> entity nodes (+ unassigned orphans)."""
    by_id = {e["_id"]: e for e in entities}
    assigned: set[str] = set()
    rows: list[dict] = []
    for mega in megatrends:
        m_name = (mega.get("name") or "").strip()
        if not m_name:
            continue
        m_node = _node("megatrend", m_name, now, description=mega.get("description"),
                       geo=(mega.get("geo") or "").strip() or None,
                       overlap_deck=(mega.get("overlap_deck") or "").strip() or None,
                       megatrend_name=m_name)
        members = 0
        sub_rows: list[dict] = []
        for sub in mega.get("subtrends", []):
            s_name = (sub.get("name") or "").strip()
            kids = [by_id[i] for i in (sub.get("entity_ids") or []) if i in by_id and i not in assigned]
            if not s_name or len(kids) < 2:
                continue
            s_node = _node("subtrend", s_name, now, parent_id=m_node["node_id"],
                           description=sub.get("description"), geo=(sub.get("geo") or "").strip() or None,
                           megatrend_name=m_name, subtrend_name=s_name)
            sub_rows.append(s_node)
            for e in kids:
                assigned.add(e["_id"])
                members += 1
                sub_rows.append(_node(
                    e["level"], e["name"], now, parent_id=s_node["node_id"],
                    description=e.get("description"), geo=e.get("geo"),
                    search_term=e.get("search_term"), support=e.get("support"),
                    sources=json.dumps(list({(s.get("title"), s.get("url")): s
                                             for s in e["_sources"]}.values())[:4]),
                    megatrend_name=m_name, subtrend_name=s_name,
                    evidence_origin=e.get("evidence_origin")))
        if members < 4:
            logger.warning("Dropping megatrend %r — only %d cited entities", m_name, members)
            continue
        rows.append(m_node)
        rows.extend(sub_rows)
    for e in entities:
        if e["_id"] not in assigned:
            rows.append(_node(e["level"], e["name"], now, description=e.get("description"),
                              geo=e.get("geo"), search_term=e.get("search_term"), support=e.get("support"),
                              sources=json.dumps(e["_sources"][:4]), evidence_origin=e.get("evidence_origin")))
    return rows


def run_build(corpus: list[dict]) -> None:
    cfg = load_settings()["trend_map"]
    client = bq_client()
    project_id, dataset_id = dataset_ref()
    now = _now()

    entities = corroborate(extract_entities(corpus), int(cfg["support_floor"]))
    entities += scout_evidence(client, project_id, dataset_id)
    if len(entities) < 8:
        logger.error("Only %d entities — not enough to author a map", len(entities))
        return
    deck = fetch_deck_names(client, project_id, dataset_id)
    megatrends = cluster(entities, deck, int(cfg["max_megatrends"]))
    rows = build_rows(megatrends, entities, now)
    if not any(r["level"] == "megatrend" for r in rows):
        logger.error("No megatrends survived cite-or-die — table left unchanged")
        return
    load_json_rows(client, f"{project_id}.{dataset_id}.trend_map_nodes", rows, replace=True)
    n_mega = sum(1 for r in rows if r["level"] == "megatrend")
    logger.info("Trend Map complete — %d megatrends, %d nodes (%d new vs decks)",
                n_mega, len(rows), sum(1 for r in rows if r["level"] == "megatrend" and not r["overlap_deck"]))


def run_harvest_only() -> None:
    cfg = load_settings()["trend_map"]
    corpus = harvest_news(cfg["seed_queries"], int(cfg["max_body_fetch"]))
    HARVEST_DUMP.parent.mkdir(parents=True, exist_ok=True)
    HARVEST_DUMP.write_text(json.dumps({"harvested_at": _now(), "corpus": corpus},
                                       ensure_ascii=False, indent=1), encoding="utf-8")
    logger.info("Harvest dumped to %s (%d articles)", HARVEST_DUMP, len(corpus))


def run_from_dump() -> None:
    if not HARVEST_DUMP.exists():
        logger.error("No harvest dump at %s — run --harvest-only first", HARVEST_DUMP)
        return
    corpus = json.loads(HARVEST_DUMP.read_text(encoding="utf-8")).get("corpus", [])
    logger.info("Loaded %d articles from %s", len(corpus), HARVEST_DUMP)
    run_build(corpus)


def main() -> None:
    parser = argparse.ArgumentParser(description="TrendLens — Trend Map (bottom-up megatrend report)")
    parser.add_argument("--harvest-only", action="store_true",
                        help="Harvest to output/map/harvest.json (no LLM, no BQ writes)")
    parser.add_argument("--from-dump", action="store_true",
                        help="Run LLM stages from output/map/harvest.json (no re-harvest)")
    args = parser.parse_args()
    if args.harvest_only:
        run_harvest_only()
    elif args.from_dump:
        run_from_dump()
    else:
        cfg = load_settings()["trend_map"]
        corpus = harvest_news(cfg["seed_queries"], int(cfg["max_body_fetch"]))
        if not corpus:
            logger.error("Harvest returned no articles — aborting")
            return
        run_build(corpus)


if __name__ == "__main__":
    main()
