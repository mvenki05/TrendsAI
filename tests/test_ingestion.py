"""Tests for ingestion modules."""

import pytest
import pandas as pd
from datetime import date

from src.ingestion.google_trends import to_weekly_rows, load_keywords, build_term_cluster_map
from src.ingestion.keyword_planner import parse_volume, classify_intent, _parse_single_volume


class TestGoogleTrendsIngestion:
    """Tests for Google Trends data transformation."""

    def test_to_weekly_rows_produces_correct_count(self, sample_trends_wide_df, term_cluster_map):
        rows = to_weekly_rows(sample_trends_wide_df, term_cluster_map, "US")
        # 53 weeks × 5 terms = 265 rows
        assert len(rows) == 53 * 5

    def test_to_weekly_rows_has_required_fields(self, sample_trends_wide_df, term_cluster_map):
        rows = to_weekly_rows(sample_trends_wide_df, term_cluster_map, "US")
        required_fields = {"term", "date", "interest", "geo", "cluster", "ingested_at"}
        for row in rows:
            assert required_fields.issubset(row.keys())

    def test_to_weekly_rows_interest_is_int(self, sample_trends_wide_df, term_cluster_map):
        rows = to_weekly_rows(sample_trends_wide_df, term_cluster_map, "US")
        for row in rows:
            assert isinstance(row["interest"], int)

    def test_to_weekly_rows_maps_clusters(self, sample_trends_wide_df, term_cluster_map):
        rows = to_weekly_rows(sample_trends_wide_df, term_cluster_map, "US")
        protein_rows = [r for r in rows if r["term"] == "high protein snack"]
        assert all(r["cluster"] == "protein_trends" for r in protein_rows)

    def test_load_keywords_returns_clusters(self):
        clusters = load_keywords()
        assert isinstance(clusters, dict)
        assert len(clusters) > 0
        assert "protein_trends" in clusters

    def test_build_term_cluster_map_all_terms(self):
        clusters = load_keywords()
        mapping = build_term_cluster_map(clusters)
        assert len(mapping) >= 100  # Expanded keyword universe (162+ terms)
        assert mapping["high protein snack"] == "protein_trends"
        assert mapping["ozempic friendly food"] == "dietary_health"


class TestKeywordPlannerParsing:
    """Tests for Keyword Planner CSV parsing utilities."""

    def test_parse_volume_simple_number(self):
        assert parse_volume("1000") == 1000

    def test_parse_volume_with_commas(self):
        assert parse_volume("10,000") == 10000

    def test_parse_volume_k_suffix(self):
        assert _parse_single_volume("10K") == 10000

    def test_parse_volume_m_suffix(self):
        assert _parse_single_volume("1.5M") == 1500000

    def test_parse_volume_range(self):
        result = parse_volume("10K – 100K")
        assert result == 55000  # midpoint

    def test_parse_volume_empty(self):
        assert parse_volume("") is None
        assert parse_volume("–") is None

    def test_classify_intent_purchase(self):
        assert classify_intent("frozen chicken tenders buy") == "purchase_intent"
        assert classify_intent("costco protein snacks") == "purchase_intent"

    def test_classify_intent_recipe(self):
        assert classify_intent("air fryer chicken recipe") == "recipe"
        assert classify_intent("how to cook chicken tenders") == "recipe"

    def test_classify_intent_informational(self):
        assert classify_intent("high protein snack") == "informational"
        assert classify_intent("GLP-1 diet") == "informational"
