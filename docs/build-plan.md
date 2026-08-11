# TrendPulse — 4-Week Build Plan

## Status Key
- [ ] Not started
- [x] Complete

---

## Completed (Pre-Week 1)

- [x] Project structure created
- [x] CLAUDE.md written
- [x] Config files: keywords.yaml (80 terms, 9 clusters), subreddits.yaml (20 subs), brands.yaml (5 brands), settings.yaml
- [x] pyproject.toml, .env.example, .gitignore
- [x] Toolkit adapted from everything-claude-code: agents (planner, python-reviewer), commands (plan, prompt-optimize), rules (security, testing, patterns), skills (market-research), contexts (research)
- [x] Toolkit guide: docs/toolkit-guide.md

---

## Week 1: Data Foundation

### 1. BigQuery Schema Setup
- **File:** `scripts/setup_bigquery.py`
- **What:** Create all 7 BigQuery tables with proper schemas, partitioning, and clustering
- **Tables:** google_trends_weekly, google_trends_derived, reddit_posts, keyword_volumes, trend_signals, opportunity_scores, circana_reference
- **Status:** [x]

### 2. Google Trends Ingestion
- **File:** `src/ingestion/google_trends.py`
- **What:** Pull weekly Google Trends data for all 80 terms, compute derived metrics (YoY growth, acceleration, velocity score), write to BigQuery
- **Key challenges:** pytrends rate limiting — batch 5 terms per request, 2s delay, exponential backoff on 429 errors via tenacity
- **Status:** [x] — 4,240 rows (53 weeks × 80 terms) written to google_trends_weekly, 80 derived metrics to google_trends_derived

### 3. Historical Backfill
- **File:** `scripts/backfill_trends.py`
- **What:** One-time pull of 12 months of weekly historical data for all 80 terms. Populates baseline for YoY calculations.
- **Key challenges:** ~16 batches × multiple timeframes. Will take hours due to rate limits. Run overnight.
- **Status:** [x] — Handled by google_trends.py with timeframe="today 12-m" (12 months of weekly data ingested in single run)

