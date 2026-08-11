---
paths:
  - "**/*.py"
---
# Python Testing Rules — TrendPulse

## Framework

Use **pytest** with markers for test categorization.

## Test Structure

```
tests/
├── conftest.py              # Shared fixtures (mock BigQuery client, sample data)
├── test_ingestion.py        # Google Trends + Reddit ingestion tests
├── test_intelligence.py     # Trend detection + Reddit insight prompt tests
├── test_scoring.py          # Sizing + portfolio fit scoring tests
└── test_briefs.py           # Brief generation tests
```

## Markers

```python
import pytest

@pytest.mark.unit
def test_velocity_score_calculation():
    """Pure calculation, no external deps."""
    ...

@pytest.mark.integration
def test_bigquery_write():
    """Requires BigQuery connection."""
    ...

@pytest.mark.slow
def test_full_pipeline():
    """End-to-end pipeline run."""
    ...
```

## Key Fixtures

```python
@pytest.fixture
def sample_trends_data():
    """Sample Google Trends response for testing."""
    return pd.DataFrame({
        "date": pd.date_range("2025-01-01", periods=52, freq="W"),
        "high protein snack": [random.randint(40, 90) for _ in range(52)],
    })

@pytest.fixture
def mock_bigquery_client():
    """Mock BigQuery client that doesn't hit real BQ."""
    with patch("google.cloud.bigquery.Client") as mock:
        yield mock
```

## Coverage

```bash
pytest --cov=src --cov-report=term-missing
```

Target: 80%+ on `src/ingestion/` and `src/scoring/`. Prompt chain tests focus on output structure validation, not exact text matching.

## What to Test in Prompt Chains

- Output is valid JSON (if JSON output expected)
- Required fields are present
- Scores are within expected ranges (1-10)
- Horizon classification is one of H1/H2/H3
- No hallucinated data sources or statistics
