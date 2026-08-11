"""
TrendLens — Google Trends via a real browser (Playwright)

Drives a real Chromium session against trends.google.com and captures the same
interest-over-time data the chart uses (the `widgetdata/multiline` response).
Because it's a genuine browser session, Google throttles it far less than the
unofficial pytrends back-channel.

Returns {term: [weekly interest ints]}. Each term is queried ONE PER REQUEST so
its 0-100 series is scaled against itself (a popular term in the same batch can
otherwise crush a smaller one to ~0), and a throttled request only costs that one
term instead of a whole batch. Throttled requests are retried with backoff.

This is best-effort: a term that stays blocked after retries returns no series,
and the caller marks it as no-data.
"""

import json
import logging
import time
import urllib.parse

from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
EXPLORE = "https://trends.google.com/trends/explore?date=today%2012-m&geo=US&hl=en-US&q="
NAV_TIMEOUT_MS = 30000
REQUEST_DELAY_S = 4.0   # human pacing between terms
MAX_RETRIES = 3         # retries on a throttled/blocked request
RETRY_BACKOFF_S = 8.0   # base backoff; grows each retry


def _parse_multiline(body: str) -> dict:
    """Strip Google's anti-JSON prefix and parse."""
    body = body.lstrip()
    if body.startswith(")]}'"):
        nl = body.find("\n")
        body = body[nl + 1:] if nl != -1 else body[4:]
    return json.loads(body)


def _fetch_batch(page, terms: list[str]) -> dict[str, list[int]]:
    q = urllib.parse.quote(",".join(terms))
    url = EXPLORE + q

    holder: dict[str, str] = {}

    def on_resp(r):
        if "widgetdata/multiline" in r.url and r.status == 200 and "body" not in holder:
            try:
                holder["body"] = r.text()
            except Exception:  # noqa: BLE001
                pass

    page.on("response", on_resp)
    nav = None
    try:
        nav = page.goto(url, wait_until="networkidle", timeout=NAV_TIMEOUT_MS)
        if nav is not None and nav.status == 200 and "body" not in holder:
            page.wait_for_timeout(3000)  # let the chart's data request fire
    except PWTimeout:
        pass
    except Exception as e:  # noqa: BLE001
        logger.warning("Batch nav error %s: %s", terms, e)
    finally:
        page.remove_listener("response", on_resp)

    # Fast-bail on an explicit block (e.g. HTTP 429) instead of waiting.
    if nav is not None and nav.status != 200:
        logger.warning("Trends returned HTTP %s for %s (throttled)", nav.status, terms)
        return {}
    if "body" not in holder:
        logger.warning("No chart data for batch (blocked/timeout): %s", terms)
        return {}

    try:
        data = _parse_multiline(holder["body"])
        timeline = data.get("default", {}).get("timelineData", []) or []
    except Exception as e:  # noqa: BLE001
        logger.warning("Failed to parse multiline for %s: %s", terms, e)
        return {}

    out: dict[str, list[int]] = {t: [] for t in terms}
    for pt in timeline:
        vals = pt.get("value", []) or []
        for i, t in enumerate(terms):
            if i < len(vals) and vals[i] is not None:
                out[t].append(int(vals[i]))
    return out


def _fetch_with_retry(page, term: str, retries: int = MAX_RETRIES) -> tuple[list[int], bool]:
    """Fetch one term, retrying on throttle/block. Returns (series, throttled)."""
    for attempt in range(retries + 1):
        series = _fetch_batch(page, [term])
        if term in series:
            # Got a real response from Google (an empty list here = genuine no-data,
            # not a throttle), so accept it without retrying.
            return series[term], False
        # Empty dict means the request was blocked/timed out — back off and retry.
        if attempt < retries:
            wait = RETRY_BACKOFF_S * (attempt + 1)
            logger.info("  throttled on '%s' — retry %d/%d in %.0fs", term, attempt + 1, retries, wait)
            time.sleep(wait)
    return [], True


def measure(terms: list[str], request_delay: float = REQUEST_DELAY_S) -> dict[str, list[int]]:
    """Return {term: weekly interest series}, one request per term with retries."""
    if not terms:
        return {}

    results: dict[str, list[int]] = {}
    throttled = 0
    total = len(terms)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent=USER_AGENT, locale="en-US",
                                      viewport={"width": 1280, "height": 900})
        # Pre-accept consent so EU-style walls don't block the data request.
        context.add_cookies([{"name": "SOCS", "value": "CAISNQgDEitib3hfMjAy",
                              "domain": ".google.com", "path": "/"}])
        page = context.new_page()

        for idx, term in enumerate(terms, 1):
            logger.info("Trends term %d/%d: %s", idx, total, term)
            series, was_throttled = _fetch_with_retry(page, term)
            results[term] = series
            if was_throttled:
                throttled += 1
            if idx < total:
                time.sleep(request_delay)

        browser.close()

    if throttled:
        logger.warning("%d/%d terms returned no data after retries (low volume or persistent throttling)",
                       throttled, total)
    return results
