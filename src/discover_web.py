"""
TrendLens — Web Discovery

Goes beyond the uploaded decks: for each synthesized megatrend, searches the open
web (free Google News RSS — no API key) for aligned articles, fetches their text,
and extracts subtrends, ingredients, behaviours and psychographics with source
corroboration. Real branded products come from Open Food Facts, derived from the
discovered ingredients (not guessed by the LLM). Behaviours/psychographics that
merely restate a subtrend are excluded. Discovered items are tagged against the
deck taxonomy (in_deck) so you see what's genuinely NEW.

Pipeline per megatrend:
  Claude -> search queries -> Google News RSS -> fetch article bodies (best-effort,
  falls back to headline+snippet) -> Claude structured extraction (subtrends /
  ingredients / behaviours / psychographics) -> Open Food Facts products per
  ingredient -> ≥2-source corroboration floor -> write `discovered_nodes`.

A separate --validate pass measures real Google Trends growth on discovered
product/ingredient terms (reuses src.trends_browser + src.map_searches.metrics_for),
so a discovered ingredient can be confirmed as actually rising.

Tables: writes `discovered_nodes` (replaces a megatrend's rows each run = idempotent).

Usage:
    python -m src.discover_web              # discover gaps (megatrends not done yet)
    python -m src.discover_web --rediscover # re-discover all megatrends
    python -m src.discover_web --validate   # measure Google Trends growth on discovered terms
"""

import argparse
import base64
import json
import logging
import re
import time
import urllib.parse
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup
from google.cloud import bigquery

from src import open_food_facts, trend_math, trends_browser
from src.common import bq_client, complete_json, dataset_ref, load_json_rows

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 TrendLens/0.1"
MAX_PER_QUERY = 12        # RSS results kept per query
MAX_QUERIES = 6           # queries when driving discovery at the megatrend level (fallback)
MAX_QUERIES_PER_SUBTREND = 4  # queries per subtrend when driving discovery at subtrend level
MAX_BODY_FETCH = 10       # articles to fetch full text for (rest use snippet)
SUPPORT_FLOOR = 2         # min distinct sources to keep a discovered item
OFF_PRODUCTS_PER_TERM = 3 # real OFF products to keep per discovered ingredient
OFF_PRODUCT_URL = "https://world.openfoodfacts.org/product/"
LEVELS = ["subtrends", "products", "ingredients", "behaviours", "psychographics"]
LEVEL_SINGULAR = {"subtrends": "subtrend", "products": "product", "ingredients": "ingredient",
                  "behaviours": "behaviour", "psychographics": "psychographic"}


QUERY_PROMPT = """You are researching a US food/consumer megatrend to find current articles about it.
Megatrend: "{name}"
What it means: {desc}

Generate {k} diverse Google News search queries that surface recent articles, blogs and trade press on this megatrend in the US food & beverage market. Cover different angles: new products, novel ingredients, consumer behaviour, and why it's happening. Keep queries short (do NOT over-quote — overly specific quoted queries return nothing).
Return ONLY JSON: {{"queries": ["...", "..."]}}"""


