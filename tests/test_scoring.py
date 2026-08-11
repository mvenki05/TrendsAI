"""Tests for scoring modules."""

import json
import pytest

from src.scoring.portfolio_fit import format_brands_context, load_brands


class TestPortfolioFitScoring:
    """Validate scoring output structure and weights."""

    WEIGHTS = {
        "manufacturing_adjacency": 0.25,
        "brand_permission": 0.20,
        "channel_readiness": 0.15,
        "competitive_density": 0.20,
        "trend_momentum": 0.20,
    }

    SAMPLE_SCORED = {
        "trend_id": "trend_abc123",
        "trend_name": "GLP-1 Optimized Protein Products",
        "manufacturing_adjacency": 9,
        "brand_permission": 8,
        "channel_readiness": 8,
        "competitive_density": 9,
        "trend_momentum": 10,
        "composite_score": 8.85,
        "recommended_action": "H1: act now",
        "suggested_brands": ["Jimmy Dean", "Tyson"],
        "rationale": {
            "manufacturing": "Reformulation of existing products",
            "brand": "Jimmy Dean breakfast and Tyson frozen both fit",
            "channel": "Retailers expanding better-for-you sections",
            "competition": "No major CPG has dedicated GLP-1 line",
            "momentum": "Structural trend — 30M+ patients by 2027",
        },
        "concept_suggestion": "Protein Plus sub-line: 30g+ protein, <350 cal, small portions",
        "key_risk": "Speed — Nestle and Conagra likely evaluating same signals",
    }

    def test_composite_score_calculation(self):
        """Verify composite score matches weighted average of dimensions."""
        s = self.SAMPLE_SCORED
        expected = (
            s["manufacturing_adjacency"] * 0.25
            + s["brand_permission"] * 0.20
            + s["channel_readiness"] * 0.15
            + s["competitive_density"] * 0.20
            + s["trend_momentum"] * 0.20
        )
        assert abs(s["composite_score"] - expected) < 0.1

    def test_all_dimensions_in_range(self):
        s = self.SAMPLE_SCORED
        for dim in ["manufacturing_adjacency", "brand_permission", "channel_readiness",
                     "competitive_density", "trend_momentum"]:
            assert 1 <= s[dim] <= 10, f"{dim} out of range: {s[dim]}"

    def test_composite_in_range(self):
        assert 1.0 <= self.SAMPLE_SCORED["composite_score"] <= 10.0

    def test_has_required_fields(self):
        required = {
            "trend_id", "trend_name", "manufacturing_adjacency", "brand_permission",
            "channel_readiness", "competitive_density", "trend_momentum",
            "composite_score", "recommended_action", "suggested_brands",
        }
        assert required.issubset(self.SAMPLE_SCORED.keys())

    def test_suggested_brands_are_valid(self):
        valid_brands = {"Tyson", "Jimmy Dean", "Ball Park", "Hillshire Farm", "Aidells"}
        for brand in self.SAMPLE_SCORED["suggested_brands"]:
            assert brand in valid_brands, f"Unknown brand: {brand}"

    def test_rationale_covers_all_dimensions(self):
        required_keys = {"manufacturing", "brand", "channel", "competition", "momentum"}
        assert required_keys.issubset(self.SAMPLE_SCORED["rationale"].keys())

    def test_weights_sum_to_one(self):
        assert abs(sum(self.WEIGHTS.values()) - 1.0) < 0.001

    def test_load_brands_has_expected_brands(self):
        brands = load_brands()
        assert "brands" in brands
        assert "jimmy_dean" in brands["brands"]
        assert "tyson" in brands["brands"]

    def test_format_brands_context_not_empty(self):
        brands = load_brands()
        context = format_brands_context(brands)
        assert len(context) > 100
        assert "Jimmy Dean" in context
        assert "Tyson" in context
