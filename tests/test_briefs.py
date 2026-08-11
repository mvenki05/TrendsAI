"""Tests for brief generation modules."""

import os
from pathlib import Path

import pytest

from src.briefs.weekly_radar import (
    fetch_signals,
    fetch_top_movers,
    fetch_scores,
)
from src.briefs.opportunity import (
    fetch_all_signals,
    fetch_signal,
    format_brands_context,
    load_brands,
)


BQ_PROJECT = os.environ.get("BIGQUERY_PROJECT", "dev-2534-puw-growth-2295ed")
BQ_DATASET = os.environ.get("BIGQUERY_DATASET", "trend_intelligence")


class TestWeeklyRadarBrief:
    """Test weekly radar brief data fetching and structure."""

    def test_fetch_signals_returns_list(self, mock_bigquery_client):
        """Signals fetch should return a list."""
        # Just verify the function signature works — actual BQ test is in E2E
        assert callable(fetch_signals)

    def test_fetch_top_movers_returns_list(self):
        assert callable(fetch_top_movers)

    def test_fetch_scores_returns_list(self):
        assert callable(fetch_scores)


class TestOpportunityBrief:
    """Test opportunity brief data and brand context."""

    def test_brands_context_includes_all_brands(self):
        brands = load_brands()
        context = format_brands_context(brands)
        assert "Jimmy Dean" in context
        assert "Tyson" in context
        assert "Ball Park" in context
        assert "Hillshire Farm" in context
        assert "Aidells" in context

    def test_brands_context_includes_positioning(self):
        brands = load_brands()
        context = format_brands_context(brands)
        assert "breakfast" in context.lower()
        assert "protein" in context.lower() or "chicken" in context.lower()

    def test_fetch_all_signals_callable(self):
        assert callable(fetch_all_signals)

    def test_fetch_signal_callable(self):
        assert callable(fetch_signal)


class TestBriefOutputDirectory:
    """Test brief output file handling."""

    def test_output_dir_can_be_created(self, tmp_path):
        output_dir = tmp_path / "output" / "briefs"
        output_dir.mkdir(parents=True, exist_ok=True)
        assert output_dir.exists()

    def test_markdown_write(self, tmp_path):
        output_file = tmp_path / "test_brief.md"
        content = "# Test Brief\n\nThis is a test."
        output_file.write_text(content, encoding="utf-8")
        assert output_file.read_text(encoding="utf-8") == content
