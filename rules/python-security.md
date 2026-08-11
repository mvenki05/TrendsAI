---
paths:
  - "**/*.py"
---
# Python Security Rules — TrendPulse

## Secret Management

```python
import os
from dotenv import load_dotenv

load_dotenv()

# Always use environment variables for secrets
api_key = os.environ["ANTHROPIC_API_KEY"]  # Raises KeyError if missing
```

- Never hardcode API keys, credentials, or tokens
- Never log or print secrets
- Use `.env` files locally, environment variables in production
- `.env` is in `.gitignore` — verify before every commit

## BigQuery Injection Prevention

```python
# GOOD: Parameterized query
query = """
    SELECT * FROM `project.dataset.table`
    WHERE term = @term AND date >= @start_date
"""
job_config = bigquery.QueryJobConfig(
    query_parameters=[
        bigquery.ScalarQueryParameter("term", "STRING", term),
        bigquery.ScalarQueryParameter("start_date", "DATE", start_date),
    ]
)
client.query(query, job_config=job_config)

# BAD: String interpolation — SQL injection risk
query = f"SELECT * FROM table WHERE term = '{term}'"
```

## Input Validation

- Validate all external input (API responses, Reddit data, CSV uploads)
- Sanitize Reddit post content before storing in BigQuery
- Validate keyword terms against allowed character patterns

## Dependency Security

```bash
# Scan dependencies for known vulnerabilities
pip-audit
```

## Security Scanning

```bash
bandit -r src/
```
