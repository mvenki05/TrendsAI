"""
TrendLens — Open Food Facts market scan.

For a rising ingredient term, find real US food products that contain it or are
named for it. Answers the "who's already selling this?" question on the /market
page.

Uses the Search-a-licious service (search.openfoodfacts.org), which is built for
programmatic search — the legacy `cgi/search.pl` and `/api/v2/search` endpoints
503 under sustained load.

Two complementary queries per term, merged & de-noised:
  1. ingredient containment — `ingredients_tags:"en:<slug>"` (precise: products
     that CONTAIN the ingredient, e.g. hyaluronic acid inside an Alani Nu drink).
  2. name/brand text — free-text `q=<term>`, then filtered in Python to US +
     all-token match (catches products NAMED for the term, e.g. "Collagen
     Peptides"; the Python filter kills the OR-noise OFF returns for multi-word
     free text, e.g. "oat milk" matching a Lindt chocolate).

De-noising: require a brand, require US, drop cosmetics/beauty leakage, dedupe by
product code, rank by `unique_scans_n` (a real-world popularity proxy).
"""

import logging
import re
import time

import requests

from src.common import load_settings

logger = logging.getLogger(__name__)

_M = load_settings()["market"]
SEARCH_BASE = _M["search_base"]
COUNTRY_TAG = _M["country_tag"]
USER_AGENT = _M["user_agent"]
PRODUCTS_PER_TERM = int(_M["products_per_term"])

FIELDS = "product_name,brands,code,categories_tags,countries_tags,unique_scans_n,image_small_url"
PAGE_SIZE = 25
TIMEOUT_S = 40
MAX_RETRIES = 2
RETRY_BACKOFF_S = 3.0

# Open Food Facts is food-only, but cosmetics/beauty entries occasionally leak in
# (e.g. a serum tagged with "hyaluronic acid"). Drop anything tagged beauty.
_COSMETIC_HINTS = ("cosmetic", "beauty", "make-up", "makeup", "skin-care", "skincare", "shampoo", "serum")


def _slug(term: str) -> str:
    """'hyaluronic acid' -> 'en:hyaluronic-acid' (OFF ingredient tag form)."""
    s = re.sub(r"[^a-z0-9]+", "-", term.lower()).strip("-")
    return f"en:{s}"


def _get(query: str) -> list[dict]:
    """Run one Search-a-licious query, returning hits (with retry/backoff on failure)."""
    params = {"q": query, "fields": FIELDS, "page_size": PAGE_SIZE, "sort_by": "-unique_scans_n"}
    headers = {"User-Agent": USER_AGENT}
    for attempt in range(MAX_RETRIES + 1):
        try:
            r = requests.get(SEARCH_BASE, params=params, headers=headers, timeout=TIMEOUT_S)
            if r.status_code == 200:
                return r.json().get("hits", []) or []
            logger.warning("OFF search HTTP %s for q=%r", r.status_code, query)
        except (requests.RequestException, ValueError) as e:
            logger.warning("OFF search error for q=%r: %s", query, e)
        if attempt < MAX_RETRIES:
            time.sleep(RETRY_BACKOFF_S * (attempt + 1))
    return []


def _is_food(hit: dict) -> bool:
    cats = " ".join(hit.get("categories_tags") or [])
    return not any(h in cats for h in _COSMETIC_HINTS)


def _is_us(hit: dict) -> bool:
    return COUNTRY_TAG in (hit.get("countries_tags") or [])


def _clean(hit: dict) -> dict | None:
    """Normalize a hit to our product shape; drop it if it has no brand or name."""
    name = (hit.get("product_name") or "").strip()
    brands = hit.get("brands")
    brand = (brands[0] if isinstance(brands, list) else brands or "")
    brand = str(brand).strip()
    if not brand or not name:
        return None
    if not _is_food(hit):
        return None
    return {
        "name": name,
        "brand": brand,
        "code": hit.get("code"),
        "scans": hit.get("unique_scans_n"),
        "image_url": hit.get("image_small_url"),
    }


def scan_term(term: str) -> dict:
    """Find US market products for one ingredient term. Returns a market record."""
    # 1. Containment: products whose ingredient list includes the term.
    containment = _get(f'ingredients_tags:"{_slug(term)}" AND countries_tags:"{COUNTRY_TAG}"')

    # 2. Name/brand text: free-text, filtered in Python (US + every token of the
    #    term present in name or brand) to avoid OFF's loose OR matching.
    tokens = [t for t in re.split(r"\s+", term.lower()) if t]
    named = []
    for h in _get(term):
        if not _is_us(h):
            continue
        hay = f"{h.get('product_name') or ''} {h.get('brands') or ''}".lower()
        if all(t in hay for t in tokens):
            named.append(h)

    # Merge, dedupe by product code (fall back to name+brand), keep the higher scan count.
    by_key: dict[str, dict] = {}
    for h in containment + named:
        p = _clean(h)
        if not p:
            continue
        key = p["code"] or f"{p['name']}|{p['brand']}"
        prev = by_key.get(key)
        if prev is None or (p["scans"] or 0) > (prev["scans"] or 0):
            by_key[key] = p

    products = sorted(by_key.values(), key=lambda p: p["scans"] or 0, reverse=True)
    brands: list[str] = []
    for p in products:
        if p["brand"] not in brands:
            brands.append(p["brand"])

    return {
        "term": term,
        "product_count": len(products),
        "brand_count": len(brands),
        "brands": brands[:PRODUCTS_PER_TERM],
        "products": products[:PRODUCTS_PER_TERM],
        "has_products": bool(products),
    }