### 4. Reddit Ingestion
- **File:** `src/ingestion/reddit.py`
- **What:** Pull top 50 posts per week from each of 20 tracked subreddits via PRAW. Store raw post data (subreddit, title, body, score, num_comments, created_date, url) in BigQuery.
- **Status:** [x] — Script written, awaiting Reddit API credentials (https://www.reddit.com/prefs/apps → "script" type)

### 5. Ingestion Tests
- **File:** `tests/test_ingestion.py`
- **What:** Unit tests for data transformations, mock BigQuery client tests, rate-limit handling validation
- **Status:** [x] — 15 tests passing (Google Trends transforms + Keyword Planner parsing)

---

## Week 2: Intelligence Layer

### 6. Trend Detection Prompt Chain
- **File:** `src/intelligence/trend_detection.py`
- **What:** Read google_trends_derived from BigQuery → send to Claude API → flag breakout signals (velocity score threshold), cluster acceleration (multiple terms in same cluster trending), horizon classification (H1/H2/H3) → write results to trend_signals table
- **Prompt outputs:** Ranked list of trend signals with velocity scores, cluster context, horizon
- **Status:** [x] — Script written, awaiting ANTHROPIC_API_KEY to run

### 7. Reddit Insight Extraction Prompt Chain
- **File:** `src/intelligence/reddit_insights.py`
- **What:** Read reddit_posts from BigQuery → send batches to Claude API → extract emerging food concepts, consumer pain points, product whitespace signals, brand mentions, cross-subreddit spread → enrich trend_signals table with consumer voice context
- **Status:** [x] — Script written, awaiting ANTHROPIC_API_KEY + Reddit data to run

### 8. Prompt Optimization Pass
- **What:** Run `/prompt-optimize` on both prompt chains (trend detection and Reddit insight extraction). Iterate 3-5 times on each until output quality is consistent.
- **Status:** [ ] — Awaiting first Claude API run to evaluate output quality

### 9. Intelligence Tests
- **File:** `tests/test_intelligence.py`
- **What:** Validate prompt output structure — valid JSON, required fields present, scores within expected ranges, horizon is H1/H2/H3, no hallucinated data sources
- **Status:** [x] — 10 tests passing (output schema validation for both prompt chains)

---

## Week 3: Sizing & Scoring

### 10. Keyword Planner CSV Helper
- **File:** `src/ingestion/keyword_planner.py`
- **What:** Upload manual Google Keyword Planner CSV exports into keyword_volumes BigQuery table. Parse CSV format, validate columns, upsert into BQ.
- **Note:** Manual process in Month 1 — someone exports from the Keyword Planner UI and runs this script. Automate in Month 2.
- **Status:** [x] — Script written with intent classification (informational/recipe/purchase_intent)

### 11. Opportunity Sizing
- **File:** `src/scoring/sizing.py`
- **What:** Claude prompt chain that combines search volume data (keyword_volumes) + Circana context (circana_reference) + trend signal data → produces sized opportunity estimate with demand signals, market context, opportunity range, confidence level, analogous benchmark
- **Status:** [x] — Script written, awaiting ANTHROPIC_API_KEY to run

### 12. Portfolio Fit Scoring
- **File:** `src/scoring/portfolio_fit.py`
- **What:** Claude prompt chain that evaluates each sized opportunity across 5 dimensions (manufacturing adjacency, brand permission, channel readiness, competitive density, trend momentum) using brands.yaml context → composite priority score (weighted average) → writes to opportunity_scores table
- **Scoring weights defined in:** config/settings.yaml
- **Status:** [x] — Script written, awaiting ANTHROPIC_API_KEY to run

### 13. Pipeline Orchestrator
- **File:** `scripts/run_weekly_pipeline.py`
- **What:** End-to-end orchestrator that runs the full weekly pipeline in sequence: Google Trends ingest → Reddit ingest → Trend detection → Reddit insight extraction → Sizing → Scoring. Auto-skips steps with missing credentials.
- **Status:** [x] — Script written with --skip-reddit and --skip-claude flags

### 14. Scoring Tests
- **File:** `tests/test_scoring.py`
- **What:** Validate scoring output — all 5 dimensions present and 1-10, composite score calculated correctly per weights, opportunity sizing has required fields
- **Status:** [x] — 9 tests passing (score validation, weights, brand context)

---

## Week 4: Output & Dashboard

### 15. Weekly Radar Brief
- **File:** `src/briefs/weekly_radar.py`
- **What:** LLM generates a top-5 trend digest — for each signal: name, velocity score, horizon, key accelerating terms, competitive context. Output as formatted markdown saved to `output/briefs/`.
- **Audience:** Innovation, Marketing, Leadership
- **Status:** [x] — Live, generates polished markdown briefs from BQ data

### 16. Opportunity Brief
- **File:** `src/briefs/opportunity.py`
- **What:** LLM generates full opportunity scorecard — sizing data, 5-dimension scorecard, competitive landscape, product concepts, recommended action, suggested Tyson brand(s), key risks. Supports single trend or top-N batch generation.
- **Audience:** Innovation/R&D, Brand Directors
- **Status:** [x] — Live, tested with Protein-Enhanced Foods and Convenient Chicken Staples briefs

### 17. Next.js Dashboard (upgraded from Streamlit)
- **File:** `dashboard/` (Next.js + shadcn/ui + Recharts)
- **What:** Professional dashboard with:
  - **Trend Radar** scatter plot: X = search velocity, Y = Tyson fit, color = horizon (red H1, yellow H2, green H3)
  - **Signal list view:** sortable table with detail panel
  - **All Terms view:** full 80-term table with YoY growth, acceleration, velocity, direction
  - **Portfolio Fit Scorecard:** 5-dimension score bars with rationale
- **Status:** [x] — Live at localhost:3000, reads from BigQuery via API routes

### 18. End-to-End Run & Calibration
- **What:** Full pipeline ran end-to-end with real data. 11 E2E integration tests passing. Trend detection produced 5 signals, sizing and scoring produced opportunity scores, briefs generated successfully.
- **Status:** [x] — E2E tests in `tests/test_e2e.py` (11/11 passing)

---

## Post-Month 1 Backlog (Not in scope for 4 weeks)

- Automate Keyword Planner via Google Ads API
- Add TikTok data via Apify
- Add GDELT news monitoring (already in BigQuery)
- Add YouTube Data API
- Add OpenFoodFacts for competitor product tracking
- Add Amazon Movers & Shakers
- Integrate Yogi product review data
- Automated email distribution of weekly briefs
- Cloud Functions cron scheduling for production
- Predictive model (trend signals → retail sales velocity)
