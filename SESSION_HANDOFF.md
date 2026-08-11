# TrendLens — Session Handoff Document

> Read this at the start of every new Claude Code session. It tells you what the app is, what has been built, what decisions were made, and what to do next.

---

## What This App Is

**TrendLens** is a food innovation intelligence dashboard for Tyson Foods. It does two things:

1. **Reads uploaded PPTX/PDF decks** containing megatrend taxonomies, extracts the structure (Megatrend → Subtrend → Products / Ingredients / Behaviours), measures real Google Trends growth for each item, and surfaces rising signals.
2. **Shows the innovation team** three views of what those trends mean:
   - **Web Discovery** (`/discover`) — what the open web is surfacing about each megatrend, including a "Global Innovations" section with genuinely novel product concepts from around the world
   - **Innovation Ideas** (`/ideas`) — specific product concepts for Tyson brands, grounded in real SKU adjacency from the Salsify catalog
   - **Market Scan** (`/market`) — which rising ingredients are already in market products, linked to Tyson's position

**The app runs at `http://localhost:3000`.**

To start the dev server:
```
cd "C:\Users\mandapative\OneDrive - Tyson Online\General - Marketing Analytics Enterprise Reporting\13. AI Agent\Rohit\TrendsAgent\dashboard"
npm run dev
```
(Uses `--webpack` flag in package.json — do NOT use Turbopack, it crashes on OneDrive.)

---

## The Session-as-AI Pattern (CRITICAL)

**There is no Anthropic API key in the environment.** The app's Python scripts that call Claude (`src/common.py:complete_json()`) will fail with an auth error if run directly.

**How we work around this:** The Claude Code session IS the AI. Instead of running Python scripts, we:
1. Do the reasoning/research/extraction directly in this session
2. Write results to BigQuery via MCP tools (`mcp__claude_ai_Google_Cloud_BigQuery__execute_sql`)
3. The dashboard reads from BigQuery and displays the results

This is intentional and works well. Never try to run `src/discover_web.py` or `src/pipeline.py` directly — they need a key.

**BigQuery MCP tools available:**
- `mcp__claude_ai_Google_Cloud_BigQuery__execute_sql` — read/write
- `mcp__claude_ai_Google_Cloud_BigQuery__execute_sql_readonly` — read only

**BigQuery project:** `dev-2534-puw-growth-2295ed`  
**Dataset:** `trend_intelligence`

---

## The 6 Megatrends (from the FoP deck)

The app is structured around these 6 Future of Protein megatrends (extracted from the uploaded PPTX deck):

1. **Ubiquity of Protein & GLP-1 Nutrition**
2. **Food Fusion & Global Flavors**
3. **Brand Scrutiny & Clean Label**
4. **Data-Enabled Food Choices**
5. **Easy Eats**
6. **Functional Drinks**
7. **Bifurcated Budgets**
8. **Alcohol Flavors**

(Note: In BigQuery `discovered_nodes`, megatrend names must match EXACTLY — e.g. "Ubiquity of Protein & GLP-1 Nutrition" not "Protein & GLP-1".)

---

## BigQuery Tables and Current State