EXTRACT_PROMPT = """You are extracting an innovation taxonomy from real news articles about a US food megatrend.

Megatrend: "{name}" — {desc}

Below are {n} sources (headline + snippet, sometimes article text), each with an index. From ONLY what these sources actually discuss, extract items aligned to this megatrend.

## Sources
{corpus}

## Rules
- Be SPECIFIC and concrete. Do NOT output vague meta-categories like "protein innovation", "protein trend", "growth in the X market", "next-generation ingredients". Output things a product team could act on (a specific subtrend, a named ingredient, a real behaviour or motivation).
- Only include items genuinely supported by the sources — no invented trends.
- Do NOT extract products. Real branded products are sourced separately from Open Food Facts using the ingredients below — your job is the ingredients, not products.
- For each ingredient, add a "search_term": a short normalized phrase to look up on Google Trends.
- For EVERY item, add a "description": one concrete sentence defining what it is, and a "relation": one sentence saying how it expresses this megatrend's meaning (reference the megatrend's actual idea, not a generic statement).
- Subtrends are themes / growth pathways. Behaviours are observable consumer ACTIONS; psychographics are VALUES, attitudes or identities. Do NOT emit a behaviour or psychographic that merely restates a subtrend — include one only if it captures something the subtrends do not. (E.g. if "Snacking replacing meals" is a subtrend, do NOT also list "replaces meals with snacking" as a behaviour; if "Trading down to discount grocers" is a subtrend, do NOT repeat it as a behaviour.)
- For each item, list "sources": the index numbers (1-3) of the sources that support it.

## Output — ONLY JSON, no fencing:
{{
  "subtrends":     [{{"name": "...", "description": "...", "relation": "...", "sources": [0, 4]}}],
  "ingredients":   [{{"name": "...", "search_term": "...", "description": "...", "relation": "...", "sources": [2, 5]}}],
  "behaviours":    [{{"name": "...", "description": "...", "relation": "...", "sources": [3]}}],
  "psychographics":[{{"name": "...", "description": "...", "relation": "...", "sources": [3]}}]
}}"""


INNOVATION_EXTRACT_PROMPT = """You are scanning real news articles about a US food/consumer megatrend to find genuinely novel product concepts — pioneering innovations that challenge category norms, not mainstream products.

Megatrend: "{name}" — {desc}

Below are {n} sources (headline + snippet, sometimes article text), each with an index.

## What qualifies as a "novel innovation"
Unusual delivery mechanisms, unexpected formats, category-crossing ideas, food-tech breakthroughs, startup launches, or global products entering the US market. The bar is: would a Tyson innovation director say "I didn't know that existed"?
Examples at the right novelty level:
- A straw made of compressed whey protein that dissolves in your drink, adding protein to any beverage
- Edible packaging made from seaweed that consumers eat alongside the food
- A chip made from upcycled spent grain from breweries
- Cultivated meat grown from animal cells without slaughter
NOT qualifying (too mainstream): protein bar, plant-based burger, grilled chicken sandwich

## Rules
- Only extract concepts genuinely supported by the sources — no invented products
- Focus on FORMAT, DELIVERY, or INGREDIENT innovation — things that reframe how a consumer engages with this megatrend
- "description": explain WHAT makes it novel — the unique angle, mechanism, or format that sets it apart
- "relation": one sentence on why this innovation is an expression of this specific megatrend
- "sources": index numbers (1-3) of sources that mention it

## Output — ONLY JSON, no fencing:
{{
  "innovations": [
    {{"name": "...", "description": "...", "relation": "...", "sources": [0, 2]}}
  ]
}}
Only include items corroborated by at least 2 independent sources. If nothing qualifies, return {{"innovations": []}}."""


INNOVATION_SUBTREND_EXTRACT_PROMPT = """You are scanning real news articles about a subtrend within a US food megatrend, looking for genuinely novel product concepts.

Megatrend: "{megatrend}" — {mega_desc}
Subtrend: "{subtrend}"

Below are {n} sources (headline + snippet, sometimes article text), each with an index.

## What qualifies as a "novel innovation"
Unusual delivery mechanisms, unexpected formats, category-crossing ideas, food-tech breakthroughs, or startup launches aligned to THIS subtrend. The bar: would a Tyson innovation director say "I didn't know that existed"?
Examples at the right novelty level:
- A straw made of compressed whey protein that dissolves in any drink
- Fermented adaptogen beverages with measurable cortisol-reduction claims
- A chip made from upcycled spent grain
NOT qualifying: protein bar, plant-based burger, grilled chicken

## Rules
- Only extract concepts genuinely supported by the sources
- Focus on FORMAT, DELIVERY, or INGREDIENT innovation
- "description": the unique angle or mechanism that makes it novel
- "relation": why this expresses this megatrend/subtrend
- "sources": index numbers (1-3) of supporting sources

## Output — ONLY JSON, no fencing:
{{
  "innovations": [
    {{"name": "...", "description": "...", "relation": "...", "sources": [0, 2]}}
  ]
}}
Only include items corroborated by at least 2 independent sources. If nothing qualifies, return {{"innovations": []}}."""


