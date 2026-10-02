"""
TrendLens — shared helpers (settings, BigQuery client, Claude JSON calls).
"""

import logging
import os
from pathlib import Path

import requests
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


def complete_json(prompt: str, max_tokens: int | None = None, temperature: float | None = None) -> dict:
    """Call Claude via the LiteLLM gateway (OpenAI-compatible /v1/chat/completions) and parse
    a JSON object from the response.

    This machine has no direct ANTHROPIC_API_KEY (see CLAUDE.md's CRITICAL CONSTRAINT) — this
    routes through the same LiteLLM gateway the dashboard's Ask TrendLens chat already uses
    (src/lib/ask/litellm.ts), instead of the Anthropic SDK directly.
    `temperature` is accepted for backward compatibility but ignored — Claude Opus 4.8 rejects
    sampling parameters; analytical behavior is steered through the prompt instead.

    Uses LITELLM_TEXT_API_KEY (a separate key/budget for this heavier text-generation
    workload) if set, else falls back to LITELLM_API_KEY (also used for image generation —
    kept distinct so this doesn't eat that smaller budget).
    """
    base_url = os.environ.get("LITELLM_BASE_URL")
    api_key = os.environ.get("LITELLM_TEXT_API_KEY") or os.environ.get("LITELLM_API_KEY")
    if not base_url or not api_key:
        raise RuntimeError("LiteLLM is not configured — set LITELLM_BASE_URL and LITELLM_TEXT_API_KEY (or LITELLM_API_KEY) in .env")

    s = _SETTINGS["llm"]
    model = os.environ.get("LITELLM_CHAT_MODEL", "claude-4-8-opus")
    resp = requests.post(
        f"{base_url}/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens or s["max_tokens"],
        },
        # Large max_tokens (dossier refreshes ask for up to 64000) can legitimately take
        # several minutes to stream through the gateway — 300s was cutting those off mid-generation.
        timeout=900,
    )
    if not resp.ok:
        raise RuntimeError(f"LiteLLM request failed: {resp.status_code} {resp.text[:500]}")

    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError(f"LiteLLM returned no choices: {data}")
    choice = choices[0]
    finish_reason = choice.get("finish_reason")
    if finish_reason == "content_filter":
        raise RuntimeError(f"Claude refused the request (content filter): {choice}")
    if finish_reason == "length":
        logger.warning("LLM response truncated (hit max_tokens) — output may be repaired")
    text = (choice.get("message") or {}).get("content") or ""
    return parse_llm_json(text)


def ensure_pdf_rendition(report_id: str, source_path: Path) -> None:
    """For a .pptx source, create uploads/<report_id>.pdf alongside it so citations can
    deep-link #page=N (browsers can't anchor into a PPTX — see /api/file/[id] and
    scripts/backfill_cite_pages.py, both of which prefer this rendition when present).
    Best-effort: requires Windows + a local PowerPoint install (via pywin32 COM). Silently
    no-ops elsewhere (e.g. the hosted Linux deployment) — citations just won't be page-anchored.
    """
    if source_path.suffix.lower() != ".pptx":
        return
    source_path = source_path.resolve()
    uploads_dir = source_path.parent if source_path.parent.name == "uploads" else (Path(__file__).parent.parent / "uploads").resolve()
    dest = uploads_dir / f"{report_id}.pdf"
    if dest.exists():
        return
    try:
        import win32com.client
    except ImportError:
        logger.info("pywin32 not available — skipping PDF rendition for %s", source_path.name)
        return
    try:
        ppt = win32com.client.DispatchEx("PowerPoint.Application")
        try:
            # COM SaveAs requires an absolute path — a relative one fails with a
            # "couldn't find <path>" error since PowerPoint's own CWD isn't ours.
            pres = ppt.Presentations.Open(str(source_path), WithWindow=False)
            pres.SaveAs(str(dest), 32)  # 32 = ppSaveAsPDF
            pres.Close()
            if not dest.exists():
                raise RuntimeError("SaveAs reported success but no output file was written")
            logger.info("Converted %s -> %s for page-anchored citations", source_path.name, dest.name)
        finally:
            ppt.Quit()
    except Exception as e:
        logger.warning("PPTX->PDF conversion failed for %s: %s", source_path.name, e)


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
