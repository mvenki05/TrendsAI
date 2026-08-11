# Tyson Foods — Innovation Trend Intelligence System

## Project Codename: TrendPulse

---

## Executive Summary

Tyson Foods needs an always-on intelligence system that identifies emerging food trends across the United States — from consumer dietary shifts and flavor profile adoption to new product formats and cultural food movements — and translates those signals into sized, scored, and prioritized innovation opportunities mapped to Tyson's brand portfolio and manufacturing capabilities.

This document outlines the full strategic vision, the data architecture, and a focused 1-month execution plan to deliver a working system using free and near-free data sources, Google BigQuery as the data warehouse, and Claude AI as the intelligence and synthesis layer.

The system will answer one fundamental question for Tyson's innovation, marketing, R&D, and leadership teams: **"What should we build next, how big is the opportunity, and how fast do we need to move?"**

---

## Part 1: Strategic Context & Vision

### Why This Matters Now

Consumer food trends in the US are accelerating faster than traditional CPG innovation cycles can respond. Trends like GLP-1/Ozempic-friendly products, the mainstreaming of Indian and Hispanic flavors, air fryer-optimized formats, and high-protein positioning have moved from niche signals to billion-dollar categories in 18-24 months. Companies that detected these signals early captured outsized share. Companies that relied on annual trend reports and syndicated data alone arrived late to shelves already crowded with competitors.

The gap Tyson faces is not a lack of innovation capability — it's a lack of a systematic, continuous mechanism to detect what's emerging, quantify how big it is, and assess how well it fits Tyson's existing platforms before competitors move.

### The Trend Pipeline: How Food Trends Mature

Consumer food trends follow a predictable pipeline from inception to mass adoption. Each stage leaves detectable signals in different data sources:

| Stage | Timeline | Signal Sources | Example |
|---|---|---|---|
| **Academic Research & Patents** | 3-5 years before mass adoption | PubMed, Google Scholar, USPTO patent filings | Precision fermentation protein research |
| **Food Tech Startups & Investment** | 2-3 years out | Crunchbase, VC funding announcements | Cluster of startups funded in functional mushrooms |
| **Restaurant & Chef Innovation** | 12-18 months out | Yelp, restaurant menus, food media | Birria appearing on non-Mexican restaurant menus |
| **Food Media & Influencer Adoption** | 6-12 months out | Trade publications, food blogs, YouTube | Food media covering "the cottage cheese trend" |
| **Social Media Virality** | 0-6 months out | TikTok, Reddit, Instagram | #CottageCheese recipes going viral on TikTok |
| **Consumer Search & Purchase** | Happening now | Google Trends, Amazon sales, retail POS | Google searches for "cottage cheese ice cream" spiking |
| **Mass Retail Adoption** | You're late | Circana/NIQ syndicated data showing growth | Multiple brands on shelf, category established |

**The goal of this system is to detect signals at every stage of this pipeline so Tyson can act at the optimal moment — early enough to lead, late enough to have market validation.**

### The Full Vision: What "Great" Looks Like

At full maturity, the Innovation Trend Intelligence System would:

1. **Continuously monitor 15+ data sources** spanning news, social media, consumer search behavior, product reviews, restaurant menus, academic research, patent filings, competitor earnings calls, and regulatory developments.

2. **Automatically detect emerging trends** using acceleration algorithms (identifying not just growth, but the *rate of change* of growth) and cross-source correlation (a signal appearing in multiple unrelated sources simultaneously).

3. **Classify trends by horizon** — Horizon 1 (act within 6 months), Horizon 2 (emerging, 6-18 month window), Horizon 3 (long-range bets, 2-5 years) — based on which stages of the trend pipeline are showing signals.

4. **Size every opportunity** — attaching consumer demand volume (search data), market dollar value (syndicated data), and growth trajectory to each detected trend.

5. **Score opportunities against Tyson's portfolio** — evaluating manufacturing adjacency, brand permission, channel readiness, and competitive density for each trend relative to Tyson's specific brands and capabilities.

6. **Generate automated intelligence briefs** — weekly trend radar updates, monthly opportunity deep-dives, and quarterly innovation priority reports — written in narrative format by Claude AI and distributed directly to cross-functional stakeholders.

7. **Serve a cross-functional audience** — Innovation/R&D uses it for pipeline planning. Marketing uses it for positioning and messaging. Sales uses it for retailer conversations. Leadership uses it for portfolio strategy.

---

## Part 2: The Complete Data Source Landscape

This section documents every data source evaluated for the system, organized by function. The 1-month focused plan (Part 3) uses a prioritized subset of these. The rest can be added incrementally.

### 2.1 Consumer Demand & Search Intelligence

| Source | What It Provides | Cost | Activation Speed |
|---|---|---|---|
| **Google Trends (pytrends)** | Relative search interest over time for any term, comparable across terms, geographic breakdown, related queries | Free | Instant (Python library) |
| **Google Keyword Planner** | Actual monthly search volumes and competition data for any keyword | Free (via Google Ads account) | Same day |
| **SerpAPI** | Programmatic Google Search results, Google Trends, Google Shopping, "People Also Ask" data | $100-300/month | Same day (API key) |
| **Amazon search volume (Helium 10 free tier)** | Estimated monthly search volumes for product keywords on Amazon (purchase-intent signals) | Free tier available | Same day |

### 2.2 Social Media & Consumer Voice