SUBTREND_QUERY_PROMPT = """You are researching ONE subtrend within a US food/consumer megatrend, to find current articles.
Megatrend: "{megatrend}" — {mega_desc}
Subtrend: "{subtrend}"

Generate {k} short Google News search queries that surface recent US food & beverage articles specifically about THIS subtrend — new products, novel ingredients, consumer behaviour, and why it's happening. Keep queries short (avoid over-quoting).
Return ONLY JSON: {{"queries": ["...", "..."]}}"""


SUBTREND_EXTRACT_PROMPT = """You are extracting an innovation taxonomy for ONE subtrend of a US food megatrend, from real news articles.

Megatrend: "{megatrend}"
What the megatrend MEANS (use this exact meaning to judge relevance): {mega_desc}
Subtrend: "{subtrend}"

Below are {n} sources (headline + snippet, sometimes article text), each with an index. From ONLY what these sources actually discuss, extract items aligned to THIS subtrend AND to the megatrend meaning above.

## Rules
- Be SPECIFIC and concrete (a named ingredient, a real consumer behaviour, a real motivation). No vague meta-categories.
- Only include items genuinely supported by the sources — no invented trends.
- Do NOT extract products — real branded products come from Open Food Facts via the ingredients.
- For each ingredient, add a "search_term": a short normalized phrase to look up on Google Trends.
- For EVERY item, add a "description": one concrete sentence defining what it is, and a "relation": one sentence saying how it expresses the megatrend meaning above (reference the megatrend's actual idea, not a generic statement).
- Behaviours are observable ACTIONS; psychographics are VALUES, attitudes or identities. Do NOT restate the subtrend itself as a behaviour or psychographic.
- For each item, list "sources": the index numbers (1-3) of the sources that support it.

## Output — ONLY JSON, no fencing:
{{
  "ingredients":   [{{"name": "...", "search_term": "...", "description": "...", "relation": "...", "sources": [2, 5]}}],
  "behaviours":    [{{"name": "...", "description": "...", "relation": "...", "sources": [3]}}],
  "psychographics":[{{"name": "...", "description": "...", "relation": "...", "sources": [3]}}]
}}"""


def _strip(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html or "")).strip()


def google_news_rss(query: str) -> list[dict]:
    url = "https://news.google.com/rss/search?q=" + urllib.parse.quote(query) + "&hl=en-US&gl=US&ceid=US:en"
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=20)
        if r.status_code != 200:
            logger.warning("  RSS HTTP %s for %r", r.status_code, query)
            return []
        root = ET.fromstring(r.content)
    except Exception as e:  # noqa: BLE001
        logger.warning("  RSS error %r: %s", query, e)
        return []
    items = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        src_el = it.find("source")
        source = (src_el.text or "").strip() if src_el is not None else ""
        snippet = _strip(it.findtext("description") or "")[:240]
        link = (it.findtext("link") or "").strip()
        if title:
            items.append({"title": title, "source": source, "snippet": snippet, "link": link})
    return items[:MAX_PER_QUERY]


def _decode_news_url(link: str) -> str | None:
    """Best-effort decode of a Google News /rss/articles/<b64> link to the real URL."""
    try:
        m = re.search(r"/articles/([A-Za-z0-9_\-]+)", link)
        if not m:
            return None
        raw = base64.urlsafe_b64decode(m.group(1) + "===")
        urls = re.findall(rb"https?://[^\s\x00-\x1f\"'<>]+", raw)
        if urls:
            return urls[0].decode("utf-8", "ignore")
    except Exception:  # noqa: BLE001
        pass
    return None


