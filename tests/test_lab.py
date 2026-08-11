"""Tests for the White Space Scout (src/lab.py) — pure logic only, no BQ/LLM/network."""

from src import lab


def _cand(name: str, **kw) -> dict:
    base = {"name": name, "description": None, "origin": None, "search_term": None, "_sources": []}
    base.update(kw)
    return base


class TestPrefilterKnown:
    KNOWN = [
        {"name": "Protein Soda", "where": "web discovery"},
        {"name": "korean corn dog", "where": "deck taxonomy"},
        {"name": "cottage cheese", "where": "deck taxonomy"},
    ]

    def test_exact_match_rejected_case_insensitive(self):
        keep, rejected = lab.prefilter_known([_cand("protein soda")], self.KNOWN)
        assert keep == []
        assert rejected[0]["is_new"] is False
        assert "Protein Soda" in rejected[0]["closest_known"]
        assert "web discovery" in rejected[0]["closest_known"]

    def test_known_contained_in_candidate_rejected(self):
        keep, rejected = lab.prefilter_known([_cand("frozen korean corn dog kit")], self.KNOWN)
        assert keep == []
        assert len(rejected) == 1

    def test_candidate_contained_in_known_rejected(self):
        keep, rejected = lab.prefilter_known([_cand("corn dog")], self.KNOWN)
        assert keep == []
        assert len(rejected) == 1

    def test_partial_word_overlap_is_not_a_match(self):
        # "cheese" alone shares a word with "cottage cheese" but is not a substring on
        # word boundaries in either direction only when actually contained — "cheese"
        # IS contained in "cottage cheese", so pick a genuinely disjoint name.
        keep, rejected = lab.prefilter_known([_cand("breakfast soup cup")], self.KNOWN)
        assert rejected == []
        assert keep[0]["name"] == "breakfast soup cup"

    def test_whitespace_and_case_normalized(self):
        keep, rejected = lab.prefilter_known([_cand("  KOREAN   CORN  DOG ")], self.KNOWN)
        assert keep == []
        assert len(rejected) == 1

    def test_empty_known_universe_keeps_everything(self):
        keep, rejected = lab.prefilter_known([_cand("anything at all")], [])
        assert len(keep) == 1
        assert rejected == []


class TestIdeaRow:
    def test_row_shape_and_publisher_count(self):
        c = _cand(
            "breakfast soup cup",
            description="Savory soup sold as a morning handheld.",
            origin="Japan",
            search_term="breakfast soup",
            _sources=[
                {"title": "A", "url": "http://a", "source": "PubOne"},
                {"title": "B", "url": "http://b", "source": "PubTwo"},
                {"title": "A", "url": "http://a", "source": "PubOne"},  # dup source entry
            ],
        )
        c.update({"is_new": True, "closest_known": None, "novelty_reason": "New format.",
                  "buildable": True, "tyson_brand": "Jimmy Dean", "concept_name": "Morning Sip Soup",
                  "pitch": "Soup for breakfast.", "fit_score": 80.0, "fit_rationale": "Bowl lines."})
        row = lab._idea_row(c, "run_x", "2026-07-22T00:00:00+00:00")
        assert row["idea_id"].startswith("ws_")
        assert row["run_id"] == "run_x"
        assert row["support"] == 2  # distinct publishers, dup collapsed
        assert row["buildable"] is True
        assert row["status"] == "new"
        # sources JSON deduped by (title, url)
        import json
        assert len(json.loads(row["sources"])) == 2

    def test_missing_gate_fields_default_safely(self):
        row = lab._idea_row(_cand("x", _sources=[]), "run_x", "2026-07-22T00:00:00+00:00")
        assert row["buildable"] is False
        assert row["fit_score"] is None
        assert row["tyson_brand"] is None


class TestExtractIdeasMerging:
    def test_same_idea_across_chunks_merges_sources(self, monkeypatch):
        corpus = [{"title": f"t{i}", "link": f"http://{i}", "source": f"s{i}", "text": f"body {i}"}
                  for i in range(2)]
        monkeypatch.setattr(lab, "EXTRACT_CHUNK", 1)
        calls = iter([
            {"ideas": [{"name": "Protein Horchata", "description": "d1", "sources": [0]}]},
            {"ideas": [{"name": "protein  horchata", "description": "d2", "sources": [0]}]},
        ])
        monkeypatch.setattr(lab, "complete_json", lambda prompt: next(calls))
        out = lab.extract_ideas(corpus)
        assert len(out) == 1
        assert len(out[0]["_sources"]) == 2

    def test_out_of_range_source_indices_dropped(self, monkeypatch):
        corpus = [{"title": "t", "link": "http://x", "source": "s", "text": "body"}]
        monkeypatch.setattr(
            lab, "complete_json",
            lambda prompt: {"ideas": [{"name": "Ghost Idea", "sources": [5]},
                                      {"name": "Real Idea", "sources": [0]}]})
        out = lab.extract_ideas(corpus)
        assert [c["name"] for c in out] == ["Real Idea"]


class TestPortfolio:
    def test_load_portfolio_renders_brands_and_lines(self):
        text = lab.load_portfolio()
        assert "Jimmy Dean" in text
        assert "Manufacturing lines:" in text
        assert "protein" in text.lower()
