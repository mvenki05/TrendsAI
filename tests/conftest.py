"""Shared fixtures for TrendPulse tests."""

import os
import random
from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock

import pandas as pd
import pytest


@pytest.fixture
def sample_trends_wide_df() -> pd.DataFrame:
    """Sample wide-format Google Trends DataFrame (as returned by pytrends)."""
    dates = pd.date_range("2025-03-16", periods=53, freq="W")
    data = {
        "high protein snack": [random.randint(40, 90) for _ in range(53)],
        "ozempic friendly food": [random.randint(5, 30) for _ in range(53)],
        "air fryer chicken": [random.randint(50, 100) for _ in range(53)],
        "butter chicken": [random.randint(20, 60) for _ in range(53)],
        "cottage cheese recipe": [random.randint(10, 50) for _ in range(53)],
    }
    df = pd.DataFrame(data, index=dates)
    df.index.name = "date"
    return df


@pytest.fixture
def sample_derived_metrics() -> list[dict]:
    """Sample derived metrics rows as returned from BigQuery."""
    return [
        {
            "term": "protein ice cream",
            "date": date(2026, 3, 16),
            "cluster": "protein_trends",
            "current_interest": 84,
            "yoy_growth": 66.2,
            "acceleration": 20.1,
            "velocity_score": 112.0,
            "trend_direction": "accelerating",
        },
        {
            "term": "ozempic friendly food",
            "date": date(2026, 3, 16),
            "cluster": "dietary_health",
            "current_interest": 12,
            "yoy_growth": 242.9,
            "acceleration": -25.9,
            "velocity_score": -75.5,
            "trend_direction": "decelerating",
        },
        {
            "term": "air fryer chicken",
            "date": date(2026, 3, 16),
            "cluster": "cooking_formats",
            "current_interest": 68,
            "yoy_growth": -5.2,
            "acceleration": 3.1,
            "velocity_score": -1.1,
            "trend_direction": "stable",
        },
    ]


@pytest.fixture
def sample_reddit_posts() -> list[dict]:
    """Sample Reddit post rows."""
    return [
        {
            "post_id": "abc123",
            "subreddit": "Ozempic",
            "title": "Best high protein meals for Ozempic users?",
            "body": "Since starting Ozempic I can only eat small portions but need 30g protein minimum.",
            "score": 450,
            "num_comments": 180,
            "category": "diet",
            "created_date": date(2026, 3, 14),
        },
        {
            "post_id": "def456",
            "subreddit": "airfryer",
            "title": "Air fryer frozen chicken tenders ranking",
            "body": "Tried every brand. Tyson is mid tier. Here's my full ranking...",
            "score": 320,
            "num_comments": 95,
            "category": "cooking_method",
            "created_date": date(2026, 3, 13),
        },
    ]


@pytest.fixture
def mock_bigquery_client() -> MagicMock:
    """Mock BigQuery client."""
    client = MagicMock()
    client.insert_rows_json.return_value = []  # No errors
    query_job = MagicMock()
    query_job.result.return_value = []
    client.query.return_value = query_job
    return client


@pytest.fixture
def term_cluster_map() -> dict[str, str]:
    """Sample term-to-cluster mapping."""
    return {
        "high protein snack": "protein_trends",
        "protein ice cream": "protein_trends",
        "ozempic friendly food": "dietary_health",
        "air fryer chicken": "cooking_formats",
        "butter chicken": "global_flavors",
        "cottage cheese recipe": "emerging_experimental",
    }