def fetch_body(item: dict) -> str:
    """Best-effort article body; falls back to headline+snippet."""
    fallback = f"{item['title']} — {item['snippet']}"
    for url in (item.get("link"), _decode_news_url(item.get("link", ""))):
        if not url:
            continue
        try:
            r = requests.get(url, headers={"User-Agent": UA}, timeout=15, allow_redirects=True)
            host = urllib.parse.urlparse(r.url).netloc
            if r.status_code != 200 or "news.google.com" in host:
                continue
            soup = BeautifulSoup(r.text, "lxml")
            for tag in soup(["script", "style", "nav", "header", "footer", "aside"]):
                tag.decompose()
            paras = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
            body = " ".join(p for p in paras if len(p) > 40)
            if len(body) > 300:
                return f"{item['title']} — {body[:2000]}"
        except Exception:  # noqa: BLE001
            continue
    return fallback


def fetch_clusters(client, project_id, dataset_id) -> list[dict]:
    q = f"""
    SELECT cluster_name, description, source_megatrend_names
    FROM `{project_id}.{dataset_id}.megatrend_clusters`
    ORDER BY best_score DESC
    """
    return [dict(r) for r in client.query(q).result()]


def deck_names_for(client, project_id, dataset_id, megatrend_names: list[str]) -> set[str]:
    """Lowercased deck taxonomy node names under the cluster's source megatrends (for in_deck)."""
    if not megatrend_names:
        return set()
    q = f"""
    SELECT DISTINCT LOWER(name) nm
    FROM `{project_id}.{dataset_id}.taxonomy_nodes`
    WHERE megatrend_name IN UNNEST(@mts) AND name IS NOT NULL
    """
    job = client.query(q, job_config=bigquery.QueryJobConfig(
        query_parameters=[bigquery.ArrayQueryParameter("mts", "STRING", megatrend_names)]))
    return {r["nm"] for r in job.result()}


def _in_deck(name: str, deck: set[str]) -> bool:
    n = name.lower().strip()
    return any(n == d or n in d or d in n for d in deck)


def fetch_subtrends(client, project_id, dataset_id, megatrend_names: list[str]) -> list[dict]:
    """Deck subtrends (name + description) under this cluster's source megatrends — the discovery lenses."""
    if not megatrend_names:
        return []
    q = f"""
    SELECT name, ANY_VALUE(description) AS description
    FROM `{project_id}.{dataset_id}.taxonomy_nodes`
    WHERE level = 'subtrend' AND megatrend_name IN UNNEST(@mts) AND name IS NOT NULL
    GROUP BY name
    """
    job = client.query(q, job_config=bigquery.QueryJobConfig(
        query_parameters=[bigquery.ArrayQueryParameter("mts", "STRING", megatrend_names)]))
    return [{"name": r["name"], "description": r["description"] or ""} for r in job.result()]


def _node(megatrend, subtrend, parent_id, level, name, search_term, support, sources, in_deck, now,
          description=None, relation=None) -> dict:
    """Build one discovered_nodes row. Nesting is carried by parent_id + subtrend."""
    return {
        "discovery_id": f"disc_{uuid.uuid4().hex[:12]}",
        "megatrend": megatrend, "subtrend": subtrend, "parent_id": parent_id,
        "level": level, "name": name, "search_term": search_term,
        "support": support, "sources": sources, "in_deck": in_deck,
        "description": description, "relation": relation,
        "current_interest": None, "yoy_growth": None, "is_rising": None,
        "has_data": None, "interest_series": None, "discovered_at": now,
    }


def _off_products(megatrend: str, subtrend, ingredient_rows: list[dict], deck: set[str], now: str) -> list[dict]:
    """Real US branded products from Open Food Facts, nested under each discovered ingredient."""
    rows, seen = [], set()
    for ing in ingredient_rows:
        term = ing.get("search_term") or ing.get("name")
        if not term:
            continue
        try:
            rec = open_food_facts.scan_term(term)
        except Exception as e:  # noqa: BLE001
            logger.warning("  OFF scan failed for %r: %s", term, e)
            continue
        for prod in rec.get("products", [])[:OFF_PRODUCTS_PER_TERM]:
            code = prod.get("code") or f"{prod['name']}|{prod.get('brand')}"
            if code in seen:
                continue
            seen.add(code)
            url = f"{OFF_PRODUCT_URL}{prod['code']}" if prod.get("code") else None
            brand = prod.get("brand")
            rows.append(_node(
                megatrend, subtrend, ing["discovery_id"], "product", prod["name"], term, 1,
                json.dumps([{"title": prod["name"], "url": url, "source": brand}]),
                _in_deck(prod["name"], deck), now,
                description=f"A real US market product{f' by {brand}' if brand else ''} featuring {term}.",
                relation=f"Evidence that “{term}” is reaching shelves under {subtrend or megatrend}."))
    return rows


