"""
TrendPulse — End-to-End Integration Tests

Runs the actual pipeline against real BigQuery and LLM.
Uses a small subset of terms to keep it fast (~2-3 minutes).

Usage:
    pytest tests/test_e2e.py -v -m e2e
    pytest tests/test_e2e.py -v -m e2e -k test_01  # Run just one step
"""

import json
import logging
import os
import time
from datetime import datetime, timezone

import pandas as pd
import pytest
import yaml
from dotenv import load_dotenv
from google.cloud import bigquery

load_dotenv(override=True)

logger = logging.getLogger(__name__)

# Skip entire module if no LLM credentials
pytestmark = pytest.mark.e2e

ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY")
BQ_PROJECT = os.environ.get("BIGQUERY_PROJECT", "dev-2534-puw-growth-2295ed")
BQ_DATASET = os.environ.get("BIGQUERY_DATASET", "trend_intelligence")

E2E_TERMS = ["protein ice cream", "air fryer chicken", "cottage cheese recipe", "butter chicken", "ozempic friendly food"]
E2E_CLUSTER_MAP = {
    "protein ice cream": "protein_trends",
    "air fryer chicken": "cooking_formats",
    "cottage cheese recipe": "emerging_experimental",
    "butter chicken": "global_flavors",
    "ozempic friendly food": "dietary_health",
}


@pytest.fixture(scope="module")
def bq_client() -> bigquery.Client:
    return bigquery.Client(project=BQ_PROJECT)


@pytest.fixture(scope="module")
def settings() -> dict:
    config_path = os.path.join(os.path.dirname(__file__), "..", "config", "settings.yaml")
    with open(config_path) as f:
        return yaml.safe_load(f)


# ---------------------------------------------------------------------------
# Step 1: Google Trends ingestion (5 terms)
# ---------------------------------------------------------------------------

class TestE2E01GoogleTrends:
    """Step 1: Ingest 5 terms from Google Trends into BigQuery."""

    def test_01_fetch_and_write(self, bq_client: bigquery.Client):
        from pytrends.request import TrendReq
        from src.ingestion.google_trends import to_weekly_rows

        pytrends = TrendReq(hl="en-US", tz=360)
        pytrends.build_payload(E2E_TERMS, cat=0, timeframe="today 3-m", geo="US")
        df = pytrends.interest_over_time()

        assert not df.empty, "pytrends returned no data"
        assert len(df.columns) >= len(E2E_TERMS), f"Expected {len(E2E_TERMS)} columns, got {len(df.columns)}"

        if "isPartial" in df.columns:
            df = df.drop(columns=["isPartial"])

        rows = to_weekly_rows(df, E2E_CLUSTER_MAP, "US")
        assert len(rows) > 0, "No rows produced"

        # Write to BQ
        table_ref = f"{BQ_PROJECT}.{BQ_DATASET}.google_trends_weekly"
        errors = bq_client.insert_rows_json(table_ref, rows)
        assert not errors, f"BQ insert errors: {errors}"

    def test_02_verify_in_bigquery(self, bq_client: bigquery.Client):
        query = f"""
        SELECT COUNT(*) as cnt, COUNT(DISTINCT term) as terms
        FROM `{BQ_PROJECT}.{BQ_DATASET}.google_trends_weekly`
        WHERE term IN ('protein ice cream', 'air fryer chicken', 'cottage cheese recipe',
                       'butter chicken', 'ozempic friendly food')
          AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
        """
        rows = list(bq_client.query(query).result())
        assert rows[0].cnt > 0, "No rows found in google_trends_weekly"
        assert rows[0].terms == 5, f"Expected 5 distinct terms, got {rows[0].terms}"


# ---------------------------------------------------------------------------
# Step 2: Derived metrics
# ---------------------------------------------------------------------------