| Table | What it contains | Current state |
|---|---|---|
| `discovered_nodes` | Web-discovered items per megatrend — subtrends, products, ingredients, behaviours, psychographics, innovations, and US products | ~240 rows. `level='innovation'` = 40 global novel concepts (5 per megatrend). `level='us_product'` = 34 new-in-US-retail products (see US Market Radar below) |
| `innovation_ideas` | Tyson-specific product concepts with brand fit, permission tier, validation | 22 concepts across 6 megatrends (not Alcohol or Data — Tyson doesn't play there) |
| `web_recipes` | Emerging recipes from web discovery | Populated |
| `taxonomy_nodes` | Tree of nodes extracted from uploaded decks | Populated from FoP deck |
| `trend_searches` | Google Trends growth data per search term | Partially populated (throttling issues) |
| `megatrend_clusters` | Cross-file synthesis ranking | Populated |
| `market_products` | Open Food Facts products for rising ingredients | 39 ingredients scanned, 19 with products |
| `tyson_matches` | Gemini-matched Tyson products per ingredient | Populated |

---

## Key Pages and What They Show

### `/discover` — Web Discovery
- **Leads with the 🇺🇸 US Market Radar** (added 2026-07-17): 34 real new-in-US-retail products (2024–2026 launches with traction), organized in 5 occasion accordions — Protein (7), Snacking (5), Lunch (7), Breakfast (7), Dinner (8)
  - Rose-bordered `UsProductCard`s with: violet ◈ megatrend badge (`mapped_megatrend` column), description with traction story, amber **"Tyson gap"** callout grounded in the real `tyson_products_enriched` catalog (6,200 SKUs), source link pills
- Below it, **Megatrend Discoveries** — items grouped by megatrend, each accordion has:
  - **Rising** section (items with is_rising=true)
  - **Global Innovations** section (level='innovation') — violet cards
  - All discoveries grouped by type
- "Discover from web" button calls `POST /api/discover/run` which tries to run `src/discover_web.py` — this won't work without a key. We populate everything manually via BigQuery.

### `/ideas` — Innovation Ideas
- Shows Tyson-specific product concepts
- Badge system: **Core/Adjacent/Stretch** = permission to play tier; **Strong/Moderate/Early** = validation strength
- Legend explaining badges was added to the page
- Data comes from `innovation_ideas` table (manually populated)

### `/market` — Market Scan
- Shows rising ingredients already in market products via Open Food Facts
- Links to Tyson products via Gemini matching (from `tyson_matches` table)

---

## Global Innovations — What We Built and Why

### The Problem We Solved
The original Global Innovations used the megatrend definition text as the search query → found products that confirmed the trend → circular, read like research papers. Not useful for an innovation team.

### The New Approach (as of 2026-07-15)
Search first from unexpected angles, map to trends after:
- International market launches (Japan, Korea, Singapore, EU) not yet in the US
- Crowdfunding (Kickstarter/Indiegogo) food products
- SIAL Paris, Fancy Food Show, SupplySide West award winners
- Unusual format combinations that cross categories

### Current Global Innovations (40 total, 5 per megatrend)

**Protein:** Parima cultivated duck (Singapore-approved), Fermotein mycoprotein (new fungal species), Rubi duckweed RuBisCO protein (egg white replacer), EDIBLE SILK peptides (Japan), snEco crunchy cheese (SIAL 2024 Grand Prix)

**Food Fusion:** Jongga Kimchi Spread (SIAL 2024 winner), Hey Champ miso candy bar, Figa cupuacu bar (no cocoa), McCormick Aji Amarillo (Flavor of Year 2025), Tkemali Georgian plum sauce

**Clean Label:** Babylife Organics per-batch heavy metal ppb QR codes, Grass Roots open margin formula, HoneyTrace blockchain, CleanScan live lab results, Gentle Farming cost-plus-10% transparency

**Data-Enabled:** Bioniq blood-test custom granules ($150M Herbalife acquisition), Nourished 3D-printed gummies, Korea pharmacist-mixed supplements, Elo Health biomarker sachets, Signos FDA-cleared CGM food guidance

**Easy Eats:** MIT microneedle produce patches (doubles shelf life), Nori Project hot meal vending machine, Nestle Maggi edible wheat fork, 7-Eleven Japan nitrogen-sealed onigiri, Loliware seaweed straws (dissolve in seawater)

**Functional Drinks:** ARMRA colostrum soda, BB LAB collagen jelly squeeze stick (Korea), Sapinca Andean root elixir (SIAL 2024), Wellbeing Nutrition sublingual melts (no drink needed), Happy Aging liposomal NAD+ shots

**Bifurcated Budgets:** Be Truffle pantry condiments (£2.50 truffle ketchup), B-SIDES upcycled crunch puffs, Walmart Bettergoods truffle pizza ($6.50, viral), KoRo live commodity price graphs, THIC beer-waste chocolate (ex-Noma, in Danish 7-Eleven)

**Alcohol Flavors:** Mitica Negroni blue cheese (soaked in actual Negroni), Fossa umeshu sake chocolate, Tenneyson Black Ginger zero-proof amaro spirit, Aplos Chili Margarita (non-alc with adaptogens), Empirical Tasty Paste (distillery making fermented miso)

---

## US Market Radar — What We Built and Why (added 2026-07-17)

### The Idea
The Global Innovations were mostly ingredient-stage concepts (silkworm protein etc). The user wanted **real, famous, NEW products in the US market** organized by the eating-occasion universe: **Protein, Snacking, Lunch, Breakfast, Dinner** — compared against what Tyson actually sells.

### How It Was Done
1. Queried `tyson_products_enriched` (6,200 real SKUs with category/segment/brand) to build a per-occasion summary of what Tyson makes
2. Launched **5 parallel agents** (one per occasion), each web-searching for US retail products launched/scaled 2024–2026 with real traction (sales numbers, funding, retailer expansion). Search angles: Expo West winners, TikTok viral grocery, Costco Reddit finds, trade press launches. NOT Tyson brands.
3. Each agent got the Tyson catalog summary so its "gap" statement is grounded in real SKU counts (e.g. "550 lunchmeat SKUs but zero kids lunch kits")
4. Deduped cross-category (David→Protein, Wilde→Snacking, Good Culture→Protein, Lunchly→Lunch, Factor→Dinner), wrote 34 rows to `discovered_nodes` with `level='us_product'`, `megatrend`=occasion name
5. Added `mapped_megatrend` column (ALTER TABLE) and mapped every product to one of the 8 megatrends. Distribution: Protein & GLP-1 = 15, Easy Eats = 10, Food Fusion = 4, Clean Label = 2, Functional Drinks / Bifurcated / Alcohol = 1 each, Data-Enabled = 0

### Schema for us_product rows
- `megatrend` = occasion ("Protein" / "Snacking" / "Lunch" / "Breakfast" / "Dinner")
- `mapped_megatrend` = one of the 8 megatrend names
- `description` = what it is + where sold + traction story
- `relation` = the Tyson gap (rendered as amber "Tyson gap:" callout)
- `discovery_id` pattern: `usp_<occasion>_NNN`

### Headline products (34 total)
**Protein:** David bar ($131M yr 1), Chomps Chicken Sticks, Good Culture cottage cheese ($500M deal), Brami lupini pasta, Slate shakes, Khloud popcorn, Archer mini sticks
**Snacking:** Chomps beef/turkey (~$500M rev), WILDE chicken chips, RITZ Hot Honey, Bibigo mini wontons, Sonoma cheese crisps
**Lunch:** Lunchly (MrBeast), Uncrustables High-Protein ($1B brand), Busseto mini charcuterie, Fiorucci panino, Egglife wraps, Farmers Fridge vending, True Story clean-label deli
**Breakfast:** Eggo Protein, Premier Protein waffles, Oats Overnight ($100M+), MUSH, Cheerios Protein, Magic Spoon, Chobani 30g drinks
**Dinner:** The Sausage Project (10x YoY at Walmart), GEN Korean BBQ, Factor at Target, Kevins stir-fry kits, Del Real birria, Banza wheat pasta, Stouffers air-fryer meals, Jack Daniels sausages

### How to Update US Market Radar
Same pattern as innovations: `DELETE ... WHERE level = 'us_product'` then INSERT (no apostrophes in SQL strings!). Update `mapped_megatrend` via UPDATE with CASE on discovery_id.

---

### How to Update Global Innovations
To replace or add innovation rows:
```sql
-- Delete existing
DELETE FROM `dev-2534-puw-growth-2295ed.trend_intelligence.discovered_nodes` WHERE level = 'innovation'

-- Insert new (5 rows per megatrend)
INSERT INTO `dev-2534-puw-growth-2295ed.trend_intelligence.discovered_nodes`
(discovery_id, megatrend, level, name, support, sources, in_deck, description, relation, discovered_at)
VALUES ('inno_xxx_001', 'Megatrend Name Exact', 'innovation', 'Product Name', 2,
  '[{"url":"...","source":"..."}]', FALSE, 'One punchy sentence what it is.',
  'One sentence why a US food person would be surprised.', CURRENT_TIMESTAMP())
```
**IMPORTANT:** No apostrophes in SQL strings (BigQuery rejects them). Rephrase to avoid contractions.

---

## Key Files

| File | What it does |
|---|---|
| `dashboard/src/app/discover/page.tsx` | Web Discovery page — includes `InnovationCard` component (violet, level='innovation') |
| `dashboard/src/app/ideas/page.tsx` | Innovation Ideas page — badge legend added below stat tiles |
| `dashboard/src/app/api/discover/route.ts` | Reads all `discovered_nodes` from BigQuery including level field |
| `dashboard/src/app/api/ideas/route.ts` | Reads `innovation_ideas` and `web_recipes` tables |
| `src/discover_web.py` | Python script that would run web discovery (needs Anthropic key — not usable directly) |
| `src/common.py` | Anthropic SDK wrapper — needs `ANTHROPIC_API_KEY` to work |
| `config/settings.yaml` | BigQuery project/dataset config, model name |
| `scripts/setup_bigquery.py` | Creates BigQuery tables (run once) |

---

## Design Decisions Made

- **InnovationCard (violet)** uses the same visual grammar as IdeaCard — short punchy description, one-liner "why novel" in relation field. NOT research-paper paragraphs.
- **Innovation Ideas page** shows Tyson-specific ideas. Alcohol Flavors and Data-Enabled Food Choices are intentionally excluded (Tyson makes protein, not spirits/apps).
- **Global Innovations** are found by searching international markets/crowdfunding/trade shows FIRST, then mapped to megatrends — not the other way around.
- **Dev server** always uses `npm run dev` (which maps to `next dev --webpack` via cross-env) — never `next dev` or `next dev --turbopack` (crashes on OneDrive paths).
- **Dev server survives sessions** by launching DETACHED, not as a Claude Code background task (those get killed on session events): `Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d <dashboard path> && npm run dev" -WindowStyle Minimized`. If port 3000 is stuck, kill node first: `Get-Process -Name node | Stop-Process -Force`.
- **Google Trends** data is throttled — measure on demand, cache aggressively, never attempt bulk re-measurement.

---

## What To Do in a New Session

1. Start dev server: `cd dashboard && npm run dev`
2. Check app at `http://localhost:3000`
3. If user wants to update Global Innovations — launch parallel agents searching international/crowdfunding/trade show angles (not megatrend definitions), then write results to BigQuery
4. If user wants new Innovation Ideas — write directly to `innovation_ideas` table in BigQuery
5. Never try to run Python AI scripts directly — do the reasoning in-session, write to BigQuery via MCP

---

*Last updated: 2026-07-17. Session work: built the US Market Radar on /discover — 34 real new-in-US-retail products (2024–2026) across 5 eating occasions, each with a Tyson gap grounded in the 6,200-SKU catalog and a mapped megatrend badge. Also confirmed `trend_searches` table is EMPTY (0 rows — Google Trends was never measured; charts blocked until populated in-session).*