def _fetch_corpus(queries: list[str]) -> list[dict]:
    """Run queries -> dedup unique articles -> attach body (or headline+snippet) to each."""
    seen, corpus = set(), []
    for q in queries:
        for it in google_news_rss(q):
            key = it["title"].lower()
            if key not in seen:
                seen.add(key)
                corpus.append(it)
        time.sleep(1.0)
    for i, it in enumerate(corpus):
        it["text"] = fetch_body(it) if i < MAX_BODY_FETCH else f"{it['title']} — {it['snippet']}"
    return corpus


def discover_megatrend(client, project_id, dataset_id, cluster: dict) -> int:
    """Drive discovery per SUBTREND: each subtrend (with its megatrend) is a search lens, and
    ingredients/behaviours/psychographics found are nested under it (products under ingredients).
    Falls back to a single megatrend-level lens if the deck has no subtrends for this cluster."""
    name = cluster["cluster_name"]
    src = list(cluster.get("source_megatrend_names") or [name])
    deck = deck_names_for(client, project_id, dataset_id, src)
    mega_desc = cluster.get("description") or ""   # real megatrend meaning — grounds queries + extraction
    now = datetime.now(timezone.utc).isoformat()
    subtrends = fetch_subtrends(client, project_id, dataset_id, src)
    if not subtrends:
        subtrends = [{"name": None, "description": cluster.get("description") or ""}]
    logger.info("Discovering: %s  (%d subtrend lenses)", name, len(subtrends))

    rows: list[dict] = []
    for sub in subtrends:
        sub_name = sub["name"]
        lens = sub_name or name
        if sub_name:
            qp, kmax = SUBTREND_QUERY_PROMPT.format(megatrend=name, mega_desc=mega_desc, subtrend=sub_name, k=MAX_QUERIES_PER_SUBTREND), MAX_QUERIES_PER_SUBTREND
        else:
            qp, kmax = QUERY_PROMPT.format(name=name, desc=sub["description"], k=MAX_QUERIES), MAX_QUERIES
        try:
            queries = complete_json(qp).get("queries", [])[:kmax]
        except Exception as e:  # noqa: BLE001
            logger.warning("  query-gen failed for %s / %s: %s", name, lens, e)
            continue
        corpus = _fetch_corpus(queries)
        logger.info("  [%s] %d queries -> %d articles", lens, len(queries), len(corpus))
        if not corpus:
            continue
        corpus_block = "\n".join(f"[{i}] {it['text'][:600]}" for i, it in enumerate(corpus))
        try:
            if sub_name:
                tax = complete_json(SUBTREND_EXTRACT_PROMPT.format(megatrend=name, mega_desc=mega_desc, subtrend=sub_name, n=len(corpus), corpus=corpus_block))
                child_levels = ("ingredients", "behaviours", "psychographics")
            else:
                tax = complete_json(EXTRACT_PROMPT.format(name=name, desc=sub["description"], n=len(corpus), corpus=corpus_block))
                child_levels = ("subtrends", "ingredients", "behaviours", "psychographics")
        except Exception as e:  # noqa: BLE001
            logger.warning("  extract failed for %s / %s: %s", name, lens, e)
            continue

        sub_id = None
        if sub_name:
            sub_node = _node(name, sub_name, None, "subtrend", sub_name, None, 1, "[]", _in_deck(sub_name, deck), now,
                             description=(sub.get("description") or None),
                             relation=f"A subtrend within “{name}”: {mega_desc}" if mega_desc else None)
            sub_id = sub_node["discovery_id"]
            rows.append(sub_node)
        ing_rows: list[dict] = []
        for level in child_levels:
            for it in tax.get(level, []):
                idxs = [i for i in (it.get("sources") or []) if isinstance(i, int) and 0 <= i < len(corpus)]
                if len(set(idxs)) < SUPPORT_FLOOR:
                    continue
                srcs = json.dumps([{"title": corpus[i]["title"], "url": corpus[i].get("link"), "source": corpus[i]["source"]}
                                   for i in list(dict.fromkeys(idxs))[:3]])
                nm = (it.get("name") or "").strip()
                if not nm:
                    continue
                node = _node(name, sub_name, sub_id, LEVEL_SINGULAR[level], nm,
                             (it.get("search_term") or "").strip().lower() or None,
                             len(set(idxs)), srcs, _in_deck(nm, deck), now,
                             description=(it.get("description") or "").strip() or None,
                             relation=(it.get("relation") or "").strip() or None)
                rows.append(node)
                if level == "ingredients":
                    ing_rows.append(node)
        rows.extend(_off_products(name, sub_name, ing_rows, deck, now))

        # Innovation extraction — same corpus, separate prompt hunting for novel global concepts.
        try:
            if sub_name:
                inno_tax = complete_json(INNOVATION_SUBTREND_EXTRACT_PROMPT.format(
                    megatrend=name, mega_desc=mega_desc, subtrend=sub_name,
                    n=len(corpus), corpus=corpus_block))
            else:
                inno_tax = complete_json(INNOVATION_EXTRACT_PROMPT.format(
                    name=name, desc=sub["description"], n=len(corpus), corpus=corpus_block))
            for it in inno_tax.get("innovations", []):
                idxs = [i for i in (it.get("sources") or []) if isinstance(i, int) and 0 <= i < len(corpus)]
                if len(set(idxs)) < SUPPORT_FLOOR:
                    continue
                srcs = json.dumps([{"title": corpus[i]["title"], "url": corpus[i].get("link"),
                                    "source": corpus[i]["source"]}
                                   for i in list(dict.fromkeys(idxs))[:3]])
                nm = (it.get("name") or "").strip()
                if not nm:
                    continue
                rows.append(_node(name, sub_name, sub_id, "innovation", nm, None,
                                  len(set(idxs)), srcs, False, now,
                                  description=(it.get("description") or "").strip() or None,
                                  relation=(it.get("relation") or "").strip() or None))
        except Exception as e:  # noqa: BLE001
            logger.warning("  innovation extract failed for %s / %s: %s", name, lens, e)

    # Replace this megatrend's discovered rows.
    client.query(
        f"DELETE FROM `{project_id}.{dataset_id}.discovered_nodes` WHERE megatrend = @m",
        job_config=bigquery.QueryJobConfig(query_parameters=[bigquery.ScalarQueryParameter("m", "STRING", name)]),
    ).result()
    load_json_rows(client, f"{project_id}.{dataset_id}.discovered_nodes", rows)
    new = sum(1 for r in rows if not r["in_deck"])
    logger.info("  wrote %d nodes (%d new vs deck)", len(rows), new)
    return len(rows)