class TestE2E02DerivedMetrics:
    """Step 2: Verify derived metrics exist for our terms."""

    def test_01_derived_exist(self, bq_client: bigquery.Client):
        query = f"""
        SELECT term, velocity_score, yoy_growth, trend_direction
        FROM `{BQ_PROJECT}.{BQ_DATASET}.google_trends_derived`
        WHERE date = (SELECT MAX(date) FROM `{BQ_PROJECT}.{BQ_DATASET}.google_trends_derived`)
          AND term IN ('protein ice cream', 'air fryer chicken')
        """
        rows = list(bq_client.query(query).result())
        assert len(rows) >= 2, f"Expected derived metrics for at least 2 terms, got {len(rows)}"

        for row in rows:
            assert row.term is not None
            assert row.velocity_score is not None
            assert row.trend_direction in ("accelerating", "stable", "decelerating", "new")


# ---------------------------------------------------------------------------
# Step 3: Trend detection via LLM
# ---------------------------------------------------------------------------

class TestE2E03TrendDetection:
    """Step 3: Run trend detection on derived metrics via LLM."""

    @pytest.mark.skipif(not ANTHROPIC_KEY, reason="No ANTHROPIC_API_KEY")
    def test_01_detect_trends(self, bq_client: bigquery.Client, settings: dict):
        from src.intelligence.trend_detection import detect_trends, fetch_derived_metrics
        from src.ingestion.google_trends import load_keywords

        from src.intelligence.trend_detection import load_keywords as load_kw_full
        keywords_config = load_kw_full()

        # Use real derived metrics (already in BQ from earlier runs)
        metrics = fetch_derived_metrics(bq_client, BQ_PROJECT, BQ_DATASET)
        assert len(metrics) > 0, "No derived metrics in BigQuery"

        # Take top 10 only for speed
        metrics.sort(key=lambda m: abs(m.get("velocity_score", 0) or 0), reverse=True)
        metrics = metrics[:10]

        result = detect_trends(metrics, keywords_config, settings)

        assert "signals" in result, "No 'signals' key in detection result"
        signals = result["signals"]
        assert len(signals) >= 1, "Expected at least 1 signal"

        for signal in signals:
            assert "name" in signal, "Signal missing 'name'"
            assert "horizon" in signal, "Signal missing 'horizon'"
            assert signal["horizon"] in ("H1", "H2", "H3", "H2/H3"), f"Invalid horizon: {signal['horizon']}"
            assert "signal_strength" in signal
            assert 0 <= signal["signal_strength"] <= 100

    @pytest.mark.skipif(not ANTHROPIC_KEY, reason="No ANTHROPIC_API_KEY")
    def test_02_signals_in_bigquery(self, bq_client: bigquery.Client):
        query = f"""
        SELECT trend_id, name, horizon, signal_strength
        FROM `{BQ_PROJECT}.{BQ_DATASET}.trend_signals`
        WHERE last_updated = (SELECT MAX(last_updated) FROM `{BQ_PROJECT}.{BQ_DATASET}.trend_signals`)
        """
        rows = list(bq_client.query(query).result())
        assert len(rows) >= 1, "No trend signals found in BigQuery"

        for row in rows:
            assert row.trend_id is not None
            assert row.name is not None
            assert row.horizon is not None
            assert row.signal_strength is not None


# ---------------------------------------------------------------------------
# Step 4: Opportunity sizing via LLM
# ---------------------------------------------------------------------------

class TestE2E04Sizing:
    """Step 4: Run opportunity sizing on detected signals."""

    @pytest.mark.skipif(not ANTHROPIC_KEY, reason="No ANTHROPIC_API_KEY")
    def test_01_run_sizing(self, bq_client: bigquery.Client, settings: dict):
        from src.scoring.sizing import fetch_trend_signals, fetch_keyword_volumes, fetch_circana_data, run_sizing

        signals = fetch_trend_signals(bq_client, BQ_PROJECT, BQ_DATASET)
        assert len(signals) >= 1, "No signals to size"

        volumes = fetch_keyword_volumes(bq_client, BQ_PROJECT, BQ_DATASET)
        circana = fetch_circana_data(bq_client, BQ_PROJECT, BQ_DATASET)

        result = run_sizing(signals, volumes, circana, settings)

        assert "sized_opportunities" in result, "No 'sized_opportunities' in result"
        opps = result["sized_opportunities"]
        assert len(opps) >= 1, "Expected at least 1 sized opportunity"

        for opp in opps:
            assert "trend_name" in opp, "Missing trend_name"
            assert "opportunity_estimate" in opp or "sizing_narrative" in opp, "Missing sizing data"