| Source | What It Provides | Cost | Activation Speed |
|---|---|---|---|
| **Reddit (PRAW)** | Full access to posts, comments, upvotes across all subreddits. Richest unfiltered consumer opinion source | Free | 10-minute setup |
| **Apify (TikTok/Instagram/Facebook scrapers)** | Pre-built scrapers for TikTok videos, Instagram posts, Facebook pages. Video metadata, captions, hashtags, engagement | Free tier; paid ~$300-500/month | Same day |
| **SocialData.tools** | Full-archive X/Twitter search, real-time streaming, user profiles, engagement metrics | ~$200-500/month | Same day (API key) |
| **YouTube Data API** | Video search, metadata, descriptions, comments, channel info, view counts | Free (10K units/day via Google Cloud) | Same day |

### 2.3 News & Media Coverage

| Source | What It Provides | Cost | Activation Speed |
|---|---|---|---|
| **GDELT (via BigQuery)** | Global news monitoring — 300K+ sources, tone scoring, geographic context, themes, updated every 15 minutes. Already in BigQuery. | Free (BigQuery compute only) | Instant |
| **NewsCatcher API** | 60K+ news sources, full article text, sentiment, deduplication. Better article text than GDELT | ~$500-1,000/month | Same day |
| **Newswhip Spike API** | Predictive virality — flags articles gaining unusual traction before they go viral | ~$1,000-2,000/month | Same day |
| **Trade publication RSS feeds** | FoodNavigator-USA, Food Business News, Food Dive, The Spoon, Progressive Grocer, Nation's Restaurant News | Free | Same day |

### 2.4 Product & Competitive Intelligence

| Source | What It Provides | Cost | Activation Speed |
|---|---|---|---|
| **Yogi (already have)** | Product review aggregation across Amazon, Walmart, Target — attribute-level sentiment by SKU | Existing contract | Already active |
| **Circana/NIQ (already have)** | Syndicated retail sales data — category size, growth rates, brand share, retailer-level performance | Existing contract | Already active |
| **OpenFoodFacts API** | Open-source product database — ingredients, nutrition labels, claims for products worldwide. Track new product launches and ingredient trends | Free | Same day |
| **Amazon Best Sellers / Movers & Shakers** | Daily sales rank changes in Grocery & Gourmet Food — real-time demand signals for products | Free (scraping) | Same day |

### 2.5 Restaurant & Foodservice Signals

| Source | What It Provides | Cost | Activation Speed |
|---|---|---|---|
| **Yelp Fusion API** | Restaurant search, menu items, reviews by cuisine and geography. Tracks restaurant-to-retail trend pipeline | Free tier (5K calls/day) | Same day |
| **Delivery platform public data** | Menu descriptors and trending items from Grubhub, DoorDash, UberEats | Free (scraping public listings) | 1-2 weeks to build |

### 2.6 Long-Range & Strategic Signals

| Source | What It Provides | Cost | Activation Speed |
|---|---|---|---|
| **USPTO PatentsView API** | Competitor patent filings — reveals R&D strategy 3-5 years ahead | Free | Same day |
| **SEC EDGAR** | Competitor 10-K filings, earnings transcripts — explicit innovation strategy and R&D investment discussion | Free | Same day |
| **PubMed (Entrez API)** | Academic food science research — emerging ingredients, health claims, formulation science | Free | Same day |
| **Google Scholar** | Broader academic research including nutrition, food technology, consumer behavior studies | Free (via SerpAPI or scholarly library) | Same day |
| **Crunchbase free tier** | Food tech startup funding rounds — where VC money flows indicates future category maturity | Free tier available | Same day |
| **USDA ERS** | Macro food consumption data, protein trends, expenditure by category, demographic breakdowns | Free | Downloadable |
| **USDA/FDA regulatory feeds** | Proposed rules, GRAS notices, labeling guidance — signals what will be permitted in 2-5 years | Free | Same day |
| **Census/ACS data** | Demographic trends — population growth by ethnicity, income, geography for demographic-driven trends | Free | Downloadable |

### 2.7 Enterprise Vendor Platforms (Future Consideration)

| Platform | What It Adds Beyond DIY | Estimated Cost | Best For |
|---|---|---|---|
| **Brandwatch** | TikTok/Instagram monitoring via commercial data agreements, image/logo detection in visual content, historical social archive, podcast transcript monitoring, influence scoring | $150-250K/year | Full social + media monitoring |
| **Pathmatics/Vivvix** | Competitor advertising spend tracking — creative, placement, budget estimates | Varies | Competitive ad intelligence |
| **Zignal Labs** | Narrative and misinformation tracking — how stories form, spread, mutate across platforms | Enterprise pricing | Crisis and narrative management |
| **Diffbot** | Clean structured content extraction from any URL — full article text for LLM analysis | Varies | Deep article analysis |

---

## Part 3: The Focused 1-Month Execution Plan

### Design Philosophy

Out of the 25+ data sources evaluated, **four sources deliver approximately 80% of the innovation intelligence value**. The 1-month plan focuses exclusively on these four, building a complete end-to-end system from data ingestion through sized opportunity briefs. Everything else can be layered in after the core system is operational.

### The Core Four Data Sources

**1. Google Trends (pytrends)** — The early warning system and demand quantifier.

- Tells you what millions of Americans are actively searching for, with historical time-series going back 5+ years.
- Detects trend acceleration — not just what's popular, but what's *getting popular faster*.
- Would have flagged every major food trend of the last 3 years (GLP-1, cottage cheese, birria, air fryer cooking, high-protein everything) months before mainstream awareness.
- Free, no API key, instant programmatic access via Python.