def run_discovery(rediscover: bool = False) -> None:
    client = bq_client()
    project_id, dataset_id = dataset_ref()
    clusters = fetch_clusters(client, project_id, dataset_id)
    if not clusters:
        logger.error("No megatrend clusters — run synthesis first")
        return

    done = set()
    if not rediscover:
        done = {r["megatrend"] for r in client.query(
            f"SELECT DISTINCT megatrend FROM `{project_id}.{dataset_id}.discovered_nodes`").result()}
    todo = [c for c in clusters if c["cluster_name"] not in done]
    logger.info("%d megatrends (%d done, %d to discover)", len(clusters), len(clusters) - len(todo), len(todo))

    total = 0
    for c in todo:
        try:
            total += discover_megatrend(client, project_id, dataset_id, c)
        except Exception as e:  # noqa: BLE001
            logger.warning("Discovery failed for %s: %s", c["cluster_name"], e)
    logger.info("Discovery complete — %d items across %d megatrends", total, len(todo))


def run_validation() -> None:
    """Measure Google Trends for unmeasured discovered terms, then classify (trend_math)."""
    client = bq_client()
    project_id, dataset_id = dataset_ref()
    # Only ingredients carry a Google Trends signal. Products are specific SKUs with no
    # meaningful standalone search trend — they show market presence (brand/popularity), not a line.
    rows = list(client.query(f"""
        SELECT discovery_id, search_term
        FROM `{project_id}.{dataset_id}.discovered_nodes`
        WHERE level = 'ingredient' AND search_term IS NOT NULL AND has_data IS NULL
    """).result())
    terms = list(dict.fromkeys(r["search_term"] for r in rows))
    if terms:
        logger.info("Measuring Google Trends for %d discovered terms", len(terms))
        series_map = trends_browser.measure(terms)
        for term in terms:
            series = series_map.get(term, [])
            client.query(
                f"""UPDATE `{project_id}.{dataset_id}.discovered_nodes`
                    SET interest_series=@ser, has_data=@hd WHERE search_term=@t AND has_data IS NULL""",
                job_config=bigquery.QueryJobConfig(query_parameters=[
                    bigquery.ScalarQueryParameter("ser", "STRING", json.dumps(series)),
                    bigquery.ScalarQueryParameter("hd", "BOOL", bool([v for v in series if v])),
                    bigquery.ScalarQueryParameter("t", "STRING", term),
                ]),
            ).result()
    else:
        logger.info("No unmeasured terms — reclassifying from stored series.")
    reclassify_all()
    logger.info("Validation complete.")


