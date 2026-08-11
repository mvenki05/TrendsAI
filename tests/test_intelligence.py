"""Tests for intelligence layer prompt chain output validation."""

import json
import pytest


class TestTrendDetectionOutput:
    """Validate the expected structure of trend detection Claude output."""

    SAMPLE_OUTPUT = {
        "analysis_date": "2026-03-16",
        "signals": [
            {
                "name": "Protein Ice Cream Breakout",
                "horizon": "H1",
                "signal_strength": 78,
                "primary_cluster": "protein_trends",
                "related_clusters": ["dietary_health"],
                "key_terms": [
                    {"term": "protein ice cream", "velocity_score": 112.0,
                     "yoy_growth": 66.2, "current_interest": 84, "direction": "accelerating"}
                ],
                "narrative": "Protein ice cream is accelerating with strong absolute interest.",
                "recommended_action": "Evaluate product development feasibility.",
            }
        ],
        "cluster_summary": [
            {"cluster": "protein_trends", "trend_direction": "accelerating",
             "accelerating_count": 3, "total_count": 10, "notable_terms": ["protein ice cream"]}
        ],
        "declining_signals": [],
    }

    def test_has_required_top_level_keys(self):
        required = {"analysis_date", "signals", "cluster_summary", "declining_signals"}
        assert required.issubset(self.SAMPLE_OUTPUT.keys())

    def test_signal_has_required_fields(self):
        signal = self.SAMPLE_OUTPUT["signals"][0]
        required = {"name", "horizon", "signal_strength", "primary_cluster", "key_terms", "narrative"}
        assert required.issubset(signal.keys())

    def test_horizon_is_valid(self):
        for signal in self.SAMPLE_OUTPUT["signals"]:
            assert signal["horizon"] in ("H1", "H2", "H3")

    def test_signal_strength_in_range(self):
        for signal in self.SAMPLE_OUTPUT["signals"]:
            assert 0 <= signal["signal_strength"] <= 100

    def test_key_terms_have_required_fields(self):
        for signal in self.SAMPLE_OUTPUT["signals"]:
            for term in signal["key_terms"]:
                assert "term" in term
                assert "velocity_score" in term
                assert "direction" in term
                assert term["direction"] in ("accelerating", "stable", "decelerating", "new")

    def test_output_is_valid_json(self):
        """Ensure the output can roundtrip through JSON."""
        json_str = json.dumps(self.SAMPLE_OUTPUT)
        parsed = json.loads(json_str)
        assert parsed == self.SAMPLE_OUTPUT


class TestRedditInsightsOutput:
    """Validate the expected structure of Reddit insight extraction output."""

    SAMPLE_OUTPUT = {
        "analysis_date": "2026-03-16",
        "emerging_concepts": [
            {
                "concept": "High-protein small-portion frozen meals",
                "description": "GLP-1 users seeking 30g+ protein in under 350 calories",
                "subreddits_seen": ["Ozempic", "semaglutide", "1200isplenty"],
                "post_count": 6,
                "avg_score": 350,
                "relevance_to_tyson": "Jimmy Dean and Tyson frozen lines could target this gap",
            }
        ],
        "pain_points": [
            {
                "pain_point": "No frozen meals with 30g+ protein under 350 calories",
                "consumer_quotes": ["Every frozen meal is either high protein and 600 calories or low calorie with 12g protein"],
                "subreddits": ["Ozempic"],
                "post_count": 4,
                "innovation_opportunity": "Reformulated frozen meals targeting GLP-1 users",
            }
        ],
        "whitespace_signals": [],
        "brand_mentions": [
            {"brand": "Jimmy Dean", "mention_count": 12, "sentiment": "mixed",
             "key_themes": ["good protein", "too many calories"], "notable_quotes": []}
        ],
        "cross_subreddit_spread": [],
    }

    def test_has_required_top_level_keys(self):
        required = {"emerging_concepts", "pain_points", "whitespace_signals", "brand_mentions", "cross_subreddit_spread"}
        assert required.issubset(self.SAMPLE_OUTPUT.keys())

    def test_concept_has_required_fields(self):
        concept = self.SAMPLE_OUTPUT["emerging_concepts"][0]
        required = {"concept", "description", "subreddits_seen", "relevance_to_tyson"}
        assert required.issubset(concept.keys())

    def test_pain_point_has_required_fields(self):
        pp = self.SAMPLE_OUTPUT["pain_points"][0]
        required = {"pain_point", "consumer_quotes", "innovation_opportunity"}
        assert required.issubset(pp.keys())

    def test_brand_sentiment_is_valid(self):
        for bm in self.SAMPLE_OUTPUT["brand_mentions"]:
            assert bm["sentiment"] in ("positive", "negative", "mixed")
