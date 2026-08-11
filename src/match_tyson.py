"""
TrendLens — Tyson product matching ("does Tyson already play here?")

For each top rising INGREDIENT (across all reports), find which Tyson products
relate to it, so the /market page can show Tyson's position next to the broad
market (Open Food Facts) products: a match = "Tyson plays here", none = whitespace.

WHY CLAUDE, NOT A TEXT MATCH: the Tyson product list comes from NielsenIQ POS,
where names are abbreviated retail codes — `TYSN TRYK FLVR PRK GRLR STK` is a
teriyaki pork product, so `LIKE '%teriyaki%'` misses it. Claude reads the
abbreviations and judges genuine relevance.

Two BigQuery tables:
  tyson_products — the ~6.3k Tyson products (cached once from pos_enriched_mat;
                   the 253M-row POS table is never touched at read time).
  tyson_matches  — per term: the matched Tyson products (JSON) + whitespace flag.

CACHING / ACCUMULATION: terms already in tyson_matches are skipped; each run only
matches the gaps. Use --refresh-products to re-pull the Tyson list, --rematch to
redo matching for all selected terms.

Usage:
    python -m src.match_tyson                     # match gaps
    python -m src.match_tyson --refresh-products  # re-pull the Tyson product list first
    python -m src.match_tyson --rematch           # re-match all selected terms
"""

import argparse
import json
import logging
from datetime import datetime, timezone

from google.cloud import bigquery

from src.common import bq_client, complete_json, dataset_ref, load_json_rows, load_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

POS_TABLE = "dev-2534-puw-growth-2295ed.Consumption_POS.pos_enriched_mat"
TOP_INGREDIENTS = int(load_settings()["market"]["top_ingredients"])
CHUNK_SIZE = 300          # Tyson products per Claude call (fewer calls = faster)
MATCH_MAX_TOKENS = 8000   # matching output is tiny; cap thinking budget to cut latency
MAX_MATCHES_PER_TERM = 20  # cap products shown per ingredient


MATCH_PROMPT = """You are matching Tyson Foods products to trending food ingredients/terms.

Tyson makes MEAT and prepared foods (chicken, pork, sausage, hot dogs, deli, breakfast). Their product names are ABBREVIATED NielsenIQ retail codes. Decode them, e.g.:
- "TYSN TRYK FLVR PRK GRLR STK" = Tyson Teriyaki Flavor Pork Griller Steak
- "TYSN ANY BNLS BRD WHT MT CHCK WYNG HNY BBQ" = Tyson boneless breaded white meat chicken wings honey BBQ
- common abbreviations: CHCK=chicken, PRK=pork, SSG=sausage, BRD=breaded, BNLS=boneless, HNY=honey, FLVR=flavor, SMKD=smoked, BRST=breast, FRZN=frozen, RFRG=refrigerated

## Trending terms
{terms}

## Tyson products (INDEX | NAME | brand | category)
{products}

## Task
For each Tyson product, decide if it GENUINELY features one of the trending terms — something a shopper would see as a flavor, a marketed ingredient, or a front-of-pack positioning claim.

MATCH examples: a teriyaki-flavored product → "teriyaki"; a honey-BBQ product → "honey bbq"; a product explicitly marketed on protein content (e.g. "high protein", "protein bowl") → "protein".

CRITICAL RULE: match on the CONSUMER-TREND MEANING of the term, NOT on a literal word appearing in the name. The term reflects what a health/innovation-minded shopper is seeking. A product only matches if it genuinely delivers that trend.

Do NOT match (these are the exact mistakes seen before — avoid them):
- WELLNESS/BEAUTY/SUPPLEMENT ingredients (collagen, hyaluronic acid, postbiotics, magnesium, etc.): Tyson's meat/prepared products do NOT deliver these. NEVER match them, even if a similar word appears in the name. In particular "collagen" → a sausage with a "collagen casing" / "CLGN CS" is PACKAGING, not the consumable collagen trend. NOT a match.
- "sea salt" → curing salt or generic salt content. The trend is sea salt as a featured flavor. NOT a match otherwise.
- "healthy fats" → "zero trans fat" / "low fat" / "% less fat" claims. The trend is ADDED beneficial fats (omega-3, avocado, nuts). Low-fat is the opposite. NOT a match.
- "herbal infusion" → generic "garlic herb" seasoning. The trend is herbal/botanical infusions. NOT a match.
- "protein" → every meat product. Only products explicitly MARKETED around protein content ("high protein", "protein bowl"). Plain chicken/sausage is NOT a match.
- any structural/processing artifact, incidental ingredient, or generic category overlap.

When in doubt, do NOT match. Most products match nothing — that is expected and correct (it means Tyson has whitespace there). A literal word in the name is NEVER enough on its own; ask "is this product actually about this consumer trend?"

Return ONLY valid JSON, no fencing:
{{
  "matches": [
    {{ "index": 3, "terms": ["teriyaki"] }}
  ]
}}
Use the exact term strings from the trending list. Omit products that match nothing.
"""