**2. Reddit (PRAW)** — The consumer insight engine.

- Google Trends tells you *what* people want. Reddit tells you *why*.
- Unfiltered, detailed consumer opinions — not 280 characters but full paragraphs explaining preferences, frustrations, and unmet needs.
- Cross-subreddit spread is a powerful signal: when a food concept appears simultaneously in r/Cooking, r/MealPrepSunday, r/airfryer, and r/Costco, that's a mainstream breakout.
- Free, 10-minute setup, richest qualitative consumer signal source available.

**3. Google Keyword Planner** — The sizing engine.

- Converts Google Trends' relative index into actual monthly search volumes.
- "Trending up" is a slide. "450,000 monthly searches growing at 35% YoY" is an innovation business case.
- Enables dollar-adjacent sizing: search volume × conversion assumptions = estimated demand.
- Free via Google Ads account, same-day access.

**4. Circana/NIQ (existing)** — The market validation engine.

- Converts trend signals into actual retail dollar values — category size, growth rates, brand share.
- When the system flags a trend from sources 1-3, Circana confirms how big it actually is today and who's capturing it.
- Already available to Tyson — no incremental cost or setup.

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DATA INGESTION LAYER                     │
│                                                              │
│  Google Trends    Reddit (PRAW)    Google Keyword Planner    │
│  (pytrends)       15-20 subs       Monthly volumes           │
│  300+ terms       Weekly pulls      For flagged terms         │
│  Weekly refresh   Top posts                                  │
│                                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    GOOGLE BIGQUERY                            │
│                  (Unified Data Warehouse)                     │
│                                                              │
│  Tables:                                                     │
│  ├── google_trends_weekly    (term, date, interest, geo)     │
│  ├── google_trends_derived   (term, yoy_growth, accel,       │
│  │                            cluster, velocity_score)        │
│  ├── reddit_posts            (subreddit, title, body,        │
│  │                            score, comments, date)          │
│  ├── keyword_volumes         (term, monthly_vol, competition, │
│  │                            yoy_change)                     │
│  ├── trend_signals           (trend_id, name, horizon,       │
│  │                            signal_strength, sources)       │
│  ├── opportunity_scores      (trend_id, market_size,         │
│  │                            tyson_fit, priority_score)      │
│  └── circana_reference       (category, segment, dollars,    │
│                               growth_rate, brand_share)       │
│                                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              CLAUDE AI INTELLIGENCE LAYER                     │
│                                                              │
│  Module 1: Trend Detection Engine                            │
│  ├── Acceleration flagging (rate-of-change analysis)         │
│  ├── Cross-cluster correlation (related trends grouping)     │
│  └── Anomaly detection (unusual spikes or pattern shifts)    │
│                                                              │
│  Module 2: Reddit Insight Extraction                         │
│  ├── Emerging food concept identification                    │
│  ├── Consumer pain point and unmet need extraction           │
│  ├── Product whitespace signals                              │
│  ├── Brand mention and sentiment analysis                    │
│  └── Cross-subreddit spread detection                        │
│                                                              │
│  Module 3: Opportunity Sizing                                │
│  ├── Search volume quantification (Keyword Planner)          │
│  ├── Market dollar attachment (Circana integration)          │
│  ├── Growth trajectory projection                            │
│  └── Addressable market estimation                           │
│                                                              │
│  Module 4: Tyson Portfolio Scoring                           │
│  ├── Manufacturing adjacency assessment                      │
│  ├── Brand permission evaluation                             │
│  ├── Channel readiness scoring                               │
│  ├── Competitive density analysis                            │
│  └── Composite priority score                                │
│                                                              │
│  Module 5: Narrative Synthesis & Brief Generation            │
│  ├── Weekly Trend Radar summaries                            │
│  ├── Monthly Opportunity Deep-Dives                          │
│  ├── Quarterly Innovation Priority Reports                   │
│  └── Ad-hoc trend investigation briefs                       │
│                                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    OUTPUT & DISTRIBUTION                      │
│                                                              │
│  ┌─────────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │  Trend Radar    │  │  Opportunity   │  │   Weekly     │ │
│  │  Dashboard      │  │  Briefs        │  │   Digest     │ │
│  │  (Next.js app)  │  │  (PDF/Email)   │  │   (Email)    │ │
│  └─────────────────┘  └────────────────┘  └──────────────┘ │
│                                                              │
│  Audiences:                                                  │
│  • Innovation / R&D → Opportunity briefs, ingredient trends  │
│  • Marketing → Consumer sentiment, positioning signals       │
│  • Sales → Retailer-relevant trends, competitive intel       │
│  • Leadership → Portfolio-level radar, quarterly priorities   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Keyword Universe Design

The system tracks 200-300 food-related terms organized into strategic clusters. Each cluster maps to a type of innovation opportunity:

**Cluster 1: Protein Trends** (directly relevant to Tyson's core)
- high protein snack, high protein breakfast, high protein frozen meal, high protein pasta, protein ice cream, protein coffee, protein bowl, protein bar, protein chips, protein pancakes, protein shake meal replacement, 30g protein meal, 40g protein meal, protein per calorie, protein forward

**Cluster 2: Dietary & Health Movements**
- GLP-1 diet, ozempic friendly food, semaglutide diet, high protein low calorie, wegovy meal plan, keto meal, Mediterranean diet meal prep, carnivore diet, whole30, paleo frozen meal, anti-inflammatory diet, gut health food, prebiotic food, probiotic snack, low sodium meals, heart healthy frozen

**Cluster 3: Global Flavor Profiles**
- tikka masala, tandoori chicken, butter chicken, garam masala, birria, al pastor, elote, street corn, tajin seasoning, gochujang, kimchi, bulgogi, Nashville hot, chipotle seasoning, everything bagel seasoning, chili crisp, harissa, za'atar, jerk seasoning, miso, teriyaki

**Cluster 4: Cooking Formats & Methods**
- air fryer recipes, air fryer chicken, air fryer frozen food, slow cooker meals, sheet pan dinner, one pot meal, smoker recipes, sous vide, instant pot meals, meal prep containers, lunch box ideas, microwave meals, no cook meals, 15 minute dinner

**Cluster 5: Occasions & Dayparts**
- breakfast sandwich, breakfast burrito, protein breakfast, grab and go breakfast, lunchbox ideas adults, snack plate, charcuterie snack, after school snack, late night snack, game day food, grilling season, tailgate food, camping meals, road trip snacks

**Cluster 6: Product Formats**
- frozen breakfast sandwich, frozen burrito, chicken nuggets, chicken strips, chicken tenders, hot dogs, sausage links, deli meat, lunch meat, frozen bowls, protein bowl frozen, snack bites, mini meals, single serve frozen, family size frozen meal

**Cluster 7: Values & Attributes**
- clean label food, no artificial ingredients, organic frozen meals, antibiotic free chicken, free range, hormone free, sustainable packaging, recyclable food packaging, plant based protein, flexitarian, reduced sodium, low sugar high protein, whole grain

**Cluster 8: Retail & Channel Signals**
- Costco food finds, Walmart groceries, Target frozen food, Aldi finds, Trader Joe's new, Sam's Club food, grocery deals, frozen food sale, best frozen meals, frozen food aisle

**Cluster 9: Emerging & Experimental**
- cottage cheese recipe, bone broth, collagen food, mushroom coffee, adaptogen, nootropic food, functional food, fermented food, pickled, smoked, charred, crispy, loaded, stuffed, everything flavor

**Cluster 10: Competitor & Category Terms**
- Tyson chicken, Jimmy Dean breakfast, Ball Park franks, Hillshire Farm, Perdue chicken, Hormel, Oscar Mayer, Banquet frozen, Stouffer's, Marie Callender's, Amy's frozen, Healthy Choice, Lean Cuisine, El Monterey

### Tracked Reddit Subreddits

| Subreddit | Relevance | Members |
|---|---|---|
| r/Cooking | Mainstream cooking behavior, ingredient trends | 24M+ |
| r/food | General food culture, presentation trends | 23M+ |
| r/recipes | Recipe trends, format innovation | 4M+ |
| r/MealPrepSunday | Meal prep formats, convenience trends | 4M+ |
| r/EatCheapAndHealthy | Value + health intersection | 4M+ |
| r/airfryer | Air fryer cooking trends (massive for frozen protein) | 700K+ |
| r/grilling | Grilling culture, meat trends, flavor experimentation | 500K+ |
| r/smoking | BBQ/smoking trends, premium meat culture | 400K+ |
| r/ketorecipes | Keto-specific product demand | 2M+ |
| r/1200isplenty | Calorie-conscious eating, portion trends | 700K+ |
| r/GainIt | High-protein, muscle-building food demand | 500K+ |
| r/Volumeeating | High-volume low-calorie (GLP-1 adjacent) | 400K+ |
| r/Costco | Retail-specific product buzz, bulk buying trends | 500K+ |
| r/aldi | Value retail trends | 200K+ |
| r/traderjoes | Specialty/innovation-forward retail trends | 300K+ |
| r/frozenFood | Frozen food opinions and discoveries | 50K+ |
| r/spicy | Spice/heat trend tracking | 200K+ |
| r/BBQ | BBQ culture, meat preparation trends | 300K+ |
| r/Ozempic | GLP-1 consumer behavior and food needs | 200K+ |
| r/semaglutide | GLP-1 consumer behavior and food needs | 150K+ |

### Feature Specifications

#### Feature 1: Trend Detection Engine

**Purpose:** Automatically identify food trends that are accelerating — not just popular, but getting popular *faster*.

**How It Works:**

1. Weekly Google Trends data is pulled for all 200-300 tracked terms.
2. For each term, the system calculates:
   - **Current interest level** — the raw Google Trends index (0-100)
   - **Year-over-year growth** — comparing current 4-week average to same period last year
   - **Acceleration** — the rate of change of growth (is YoY growth itself increasing or decreasing?)
   - **Velocity score** — a composite metric: `(YoY growth × acceleration × current interest) / 1000`
3. The Claude AI layer reviews the weekly data and flags:
   - **Breakout signals** — terms with velocity score exceeding a threshold (calibrated over time)
   - **Cluster acceleration** — when multiple terms in the same cluster accelerate simultaneously (e.g., 5 Indian flavor terms all trending up = a macro trend, not a fluke)
   - **New entries** — terms that didn't previously register on Google Trends but now show measurable interest (very early signals)
   - **Declining trends** — terms that are decelerating, which is equally important for avoiding late entries

**Output:** A ranked list of trend signals with velocity scores, cluster context, and a preliminary horizon classification (H1/H2/H3).

**Example Output:**
```
TREND SIGNAL: GLP-1 Optimized Foods
Velocity Score: 94.2 (CRITICAL — top 1% of all tracked terms)
Horizon: H1 (Act within 6 months)
Key Terms Accelerating:
  • "ozempic friendly food"     — 85K searches/mo, +600% YoY, accelerating
  • "high protein low calorie"  — 290K searches/mo, +120% YoY, accelerating
  • "high protein frozen meals" — 110K searches/mo, +75% YoY, accelerating
  • "protein per serving"       — 40K searches/mo, +180% YoY, accelerating
Cluster Signal: 4 of 4 tracked GLP-1 terms accelerating simultaneously
Related Clusters Also Accelerating: Protein Trends (6/15 terms), 
  Values & Attributes (2/12 terms — "low sugar high protein", "clean label")
```

#### Feature 2: Reddit Consumer Insight Extraction

**Purpose:** Extract qualitative consumer intelligence from Reddit to add context, depth, and "why" to the quantitative trend signals from Google Trends.

**How It Works:**

1. Weekly pull of top 50 posts (by upvotes) from each tracked subreddit.
2. Claude AI processes each batch of posts and extracts:
   - **Emerging food concepts** — new ingredients, preparations, or combinations being discussed
   - **Consumer pain points** — frustrations with existing products ("I can't find a frozen meal with more than 20g protein")
   - **Product requests** — explicit or implicit wishes ("I wish someone would make...")
   - **Brand mentions** — positive and negative references to Tyson brands or competitors
   - **Whitespace signals** — gaps between what consumers want and what's available
   - **Cross-subreddit spread** — a concept appearing in 3+ unrelated subreddits in the same week

3. Each extracted insight is tagged with:
   - Relevant trend cluster(s)
   - Sentiment (positive/negative/neutral)
   - Confidence score (based on upvotes, comment volume, and specificity)
   - Relevant Tyson brand(s) if applicable

**Output:** A structured insight feed that enriches trend signals with consumer voice context.

**Example Output:**
```
INSIGHT: Unmet demand for high-protein, portion-controlled frozen meals
Source: r/Ozempic, r/semaglutide, r/1200isplenty (cross-subreddit spread detected)
Confidence: HIGH (avg 450 upvotes, 180 comments across 6 posts this week)
Linked Trend Signal: GLP-1 Optimized Foods

Key Consumer Quotes (paraphrased):
  • "Since starting Ozempic I can only eat small portions but I need to hit 
     30g protein minimum. Nothing in the frozen aisle is designed for this."
  • "Every frozen meal is either high protein AND 600+ calories, or low 
     calorie with only 12g protein. Where's the middle ground?"
  • "My dietitian says I need 100g+ protein daily in 3 small meals. 
     The frozen options are terrible for this."

Whitespace Identified: 
  High-protein (30g+), moderate-calorie (250-350 cal), small-portion 
  frozen meals. No major CPG brand currently owns this positioning.

Brand Mentions This Week:
  • Jimmy Dean: 12 mentions, mixed sentiment ("good protein but too many calories")
  • Healthy Choice: 8 mentions, negative ("not enough protein")
  • Lean Cuisine: 6 mentions, negative ("tiny portions but also tiny protein")
```

#### Feature 3: Opportunity Sizing Engine

**Purpose:** Attach quantitative demand estimates and market dollar values to every trend signal, converting directional insights into fundable innovation business cases.

**How It Works:**

Three-layer sizing approach:

**Layer A: Demand Sizing (Google Keyword Planner)**
- For every trend signal flagged by the Trend Detection Engine, pull actual monthly search volumes from Google Keyword Planner for all associated terms.
- Calculate aggregate category search volume and YoY growth.
- Segment searches by intent: informational ("what is birria"), recipe/preparation ("birria recipe"), and purchase-intent ("birria frozen meal", "birria seasoning buy"). Purchase-intent searches are weighted highest for innovation sizing.

**Layer B: Market Sizing (Circana/NIQ)**
- Map each trend signal to the closest Circana category/subcategory.
- Pull current category size, growth rate, and brand share data.
- Calculate the relevant addressable segment (e.g., for "Indian flavors in frozen chicken" — the intersection of frozen chicken and ethnic/global flavored subcategories).

**Layer C: Opportunity Estimation**
- Claude AI combines demand signals with market data to estimate opportunity size.
- Uses analogous trend benchmarking: "The Nashville Hot trend drove $X in incremental frozen chicken sales over 18 months. Indian flavor signals are currently tracking at Y% of where Nashville Hot was at the same stage. Estimated incremental opportunity: $Z."
- Applies a confidence range (low/mid/high) based on signal maturity and data quality.

**Output:** A sized opportunity estimate for each trend signal.

**Example Output:**
```
OPPORTUNITY SIZING: Indian Flavor Profiles in Frozen Protein

DEMAND SIGNALS
  Total monthly US searches (Indian food terms):     2.1M
  Purchase-intent searches (frozen/retail context):  95K/month
  YoY growth (purchase-intent subset):               +62%
  
MARKET CONTEXT (Circana)
  Total US frozen chicken category:                  $4.2B
  Global/ethnic flavored frozen chicken segment:     $380M
  Segment growth rate:                               +22% YoY
  Current segment leaders:                           InnovAsian (18%), 
                                                     P.F. Chang's (15%),
                                                     Saffron Road (8%)
  Tyson current share of ethnic frozen chicken:      <2%

OPPORTUNITY ESTIMATE
  Addressable segment (Indian-specific frozen):      $85-140M (est.)
  Projected 3-year segment size:                     $180-280M
  Realistic Tyson capture (10-15% share):            $18-42M incremental
  Confidence level:                                  MEDIUM-HIGH
  
ANALOGOUS BENCHMARK
  Nashville Hot chicken trend drove ~$200M in incremental frozen category
  sales over 24 months (2021-2023). Indian flavor signals are tracking at 
  approximately 40-50% of Nashville Hot's search velocity at an equivalent 
  stage, suggesting a smaller but significant opportunity with longer runway.
```

#### Feature 4: Tyson Portfolio Fit Scoring

**Purpose:** Evaluate every sized opportunity against Tyson's specific brands, manufacturing capabilities, channel relationships, and competitive position to determine strategic fit.

**How It Works:**

Claude AI evaluates each opportunity across five dimensions, each scored 1-10:

**Manufacturing Adjacency (1-10)**
How easily can Tyson produce this with existing facilities and lines?
- Score 9-10: Same protein base, different seasoning/flavoring (e.g., Indian-spiced chicken tenders)
- Score 6-8: Same category, new format (e.g., protein bites vs. strips)
- Score 3-5: Adjacent category, new process (e.g., new cooking method, new packaging)
- Score 1-2: Entirely new capability required (e.g., plant-based, fermentation)

**Brand Permission (1-10)**
Which Tyson brand(s) have consumer permission to play in this space?
- Score 9-10: Core brand territory (Jimmy Dean → breakfast innovation)
- Score 6-8: Natural extension (Ball Park → grilling flavor innovation)
- Score 3-5: Stretch but credible (Tyson → global flavors)
- Score 1-2: No brand permission (Jimmy Dean → dinner entrées)

**Channel Readiness (1-10)**
Are retailers ready to shelf this?
- Score 9-10: Retailers actively seeking products in this space (confirmed by buyer signals)
- Score 6-8: Category is growing at retail, shelf space expanding
- Score 3-5: Niche/specialty retailers carrying it, mainstream not yet
- Score 1-2: No retail precedent, would need category creation

**Competitive Density (1-10, inverted — high score = less competition)**
How crowded is the space?
- Score 9-10: No major CPG competitor has launched here (true whitespace)
- Score 6-8: 1-2 small/niche brands present, no major CPG
- Score 3-5: Multiple competitors present including 1-2 major CPG
- Score 1-2: Saturated — multiple major CPG players, commoditized

**Trend Momentum (1-10)**
How strong and durable is the underlying trend?
- Score 9-10: Multi-year acceleration, structural/demographic driver (e.g., GLP-1 drugs)
- Score 6-8: Strong growth, 12+ months of consistent signals
- Score 3-5: Growing but could be cyclical or seasonal
- Score 1-2: Unclear trajectory, possible fad

**Composite Priority Score:** Weighted average of all five dimensions.

Recommended weights:
- Manufacturing Adjacency: 25% (execution feasibility)
- Brand Permission: 20% (go-to-market credibility)
- Channel Readiness: 15% (speed to shelf)
- Competitive Density: 20% (first-mover advantage)
- Trend Momentum: 20% (durability of opportunity)

**Output:** A scored opportunity card for each trend.

**Example Output:**
```
OPPORTUNITY SCORECARD: GLP-1 Optimized Protein Products

  Manufacturing Adjacency:    9/10  (reformulation of existing products)
  Brand Permission:           8/10  (Jimmy Dean breakfast, Tyson frozen)
  Channel Readiness:          8/10  (retailers actively expanding "better for you")
  Competitive Density:        9/10  (no major CPG has dedicated GLP-1 line)
  Trend Momentum:             10/10 (structural — 30M+ patients by 2027)
  
  ══════════════════════════════════
  COMPOSITE PRIORITY SCORE: 8.9/10
  RECOMMENDATION: HORIZON 1 — ACT WITHIN 6 MONTHS
  ══════════════════════════════════

  Sizing: $85M realistic capture in Year 1
  Suggested Brands: Jimmy Dean (breakfast), Tyson (lunch/dinner)
  Concept: "Protein Plus" sub-line — 30g+ protein, <350 cal, 
           small portions with front-of-pack protein callout
  Key Risk: Speed — this window won't stay open. Nestlé and Conagra 
           are likely evaluating the same signals.
```

#### Feature 5: Automated Intelligence Briefs

**Purpose:** Transform raw data and AI analysis into narrative intelligence reports that decision-makers actually read and act on.

**Brief Types:**

**Weekly Trend Radar (Every Monday)**
- Audience: Innovation, Marketing, Leadership
- Content: Top 5 trend movements of the week, notable Reddit insights, any breakout signals, competitive activity detected
- Format: Email digest, 1-2 pages
- Generation: Fully automated via Claude

**Monthly Opportunity Report (First week of each month)**
- Audience: Innovation/R&D, Brand Directors, CMO
- Content: 3-5 sized and scored opportunity briefs for the highest-priority signals of the month, including consumer voice evidence and competitive context
- Format: PDF report or PowerPoint, 8-12 pages
- Generation: Claude-generated draft, human-reviewed before distribution

**Quarterly Innovation Priorities (Quarterly)**
- Audience: Senior Leadership, Portfolio Strategy
- Content: Portfolio-level trend radar (all tracked signals plotted by velocity vs. Tyson fit), top 10 ranked opportunities with full sizing, recommended innovation pipeline actions, competitive positioning landscape
- Format: Presentation deck, 15-20 slides
- Generation: Claude-generated framework, human-refined

**Ad-Hoc Trend Deep Dives (On demand)**
- Audience: Any stakeholder
- Content: Deep investigation into a specific trend or question ("How big is the birria opportunity for Ball Park?", "What's happening with clean label in frozen breakfast?")
- Format: 2-3 page brief
- Generation: Triggered by stakeholder request, Claude generates draft within hours

### Trend Radar Visualization

The centerpiece visual of the system is the **Trend Radar** — a two-dimensional plot showing all tracked trends positioned by:

- **X-axis: Search Velocity** (how fast is consumer demand growing?)
- **Y-axis: Tyson Portfolio Fit** (how well does this map to Tyson's brands and capabilities?)

Trends are plotted as bubbles, sized by estimated market opportunity, and colored by horizon:
- 🔴 Red = Horizon 1 (Act now, 0-6 months)
- 🟡 Yellow = Horizon 2 (Emerging, 6-18 months)
- 🟢 Green = Horizon 3 (Long-range, 2-5 years)

The upper-right quadrant (high velocity + high fit) represents the highest-priority innovation opportunities.

```
                    HIGH FIT
                       │
                       │    ● GLP-1 Protein    ● Indian Chicken
                       │      (H1, $85M)         (H1, $35M)
                       │
                       │         ● Air Fryer     ● Nashville Hot
                       │           Optimized       Extensions
                       │           (H1, $60M)      (H2, $25M)
   LOW VELOCITY ───────┼─────────────────────── HIGH VELOCITY
                       │
                       │    ○ Korean Flavors    ○ Birria Flavored
                       │      (H2, $20M)          (H2, $15M)
                       │
                       │         ○ Functional     ○ Fermented
                       │           Ingredients      Proteins
                       │           (H3, TBD)        (H3, TBD)
                       │
                    LOW FIT
```

---

## Part 4: Week-by-Week Build Plan

### Week 1: Data Foundation

**Day 1-2: BigQuery Setup**
- Create BigQuery project and dataset
- Define table schemas for all data tables (google_trends_weekly, google_trends_derived, reddit_posts, keyword_volumes, trend_signals, opportunity_scores)
- Set up service account and authentication

**Day 3-4: Google Trends Ingestion**
- Finalize the 200-300 term keyword universe (organized by clusters)
- Write Python script using pytrends to pull weekly data for all terms
- Implement rate limiting and error handling (pytrends has strict rate limits)
- Calculate derived metrics: YoY growth, acceleration, velocity score
- Load initial historical data (backfill 2 years for baseline)
- Schedule weekly automated refresh

**Day 5-7: Reddit Ingestion**
- Set up Reddit API credentials (PRAW)
- Write Python script to pull top 50 posts weekly from each of 20 tracked subreddits
- Store raw post data in BigQuery (subreddit, title, body, score, num_comments, created_date, url)
- Test and validate data quality
- Schedule weekly automated refresh

### Week 2: Intelligence Layer

**Day 8-10: Trend Detection Engine**
- Build Claude prompt chain for weekly trend analysis:
  - Prompt 1: Analyze Google Trends data, flag acceleration signals, identify cluster patterns
  - Prompt 2: Cross-reference flagged signals with previous weeks to confirm persistence
  - Prompt 3: Classify each signal by horizon (H1/H2/H3)
- Test on historical data to validate that the system would have caught known trends (GLP-1, cottage cheese, Nashville hot, etc.)
- Write results to trend_signals table in BigQuery

**Day 11-12: Reddit Insight Extraction**
- Build Claude prompt chain for Reddit analysis:
  - Prompt 1: Extract emerging food concepts, pain points, product requests, whitespace signals from each subreddit batch
  - Prompt 2: Identify cross-subreddit spread (same concept in 3+ subs)
  - Prompt 3: Link Reddit insights to trend signals from the Trend Detection Engine
- Test on recent Reddit data to validate insight quality

**Day 13-14: Integration & Cross-Source Synthesis**
- Build the synthesis prompt that connects Google Trends signals with Reddit insights
- Implement the "signal enrichment" pipeline: trend signal → demand context → consumer voice → preliminary narrative
- Test end-to-end: from raw data pull through enriched trend signal

### Week 3: Sizing & Scoring

**Day 15-17: Opportunity Sizing**
- Set up Google Keyword Planner data extraction (manual or semi-automated via Google Ads API)
- Pull actual monthly search volumes for all terms in flagged trend signals
- Build the Claude sizing prompt:
  - Input: search volume data + trend signal + available Circana context
  - Output: structured opportunity estimate (demand sizing, market context, opportunity range, confidence level)
- Create keyword_volumes and opportunity_sizing tables in BigQuery

**Day 18-19: Tyson Portfolio Scoring**
- Build the Claude scoring prompt:
  - Input: sized opportunity + Tyson brand portfolio context + competitive landscape
  - Output: 5-dimension scorecard (manufacturing adjacency, brand permission, channel readiness, competitive density, trend momentum) + composite priority score + recommended action
- Encode Tyson brand portfolio context as a reference document for the prompt:
  - Brand list with category/product coverage
  - Manufacturing capabilities summary
  - Key retail channel relationships
- Test scoring on 5-10 trend signals and calibrate weights

**Day 20-21: End-to-End Pipeline Test**
- Run the complete pipeline: data ingestion → trend detection → insight extraction → sizing → scoring → opportunity brief
- Validate output quality on 3-5 trend signals
- Refine prompts based on output review

### Week 4: Output, Distribution & Polish

**Day 22-24: Dashboard / Front-End App**
- Build the Trend Radar visualization (velocity × fit scatter plot with sized bubbles)
- Build the trend signal list view (sortable by velocity score, priority score, horizon)
- Build the opportunity brief detail view (full scorecard with demand evidence, sizing, consumer voice)
- Build the weekly digest view (top 5 signals with narratives)
- Technology: Next.js + BigQuery connection, or a simpler Streamlit/Retool dashboard if speed is priority

**Day 25-26: Automated Brief Generation**
- Build the Weekly Trend Radar brief template
- Build the Monthly Opportunity Report template
- Set up automated Claude generation pipeline (triggered weekly/monthly via Cloud Functions or cron)
- Configure email distribution or SharePoint/Teams integration

**Day 27-28: Testing, Calibration & Launch**
- Run full system for 1 week with real data
- Review all outputs with stakeholders for quality and relevance
- Calibrate velocity score thresholds and scoring weights based on feedback
- Document the system for handoff/maintenance
- Soft launch to initial stakeholder group

---

## Part 5: Future Enhancements (Post-Month 1)

Once the core system is operational, the following enhancements can be layered in incrementally:

| Enhancement | Effort | Value Add |
|---|---|---|
| Add TikTok data via Apify | 2-3 days | Viral trend detection, younger demographic signals |
| Add GDELT news monitoring | 1-2 days | Trade and mainstream press coverage context |
| Add YouTube Data API | 2-3 days | Food creator content trends |
| Add OpenFoodFacts for competitor product tracking | 3-5 days | New product launch detection, ingredient trend tracking |
| Add Amazon Movers & Shakers scraping | 2-3 days | Real-time purchase demand signals |
| Add Yelp restaurant menu tracking | 3-5 days | Restaurant-to-retail pipeline signals |
| Add USPTO patent monitoring | 3-5 days | Horizon 3 competitor R&D intelligence |
| Add SEC EDGAR earnings transcript analysis | 2-3 days | Competitor innovation strategy signals (extend SignalDeck) |
| Integrate Yogi product review data | 3-5 days | SKU-level consumer feedback correlated with trends |
| Add Brandwatch for TikTok/Instagram at scale | Vendor process | Enterprise-grade social monitoring |
| Integrate with Tyson's internal innovation pipeline tools | 5-10 days | Direct connection between signals and stage-gate process |
| Build predictive model (trend signals → retail sales velocity) | 2-4 weeks | Forward-looking demand forecasting |

---

## Part 6: Success Metrics

How we know the system is working:

| Metric | Target | Measurement |
|---|---|---|
| Trend signals detected before mainstream awareness | 3+ months lead time | Compare signal dates to first major trade press coverage |
| Opportunity briefs generated per month | 3-5 sized opportunities | Count of completed opportunity scorecards |
| Stakeholder adoption | 15+ regular users within 3 months | Dashboard logins + brief open rates |
| Pipeline influence | 2+ innovation concepts sourced from system in Year 1 | Track concept origin in innovation pipeline |
| Accuracy of trend classification | >70% of H1 signals confirmed by Circana within 6 months | Retrospective validation against syndicated data |
| Time to insight | <48 hours from signal detection to sized brief | Measure pipeline processing time |

---

## Appendix A: Cost Summary

| Item | Monthly Cost | Annual Cost |
|---|---|---|
| Google Trends (pytrends) | $0 | $0 |
| Reddit (PRAW) | $0 | $0 |
| Google Keyword Planner | $0 | $0 |
| Circana/NIQ | Already contracted | Already contracted |
| Yogi | Already contracted | Already contracted |
| Claude API (enrichment & briefs) | ~$200-500 | ~$2,400-6,000 |
| Google BigQuery compute | ~$100-300 | ~$1,200-3,600 |
| Cloud Functions hosting | ~$20-50 | ~$240-600 |
| **Total incremental cost** | **~$320-850/month** | **~$3,840-10,200/year** |

## Appendix B: Risk & Mitigation

| Risk | Mitigation |
|---|---|
| Google Trends rate limiting with pytrends | Implement respectful rate limiting, batch queries, use multiple IP rotation if needed |
| Reddit API access changes | Reddit's API is stable for read access; maintain compliance with terms of service |
| Signal noise — false positives | Require signals to persist 2+ weeks and appear in 2+ sources before flagging |
| Disambiguation errors (e.g., "Tyson" = Mike Tyson) | Claude enrichment layer with explicit disambiguation prompts and brand-specific context |
| Stakeholder fatigue from too many signals | Strict threshold management — only surface top 5 signals per week |
| Circana data lag (reported monthly) | Use Google Trends as leading indicator; Circana confirms, not leads |
| Over-reliance on search data (not all consumers search) | Reddit provides complementary qualitative signal; future TikTok/social addition closes gap |

## Appendix C: Governance

- **System Owner:** Marketing Analytics (Rohit's team)
- **Data Refresh Cadence:** Weekly (Google Trends, Reddit), Monthly (Keyword Planner, Circana cross-reference)
- **Brief Review:** Weekly briefs auto-generated, monthly briefs human-reviewed before distribution
- **Keyword Universe Updates:** Quarterly review — add emerging terms, retire stale ones
- **Scoring Calibration:** Monthly review of scoring weights based on stakeholder feedback and retrospective accuracy
