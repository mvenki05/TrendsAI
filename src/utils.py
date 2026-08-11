"""
TrendPulse — Shared Utilities

Common functions used across ingestion, intelligence, scoring, and briefs modules.
"""

import json
import logging
import re

logger = logging.getLogger(__name__)


def parse_llm_json(text: str) -> dict:
    """Parse JSON from LLM response, handling markdown fencing and truncation.

    Handles:
    - Markdown ```json fencing
    - Truncated responses (repairs by closing open structures)
    - Missing closing braces/brackets
    """
    if not text or not text.strip():
        raise ValueError("Empty LLM response")

    # Strip markdown fencing
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    # Try direct parse first
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # If truncated, try aggressive repair
    logger.warning("Attempting to repair truncated JSON (%d chars)", len(cleaned))

    # Strategy 1: Find complete object boundaries via regex
    candidates = [m.end() - 1 for m in re.finditer(r'\}\s*,?\s*(?=\{|$|\])', cleaned)]
    for pos in reversed(candidates):
        attempt = cleaned[:pos + 1]
        open_braces = attempt.count("{") - attempt.count("}")
        open_brackets = attempt.count("[") - attempt.count("]")
        attempt += "]" * open_brackets + "}" * open_braces
        try:
            result = json.loads(attempt)
            logger.info("Repaired truncated JSON (kept %d of %d chars)", pos + 1, len(cleaned))
            return result
        except json.JSONDecodeError:
            continue

    # Strategy 2: Find last clean "}" boundary
    for marker in ['},\n', '},', '}\n', '}']:
        idx = cleaned.rfind(marker)
        if idx > 0:
            attempt = cleaned[:idx + 1].rstrip().rstrip(",")
            open_braces = attempt.count("{") - attempt.count("}")
            open_brackets = attempt.count("[") - attempt.count("]")
            attempt += "]" * open_brackets + "}" * open_braces
            try:
                result = json.loads(attempt)
                logger.info("Repaired truncated JSON by closing at last complete object")
                return result
            except json.JSONDecodeError:
                continue

    logger.error("Failed to parse or repair LLM JSON. First 1000 chars: %s", text[:1000])
    raise ValueError("Could not parse LLM response as JSON")