def refresh_tyson_products(client, project_id, dataset_id) -> int:
    """Pull the distinct Tyson product list from POS into tyson_products (one-time/cached)."""
    logger.info("Pulling Tyson product list from %s ...", POS_TABLE)
    q = f"""
    SELECT upc, ANY_VALUE(item) item, ANY_VALUE(ty_brand) brand,
           ANY_VALUE(ty_category) category, ANY_VALUE(ty_segment) segment
    FROM `{POS_TABLE}`
    WHERE is_tyson AND upc IS NOT NULL
    GROUP BY upc
    """
    rows_src = list(client.query(q).result())
    now = datetime.now(timezone.utc).isoformat()
    rows = [{"upc": r["upc"], "item": r["item"], "brand": r["brand"],
             "category": r["category"], "segment": r["segment"], "refreshed_at": now}
            for r in rows_src]
    client.query(f"DELETE FROM `{project_id}.{dataset_id}.tyson_products` WHERE TRUE").result()
    load_json_rows(client, f"{project_id}.{dataset_id}.tyson_products", rows)
    logger.info("Cached %d Tyson products", len(rows))
    return len(rows)


def load_tyson_products(client, project_id, dataset_id) -> list[dict]:
    """Distinct Tyson products to match against (deduped by name to cut Claude calls)."""
    q = f"""
    SELECT item, ANY_VALUE(brand) brand, ANY_VALUE(category) category
    FROM `{project_id}.{dataset_id}.tyson_products`
    WHERE item IS NOT NULL
    GROUP BY item
    """
    return [dict(r) for r in client.query(q).result()]


def fetch_rising_ingredients(client, project_id, dataset_id, limit) -> list[str]:
    q = f"""
    SELECT term
    FROM `{project_id}.{dataset_id}.trend_searches`
    WHERE is_rising = TRUE AND node_level = 'ingredient' AND term IS NOT NULL AND term != ''
    GROUP BY term
    ORDER BY COUNT(DISTINCT report_id) DESC, MAX(yoy_growth) DESC
    LIMIT @limit
    """
    job = client.query(q, job_config=bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("limit", "INT64", limit)]))
    return [r["term"] for r in job.result()]


def fetch_matched_terms(client, project_id, dataset_id) -> set[str]:
    q = f"SELECT DISTINCT term FROM `{project_id}.{dataset_id}.tyson_matches`"
    return {r["term"] for r in client.query(q).result()}


def _is_structural_false_positive(term: str, item_name: str) -> bool:
    """Deterministic guard for traps the LLM keeps hitting on a literal token.

    e.g. "collagen" vs a sausage's "CLGN CSNG" (collagen casing) — packaging, not
    the consumable collagen/wellness trend. The model matches the literal abbreviation
    no matter how the prompt is worded, so we drop it here.
    """
    name = (item_name or "").upper()
    if term.lower() == "collagen" and ("CSNG" in name or "CASING" in name):
        return True
    return False


