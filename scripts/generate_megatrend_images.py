"""
Generate editorial hero images for the Megatrend Codex via the LiteLLM gateway
(Gemini image model). One image per canonical megatrend, saved as static files:

    dashboard/public/megatrends/<key>.png

Generated ONCE and committed as assets — the dashboard has no runtime dependency
on the gateway. Re-run with --only <key> to regenerate a single image.

Usage:
    python scripts/generate_megatrend_images.py            # all missing
    python scripts/generate_megatrend_images.py --force    # regenerate all
    python scripts/generate_megatrend_images.py --only glp1
"""

import argparse
import base64
import logging
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

OUT_DIR = Path(__file__).parent.parent / "dashboard" / "public" / "megatrends"

BASE_URL = (os.getenv("LITELLM_BASE_URL") or "").rstrip("/")
API_KEY = os.getenv("LITELLM_API_KEY")
MODEL = os.getenv("LITELLM_IMAGE_MODEL")

# One shared art direction so the set reads as a single commissioned shoot.
STYLE = (
    "Premium editorial food photography for a corporate trend-intelligence report cover. "
    "Wide 16:9 banner composition with generous negative space on the left for text overlay. "
    "Soft directional natural window light, muted warm-neutral palette, matte surfaces, "
    "shallow depth of field, photographed from a low three-quarter angle on a linen or stone tabletop. "
    "Restrained, sophisticated, Kinfolk-magazine aesthetic. "
    "Absolutely no text, no words, no logos, no brands, no packaging labels, no human faces."
)

SUBJECTS: dict[str, str] = {
    "value": (
        "A thoughtful grocery still life about value: a simple woven basket with carefully chosen staples — "
        "eggs, a whole chicken, dried beans, seasonal vegetables — beside a small notebook and pencil, "
        "conveying deliberate, selective shopping."
    ),
    "protein": (
        "A confident high-protein spread: a perfectly seared chicken breast sliced on a stone board, "
        "soft-boiled eggs, Greek yogurt in a ceramic bowl, cottage cheese, and roasted chickpeas, "
        "arranged like a still life celebrating protein as the center of the plate."
    ),
    "flavor": (
        "An adventurous global flavor tableau: vibrant chilis, charred citrus halves, a molcajete of salsa macha, "
        "gochujang in a small dish, fresh herbs, toasted spices scattered on dark stone — sensory, textural, bold."
    ),
    "social": (
        "A dinner table seen from above with one beautifully plated viral-style dish (a smash-burger taco) "
        "at golden hour, a smartphone at the edge of frame capturing it, suggesting food made to be shared online — "
        "no visible screen content, no faces."
    ),
    "functional": (
        "A functional-nutrition morning scene: kefir being poured over a bowl with chia, flax and berries, "
        "kombucha in a glass, sauerkraut in a small jar, oats and a honey dipper — food that does a job, "
        "styled clean and vital."
    ),
    "cleanlabel": (
        "Radical simplicity: five whole ingredients laid in a sparse row on pale stone — a tomato, a wedge of "
        "real cheese, a small pile of flour, olive oil in a clear glass bottle, sea salt in a pinch bowl — "
        "nothing processed, complete transparency."
    ),
    "convenience": (
        "Elegant effortless eating: a beautifully composed ready-to-eat meal in a minimal kraft bowl with a "
        "wooden fork, steam rising, beside a clean kitchen counter with keys and a tote bag softly out of focus — "
        "speed without compromise."
    ),
    "conscious": (
        "A regenerative-farming still life: imperfect 'rescued' vegetables with soil still on them, a bundle of "
        "carrots with tops, misshapen tomatoes, lentils and mussels in a bowl, on weathered wood with morning light — "
        "honest, resilient, hopeful."
    ),
    "blur": (
        "Meals unbound from dayparts: a grazing board that is neither meal nor snack — small portions of "
        "chicken skewers, hummus, fruit, cheese cubes, crackers and a soft-boiled egg spread across a long board, "
        "one hand-thrown ceramic cup of coffee beside it, suggesting eating that flows across the day."
    ),
    "glp1": (
        "The right-sized plate era: a small, precisely composed nutrient-dense plate — three ounces of salmon, "
        "a spoon of quinoa, roasted vegetables — on an oversized rustic dinner plate, emphasizing intentional "
        "smaller portions, with a glass of water beside it."
    ),
}


def _headers() -> dict:
    return {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}


def _extract_b64_from_images_api(data: dict) -> str | None:
    for item in data.get("data") or []:
        if item.get("b64_json"):
            return item["b64_json"]
    return None


def _extract_b64_from_chat(data: dict) -> str | None:
    """Gemini image models via LiteLLM chat return images in message content parts or message.images."""
    for choice in data.get("choices") or []:
        msg = choice.get("message") or {}
        for img in msg.get("images") or []:
            url = (img.get("image_url") or {}).get("url") or ""
            if url.startswith("data:image"):
                return url.split(",", 1)[1]
        content = msg.get("content")
        if isinstance(content, list):
            for part in content:
                url = ((part.get("image_url") or {}).get("url") or "") if isinstance(part, dict) else ""
                if url.startswith("data:image"):
                    return url.split(",", 1)[1]
    return None


def generate(key: str, prompt: str) -> bytes:
    # Preferred: OpenAI-style images API.
    r = requests.post(
        f"{BASE_URL}/v1/images/generations",
        headers=_headers(),
        json={"model": MODEL, "prompt": prompt, "n": 1, "size": "1792x1024", "response_format": "b64_json"},
        timeout=300,
    )
    if r.ok:
        b64 = _extract_b64_from_images_api(r.json())
        if b64:
            return base64.b64decode(b64)
    logger.info("[%s] images API unavailable (%s) — trying chat completions", key, r.status_code)

    # Fallback: chat completions with image modality.
    r = requests.post(
        f"{BASE_URL}/v1/chat/completions",
        headers=_headers(),
        json={"model": MODEL, "messages": [{"role": "user", "content": prompt}], "modalities": ["image", "text"]},
        timeout=300,
    )
    r.raise_for_status()
    b64 = _extract_b64_from_chat(r.json())
    if not b64:
        raise RuntimeError(f"No image in response for {key}: {str(r.json())[:400]}")
    return base64.b64decode(b64)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="regenerate even if the file exists")
    parser.add_argument("--only", default=None, help="generate a single megatrend key")
    args = parser.parse_args()

    if not (BASE_URL and API_KEY and MODEL):
        sys.exit("Missing LITELLM_BASE_URL / LITELLM_API_KEY / LITELLM_IMAGE_MODEL in .env")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    keys = [args.only] if args.only else list(SUBJECTS)
    for key in keys:
        if key not in SUBJECTS:
            sys.exit(f"Unknown megatrend key: {key} (known: {', '.join(SUBJECTS)})")
        out = OUT_DIR / f"{key}.png"
        if out.exists() and not args.force:
            logger.info("[%s] exists — skipping (use --force to regenerate)", key)
            continue
        prompt = f"{SUBJECTS[key]} {STYLE}"
        logger.info("[%s] generating…", key)
        try:
            png = generate(key, prompt)
        except Exception as e:
            logger.error("[%s] FAILED: %s", key, e)
            continue
        out.write_bytes(png)
        logger.info("[%s] saved %s (%.0f KB)", key, out, len(png) / 1024)


if __name__ == "__main__":
    main()