def reclassify_all() -> None:
    """Recompute trend-math verdicts from already-stored series (no Trends calls)."""
    client = bq_client()
    project_id, dataset_id = dataset_ref()
    rows = list(client.query(f"""
        SELECT discovery_id, interest_series
        FROM `{project_id}.{dataset_id}.discovered_nodes`
        WHERE interest_series IS NOT NULL AND interest_series != '[]'
    """).result())
    logger.info("Reclassifying %d discovered items with trend math", len(rows))
    for r in rows:
        try:
            series = json.loads(r["interest_series"])
        except (ValueError, TypeError):
            continue
        a = trend_math.analyze(series)
        client.query(
            f"""UPDATE `{project_id}.{dataset_id}.discovered_nodes`
                SET current_interest=@ci, yoy_growth=@yoy, is_rising=@ris, has_data=@hd,
                    classification=@cls, acceleration=@acc, volatility=@vol, is_durable=@dur
                WHERE discovery_id=@id""",
            job_config=bigquery.QueryJobConfig(query_parameters=[
                bigquery.ScalarQueryParameter("ci", "INT64", a.get("current")),
                bigquery.ScalarQueryParameter("yoy", "FLOAT64", a.get("yoy_growth")),
                bigquery.ScalarQueryParameter("ris", "BOOL", bool(a.get("is_rising"))),
                bigquery.ScalarQueryParameter("hd", "BOOL", bool(a.get("has_data"))),
                bigquery.ScalarQueryParameter("cls", "STRING", a.get("classification")),
                bigquery.ScalarQueryParameter("acc", "FLOAT64", a.get("acceleration")),
                bigquery.ScalarQueryParameter("vol", "FLOAT64", a.get("volatility")),
                bigquery.ScalarQueryParameter("dur", "BOOL", bool(a.get("is_durable"))),
                bigquery.ScalarQueryParameter("id", "STRING", r["discovery_id"]),
            ]),
        ).result()


def main() -> None:
    parser = argparse.ArgumentParser(description="TrendLens — web discovery")
    parser.add_argument("--rediscover", action="store_true", help="Re-discover all megatrends")
    parser.add_argument("--validate", action="store_true", help="Measure Google Trends growth on discovered terms")
    parser.add_argument("--reclassify", action="store_true", help="Recompute trend-math verdicts from stored series (no Trends calls)")
    args = parser.parse_args()
    if args.reclassify:
        reclassify_all()
    elif args.validate:
        run_validation()
    else:
        run_discovery(rediscover=args.rediscover)


if __name__ == "__main__":
    main()