def match_terms(terms: list[str], products: list[dict]) -> dict[str, list[dict]]:
    """Claude-match terms against the Tyson product list. Returns {term: [products]}."""
    term_set = {t.lower() for t in terms}
    by_term: dict[str, list[dict]] = {t: [] for t in terms}
    terms_block = "\n".join(f"- {t}" for t in terms)

    for start in range(0, len(products), CHUNK_SIZE):
        chunk = products[start:start + CHUNK_SIZE]
        prod_block = "\n".join(
            f"{i} | {p['item']} | {p.get('brand') or ''} | {p.get('category') or ''}"
            for i, p in enumerate(chunk)
        )
        logger.info("Matching products %d-%d / %d", start, start + len(chunk), len(products))
        try:
            result = complete_json(MATCH_PROMPT.format(terms=terms_block, products=prod_block),
                                    max_tokens=MATCH_MAX_TOKENS, temperature=0.0)
        except Exception as e:  # noqa: BLE001
            logger.warning("Claude match failed for chunk %d (skipped): %s", start, e)
            continue
        for m in result.get("matches", []):
            idx = m.get("index")
            if not isinstance(idx, int) or not (0 <= idx < len(chunk)):
                continue
            prod = chunk[idx]
            for t in m.get("terms", []):
                key = next((orig for orig in terms if orig.lower() == str(t).lower()), None)
                if key and key.lower() in term_set and not _is_structural_false_positive(key, prod["item"]):
                    by_term[key].append({"item": prod["item"], "brand": prod.get("brand"),
                                         "category": prod.get("category")})
    return by_term


def run(refresh_products: bool = False, rematch: bool = False) -> None:
    client = bq_client()
    project_id, dataset_id = dataset_ref()

    products = load_tyson_products(client, project_id, dataset_id)
    if refresh_products or not products:
        refresh_tyson_products(client, project_id, dataset_id)
        products = load_tyson_products(client, project_id, dataset_id)
    logger.info("Matching against %d distinct Tyson product names", len(products))

    terms = fetch_rising_ingredients(client, project_id, dataset_id, TOP_INGREDIENTS)
    if not terms:
        logger.warning("No rising ingredients — measure Google Trends on some reports first")
        return

    matched = set() if rematch else fetch_matched_terms(client, project_id, dataset_id)
    to_match = [t for t in terms if t not in matched]
    logger.info("Top %d rising ingredients (%d cached, %d to match)", len(terms), len(terms) - len(to_match), len(to_match))
    if not to_match:
        return

    if rematch:
        # Full re-match: clear the whole cache so stale batches can't accumulate.
        client.query(f"DELETE FROM `{project_id}.{dataset_id}.tyson_matches` WHERE TRUE").result()

    by_term = match_terms(to_match, products)

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for term in to_match:
        prods = by_term.get(term, [])[:MAX_MATCHES_PER_TERM]
        rows.append({
            "term": term,
            "match_count": len(by_term.get(term, [])),
            "matches": json.dumps(prods),
            "has_match": bool(prods),
            "matched_at": now,
        })
    load_json_rows(client, f"{project_id}.{dataset_id}.tyson_matches", rows)

    plays = sum(1 for r in rows if r["has_match"])
    logger.info("Matched %d terms — %d Tyson plays, %d whitespace", len(rows), plays, len(rows) - plays)
    for r in rows:
        if r["has_match"]:
            logger.info("  %-22s -> %d Tyson products", r["term"], r["match_count"])


def main() -> None:
    parser = argparse.ArgumentParser(description="TrendLens — match rising ingredients to Tyson products (Claude)")
    parser.add_argument("--refresh-products", action="store_true", help="Re-pull the Tyson product list from POS")
    parser.add_argument("--rematch", action="store_true", help="Re-match all selected terms")
    args = parser.parse_args()
    run(refresh_products=args.refresh_products, rematch=args.rematch)


if __name__ == "__main__":
    main()
