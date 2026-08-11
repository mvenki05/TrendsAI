# TrendLens — Trend Intelligence System for Tyson Foods

## What This Is (current state, 2026-07-30)

TrendLens is a trend-intelligence app for Tyson Foods' innovation team. It ingests trend
reports (agency decks, Mintel PDFs, Tyson's internal monthly digests), harvests the open
internet, measures real consumer demand via Google Trends, and synthesizes everything into
navigable intelligence: extracted report taxonomies, a bottom-up trend map, a white-space
idea scout, combined cross-document insights, and — the capstone — the Megatrend Codex
(one deeply detailed, fully cited dossier per canonical megatrend).

> NOTE: This file previously described "TrendPulse" (pytrends/Reddit/Streamlit plan).
> That system was torn down. Anything referencing google_trends_weekly, reddit_posts,
> trend_signals, opportunity_scores, or Streamlit is legacy.

## Tech Stack

- **Language:** Python (3.10 on this machine — avoid 3.12+ syntax like nested same-quote f-strings)
- **Warehouse:** Google BigQuery — project `dev-2534-puw-growth-2295ed`, dataset `trend_intelligence` (ADC auth works locally)
- **LLM:** Claude Opus 4.8 via `src/common.py::complete_json` (direct Anthropic SDK)
- **Dashboard:** Next.js 16 + Tailwind in `dashboard/` → http://localhost:3000
- **Google Trends:** Playwright real-browser scraping (`src/trends_browser.py`) — works locally, no key needed

## CRITICAL CONSTRAINT — no local ANTHROPIC_API_KEY

This machine has **no Anthropic API key**, so any pipeline step calling `complete_json`
dies silently when spawned (upload pipeline, scout runs, map builds, synthesis).
The established workaround is the **"populate via session"** pattern (Claude Code session does the LLM work):

1. Run the non-LLM stages locally (text extraction, news harvest, Playwright measures).
2. Slice inputs into the session scratchpad; spawn parallel extraction agents, each given ONE
   shared instruction file and told to **Write its output JSON to the scratchpad itself**,
   replying only with a 1-line summary (keeps the main context small).
3. Wait for a file-count watcher (`until [ $(ls ...pattern | wc -l) -ge N ]; do sleep; done`
   as a background Bash), then a loader script writes rows to BigQuery **reusing the module's
   own row-builder functions** (e.g. `build_node_rows`, `_idea_row`).
4. Clustering/synthesis judgments are made in-session, written as JSON, loaded by script.

**GOTCHA:** `src/map_searches.py` and `src/pipeline.py` call `synthesize_megatrends.run()` at
the end; without a key the LLM clustering falls back to one-cluster-per-megatrend and
**silently clobbers `megatrend_clusters`**. After any local measure/pipeline run, re-apply the
session synthesis (keep existing cluster names stable — `discovered_nodes` and
`innovation_ideas` join on them).

## Dashboard Pages (all live)

| Route | Name | What it shows |
|---|---|---|
| `/` | Reports | Upload PDFs/PPTX; list of all extracted reports |
| `/report/[id]` | Report detail | One report's extracted taxonomy tree + Trends growth |
| `/discover` | Web Discovery | Per-megatrend web finds + US Market Radar, Trends-validated |
| `/ideas` | Innovation Ideas | Tyson product concepts with permission tiers + emerging recipes |
| `/best` | **Megatrend Codex** | THE capstone: tab buttons per canonical megatrend → full dossier (definition, strength scorecard, what's-happening-now, Now/Next/Later horizons with rationale, cited key stats, measured demand, merged subtrends, Tyson question bank / concepts / white space, bibliography). Every citation clickable: 📄 = original document via `/api/file/[id]`, ↗ = external website |
| `/lab` | White Space Scout | Internet-found product ideas, novelty-gated vs everything the system tracks, anchored to real `tyson_products` categories, Google-Trends-validated, + emerging subtrends board. NO Tyson brand names shown (user preference — brand stays in DB only) |
| `/map` | Trend Map | Our own bottom-up megatrend→subtrend→evidence map from world+US web harvest, deck-compared |
| `/mintel` | Mintel Intelligence | All Mintel-tagged reports as taxonomy trees (shared `source-intelligence.tsx` component) |
| `/tyson` | Tyson Bites — Combined Insights | Cross-document THEMES clustered from the monthly digests' insight cards (persistence × source corroboration), with survey stats + "How might Tyson…?" question bank |
| `/hartman` | Hartman Group Intelligence | Hartman occasion-research reports as taxonomy trees (shared `source-intelligence.tsx`) |
| `/methodology` | Methodology | Trust page: 6-step pipeline (ingest→extract→validate→corroborate→synthesize→cite) with live source/freshness stats from `/api/methodology` |

## BigQuery Tables (current)

- `reports` (+`source_tag`: deck-era null / 'mintel' / 'tyson'), `taxonomy_nodes`, `trend_searches`
- `megatrend_clusters` — cross-file synthesis (names must stay stable)
- `discovered_nodes`, `market_products`, `tyson_products` (~6.3k SKUs, 26 categories, FVAP=frozen value-added poultry), `tyson_matches`
- `innovation_ideas`, `web_recipes` (manually populated, /ideas page)
- `lab_signals`, `lab_ideas` (scout finds, run_id-stamped, demand-validated), `lab_subtrends`
- `trend_map_nodes` — our bottom-up map (taxonomy_nodes-shaped + geo/sources/overlap_deck)
- `insight_cards`, `insight_themes` — Tyson digest cards + cross-doc themes
- `codex_megatrends` — the Codex dossiers (key, name, rank, strength JSON, dossier JSON)

## Pipelines & Scripts

```bash
python scripts/setup_bigquery.py           # idempotent schema (add tables here)
python -m src.pipeline <file> [rid] [name] # upload chain: extract→synthesize→measure (LLM — session-populate locally)
python -m src.lab                          # White Space Scout (--harvest-only / --from-dump / --validate / --cluster)
python -m src.trend_map                    # Trend Map build (--harvest-only / --from-dump)
python -m src.map_searches <rid>           # Google Trends measures for one report (Playwright, works locally; see GOTCHA)
python scripts/ingest_downloads.py         # watch ~/Downloads, auto-POST new PDFs to /api/upload
python scripts/generate_megatrend_images.py # Codex hero images via LiteLLM/Nano Banana (.env LITELLM_*; static PNGs in dashboard/public/megatrends/; --only <key> --force to redo one)
cd dashboard && npm run dev                # dashboard (webpack forced; see dev-server notes)
pytest tests/ -v                           # tests (test_lab.py is the live suite)
```

Key modules: `src/extract_taxonomy.py` (report→taxonomy; `normalize_attributes` needs LLM — skip it
in session-populate), `src/synthesize_megatrends.py`, `src/discover_web.py`, `src/trend_math.py`
(series→classification incl. is_durable), `src/common.py` (BQ + LLM helpers).

## Codex refresh flow (after adding reports)

1. Edit `canon.json` clustering if needed (scratchpad pattern; see memory `megatrend-codex`)
2. Bundle-builder script → `bundle_<key>.json` per canonical (pretty-printed for sliced Reads)
3. One dossier agent per canonical with `dossier_instructions.md` → `dossier_<key>.json`
   — cites must carry `page` (PDF page number; extraction text has `[PAGE n]` markers, and
   `scripts/backfill_cite_pages.py` can fuzzy-backfill it). UI deep-links `/api/file/<rid>#page=N`.
4. Loader computes strength {classes, report_count, month_count, rising_terms} → `codex_megatrends`

## Source ingestion (Mintel etc.)

User has a Mintel portal login (clients.mintel.com). Claude-in-Chrome is **blocked by Tyson IT**
on that domain — don't retry. Flow: user downloads PDFs manually → watcher (or drop into an
`uploads/<source>/` folder) → register via `/api/upload` (assigns rep_id, saves canonical copy
`uploads/<rid>.pdf` — do NOT also copy files there) → session-extract → tag
`reports.source_tag` → pages pick it up. New tagged source = add to allowlist in
`dashboard/src/app/api/source/[tag]/route.ts` + thin page wrapping `source-intelligence.tsx`.

## Dev server (OneDrive pain)

The repo lives in OneDrive; Next dev crashes periodically ("Jest worker encountered N child
process exceptions", EBUSY, stale) even on webpack. **Recovery:** find PID via
`netstat -ano | grep :3000`, `taskkill //PID <pid> //T //F`, `rm -rf dashboard/.next`,
`npm run dev`. Background-task "killed" notifications for the dev server usually mean only the
session's tracking died — curl port 3000 before assuming it's down.

## Development Rules

- Config over code (`config/settings.yaml`, `config/brands.yaml` = Tyson portfolio for prompts)
- Prompts as module-level constants; type hints; `logging` not print
- BigQuery: parameterize DATA values; interpolating project/dataset/table refs is the accepted pattern
- Idempotent writes: load jobs via `src.common.load_json_rows` (append or replace), DELETE+insert keyed on ids
- Tests for pure logic only (no BQ/LLM/network) — see `tests/test_lab.py`
- UI voice: on /lab never headline Tyson brand names; idea first, Tyson angle as footer
- Every synthesized claim must be citable: report_id (internal, served via `/api/file/[id]`) or URL (external)

## Memory

Detailed histories live in the session memory directory (auto-indexed in MEMORY.md):
`megatrend-codex`, `whitespace-scout`, `trend-map`, `mintel-ingestion`, `dashboard-dev-server`,
`anthropic-key-situation`, `feedback-idea-quality`. Read them before rebuilding anything.
