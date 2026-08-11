"""
TrendLens — shared helpers (settings, BigQuery client, Claude JSON calls).
"""

import logging
import os
from pathlib import Path

import anthropic
import yaml
from dotenv import load_dotenv
from google.cloud import bigquery

from src.utils import parse_llm_json

load_dotenv()

logger = logging.getLogger(__name__)
CONFIG_DIR = Path(__file__).parent.parent / "config"


def load_settings() -> dict:
    with open(CONFIG_DIR / "settings.yaml") as f:
        return yaml.safe_load(f)


_SETTINGS = load_settings()


def dataset_ref() -> tuple[str, str]:
    """Return (project_id, dataset_id) honoring env overrides."""
    bq = _SETTINGS["bigquery"]
    project_id = os.getenv("BIGQUERY_PROJECT", bq["project_id"])
    dataset_id = os.getenv("BIGQUERY_DATASET", bq["dataset"])
    return project_id, dataset_id


def bq_client() -> bigquery.Client:
    project_id, _ = dataset_ref()
    return bigquery.Client(project=project_id)


_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    """Lazily build the Anthropic client (reads ANTHROPIC_API_KEY from the env)."""
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def complete_json(prompt: str, max_tokens: int | None = None, temperature: float | None = None) -> dict:
    """Call Claude (Anthropic API, direct) and parse a JSON object from the response.

    100% Claude — no proxy, no LiteLLM. Requires ANTHROPIC_API_KEY in the environment.
    `temperature` is accepted for backward compatibility but ignored — Claude Opus 4.8
    rejects sampling parameters; analytical behavior is steered through the prompt instead.
    Streaming is used because the default max_tokens exceeds the SDK's non-streaming guard.
    """
    s = _SETTINGS["llm"]
    with _get_client().messages.stream(
        model=os.environ.get("ANTHROPIC_MODEL", s["model"]),
        max_tokens=max_tokens or s["max_tokens"],
        thinking={"type": "adaptive"},
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        resp = stream.get_final_message()
    if resp.stop_reason == "refusal":
        raise RuntimeError(f"Claude refused the request (safety): {resp.stop_details}")
    if resp.stop_reason == "max_tokens":
        logger.warning("LLM response truncated (hit max_tokens) — output may be repaired")
    text = "".join(block.text for block in resp.content if block.type == "text")
    return parse_llm_json(text)


def load_json_rows(client: bigquery.Client, table_ref: str, rows: list[dict], replace: bool = False) -> None:
    """Append rows via a load job (not streaming) so DELETEs aren't blocked by the buffer.
    With replace=True the load atomically truncates + writes (no empty-table window on failure)."""
    if not rows:
        return
    cfg = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE if replace else bigquery.WriteDisposition.WRITE_APPEND,
        autodetect=False,
    )
    job = client.load_table_from_json(rows, table_ref, job_config=cfg)
    job.result()
    if job.errors:
        raise RuntimeError(f"BigQuery load failed for {table_ref}: {job.errors[:5]}")