# ---------------------------------------------------------------------------
# Step 5: Portfolio fit scoring via LLM
# ---------------------------------------------------------------------------

class TestE2E05Scoring:
    """Step 5: Run portfolio fit scoring."""

    @pytest.mark.skipif(not ANTHROPIC_KEY, reason="No ANTHROPIC_API_KEY")
    def test_01_run_scoring(self, bq_client: bigquery.Client, settings: dict):
        from src.scoring.portfolio_fit import run as run_portfolio_fit

        # This reads sizing output + signals from BQ, scores via LLM, writes to BQ
        run_portfolio_fit()

    @pytest.mark.skipif(not ANTHROPIC_KEY, reason="No ANTHROPIC_API_KEY")
    def test_02_scores_in_bigquery(self, bq_client: bigquery.Client):
        query = f"""
        SELECT trend_id, trend_name, composite_score,
               manufacturing_adjacency, brand_permission,
               channel_readiness, competitive_density, trend_momentum
        FROM `{BQ_PROJECT}.{BQ_DATASET}.opportunity_scores`
        WHERE DATE(scored_at) = (SELECT MAX(DATE(scored_at)) FROM `{BQ_PROJECT}.{BQ_DATASET}.opportunity_scores`)
        """
        rows = list(bq_client.query(query).result())
        assert len(rows) >= 1, "No opportunity scores in BigQuery"

        for row in rows:
            assert row.trend_id is not None
            assert row.composite_score is not None
            assert 1 <= row.manufacturing_adjacency <= 10
            assert 1 <= row.brand_permission <= 10
            assert 1 <= row.channel_readiness <= 10
            assert 1 <= row.competitive_density <= 10
            assert 1 <= row.trend_momentum <= 10
            assert 1.0 <= row.composite_score <= 10.0


# ---------------------------------------------------------------------------
# Step 6: Dashboard API routes
# ---------------------------------------------------------------------------

class TestE2E06DashboardAPI:
    """Step 6: Verify BigQuery queries used by dashboard API routes work."""

    def test_01_signals_query(self, bq_client: bigquery.Client):
        query = f"""
        SELECT trend_id, name, horizon, signal_strength
        FROM `{BQ_PROJECT}.{BQ_DATASET}.trend_signals`
        WHERE last_updated = (SELECT MAX(last_updated) FROM `{BQ_PROJECT}.{BQ_DATASET}.trend_signals`)
        ORDER BY signal_strength DESC
        """
        rows = list(bq_client.query(query).result())
        # Should have data from our earlier runs
        assert len(rows) >= 1

    def test_02_derived_query(self, bq_client: bigquery.Client):
        query = f"""
        SELECT term, velocity_score, yoy_growth, trend_direction
        FROM `{BQ_PROJECT}.{BQ_DATASET}.google_trends_derived`
        WHERE date = (SELECT MAX(date) FROM `{BQ_PROJECT}.{BQ_DATASET}.google_trends_derived`)
        ORDER BY ABS(velocity_score) DESC
        """
        rows = list(bq_client.query(query).result())
        assert len(rows) >= 1

    def test_03_scores_query(self, bq_client: bigquery.Client):
        """This may return 0 rows if scoring hasn't run yet — that's OK."""
        query = f"""
        SELECT COUNT(*) as cnt
        FROM `{BQ_PROJECT}.{BQ_DATASET}.opportunity_scores`
        """
        rows = list(bq_client.query(query).result())
        assert rows[0].cnt >= 0  # Just verify query doesn't error
