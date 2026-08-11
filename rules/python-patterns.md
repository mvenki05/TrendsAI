---
paths:
  - "**/*.py"
---
# Python Patterns — TrendPulse

## Type Hints

All function signatures must have type annotations.

```python
def calculate_velocity_score(
    yoy_growth: float,
    acceleration: float,
    current_interest: int,
) -> float:
    return (yoy_growth * acceleration * current_interest) / 1000
```

## Dataclasses for Structured Data

```python
from dataclasses import dataclass

@dataclass
class TrendSignal:
    trend_id: str
    name: str
    horizon: str  # H1, H2, H3
    velocity_score: float
    cluster: str
    terms: list[str]

@dataclass
class OpportunityScore:
    trend_id: str
    manufacturing_adjacency: int  # 1-10
    brand_permission: int
    channel_readiness: int
    competitive_density: int
    trend_momentum: int
    composite_score: float
```

## Config Loading Pattern

```python
import yaml
from pathlib import Path

def load_config(config_name: str) -> dict:
    config_path = Path(__file__).parent.parent.parent / "config" / f"{config_name}.yaml"
    with open(config_path) as f:
        return yaml.safe_load(f)
```

## Logging Over Print

```python
import logging

logger = logging.getLogger(__name__)

# Good
logger.info("Ingesting %d terms from Google Trends", len(terms))
logger.warning("Rate limited by pytrends, backing off %ds", delay)
logger.error("BigQuery write failed for table %s: %s", table, error)

# Bad
print(f"Ingesting {len(terms)} terms")
```

## Retry with Tenacity

```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=2, min=2, max=60),
    retry=retry_if_exception_type(Exception),
)
def fetch_google_trends(term: str) -> pd.DataFrame:
    ...
```

## Generator for Large Data

```python
def read_trends_in_batches(terms: list[str], batch_size: int = 5):
    for i in range(0, len(terms), batch_size):
        yield terms[i:i + batch_size]
```

## Context Managers for Resources

```python
# Always use context managers for BigQuery and file operations
with open(config_path) as f:
    config = yaml.safe_load(f)
```

## Import Order

```python
# stdlib
import logging
import os
from datetime import datetime
from pathlib import Path

# third-party
import pandas as pd
import yaml
from google.cloud import bigquery

# local
from src.ingestion.google_trends import fetch_trends
from src.scoring.portfolio_fit import score_opportunity
```
