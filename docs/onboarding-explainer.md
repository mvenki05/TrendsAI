# TrendPulse — Onboarding Explainer
*Questions asked and answered during first walkthrough session — April 1, 2026*

---

## 1. What is in this app? Is there anything designed?

### What's Been Built

The 4-week build plan is 100% marked complete. This is a mature, well-structured codebase (~2,500 lines of Python + a Next.js dashboard).

| Component | Status | Detail |
|---|---|---|
| Google Trends ingestion | Done | 404 lines, rate-limited, exponential backoff, 80 keywords in 9 clusters |
| Reddit ingestion | Done | 145 lines, PRAW-based, deduplication, 20 subreddits |
| Trend detection (AI chain) | Done | 333 lines, sends top 30 metrics to Claude, classifies H1/H2/H3 horizons |
| Opportunity sizing | Done | 261 lines, market demand estimation via AI |
| Portfolio fit scoring | Done | 313 lines, 5-dimension scoring |
| Weekly Radar brief | Done | 206 lines, generates markdown email digests |
| Opportunity brief | Done | 289 lines, full scorecard + product concepts |
| Next.js dashboard | Done | Trend Radar scatter, Signal list, Portfolio Fit Scorecard (localhost:3000) |
| Tests | Done | 40+ tests across unit, integration, E2E |

### Configuration in Place
- `config/keywords.yaml` — 80 search terms across 9 clusters
- `config/subreddits.yaml` — 20 tracked subreddits
- `config/brands.yaml` — 5 Tyson brands with manufacturing/channel context
- `config/settings.yaml` — BigQuery project, LLM proxy, scoring weights, rate limits

### What's NOT Done / Blocked
- No Reddit API keys → can't scrape Reddit
- No Google Cloud credentials → can't read/write BigQuery
- Post-month-1 backlog not coded: TikTok/Instagram, GDELT news, YouTube, automated email, predictive modeling

---

## 2. Can you run it?

Yes. The Next.js dashboard is a real running app.

**The dashboard runs at: http://localhost:3000**

To start it:
```bash
cd dashboard
npm start
```

It will show the UI shell (dark theme, header, 4 tabs) but empty data — because BigQuery needs Google Cloud credentials to connect.

Note: `src/dashboard/app.py` (Streamlit) is just an empty stub — it was never built. The real UI is the Next.js dashboard in the `dashboard/` folder.

---

## 3. What does this app do? Explain it simply.

### The Problem
Tyson makes chicken nuggets, Jimmy Dean sausages, Ball Park hot dogs. Every year someone at Tyson has to decide: *"What new product should we make next year?"*

The old way: annual trend reports + Circana/Nielsen sales data. Problem — those tell you what people **already bought**, not what they **want next**. By the time Tyson decides to launch, competitors are already on the shelf.

### How Food Trends Move
```
A few nerds on Reddit talk about it
        ↓
Food bloggers & TikTok pick it up
        ↓
People start Googling it like crazy   ← TrendPulse watches HERE
        ↓
Restaurants put it on menus
        ↓
Brands launch products
        ↓
It's at Walmart → YOU'RE LATE
```

### What TrendPulse Does — Step by Step

1. **Watches Google** — pulls search data for 80 food-related terms every week. Calculates not just "is it popular" but "is it getting more popular faster" (velocity + acceleration).

2. **Reads Reddit** — scrapes 20 food subreddits. Google tells you *what* people want. Reddit tells you *why* and *what specifically they're frustrated about* — where product ideas come from.

3. **Runs it through AI** — feeds all data to Claude AI which identifies breakout signals and classifies by time horizon (H1/H2/H3).

4. **Scores against Tyson specifically** — not just "is birria trending" but "can Tyson's factories make this? Does Jimmy Dean have permission to play here? Is Walmart ready to stock it?"

5. **Generates a weekly brief** — AI writes a narrative report in plain English for innovation, marketing, and R&D teams every week.

### The Advantage in One Sentence
> Tyson gets a 6–18 month head start on competitors who are still waiting for their annual trend report.

---

## 4. What do the terms mean? How are they calculated?

### The Raw Input: Google Trends Interest Score
Google gives a relative index 0–100 (not actual search counts):
- **100** = peak popularity in the time window
- **50** = half as popular as peak
- **0** = barely anyone searched for it

### The 4 Calculated Metrics

#### Current Interest
How popular is this term right now?
```
Current Interest = average of last 4 weeks of interest scores
```

#### YoY Growth (Year-over-Year)
Is this term more or less popular than exactly one year ago?
```
YoY Growth = ((current 4-week avg ÷ same 4 weeks last year) - 1) × 100
```
Positive = bigger than last year. Negative = shrinking.

#### Acceleration
Is the growth speeding up or slowing down? This is the key metric — it catches trends before they peak.
```
Acceleration = YoY growth this period - YoY growth 4 weeks ago
```
- `accelerating` → acceleration > 5
- `decelerating` → acceleration < -5
- `stable` → between -5 and +5
- `new` → no data yet

A term could have +200% YoY but if it was +250% last month, it's slowing down. Acceleration catches things just starting to take off.

#### Velocity Score
The single combined "how hot is this right now" number. The dashboard sorts by this.
```
Velocity Score = (YoY Growth × Acceleration × Current Interest) / 1000
```
Why multiply all three? High YoY alone could be a past spike. High acceleration alone on a tiny term doesn't matter. High interest alone could be an established term with no momentum. All three high simultaneously = real breakout.

### Horizon Classification

| Horizon | Timeframe | Meaning |
|---|---|---|
| **H1** | Act within 6 months | High velocity, strong demand NOW, multiple terms in cluster accelerating |
| **H2** | 6–18 months | Emerging, moderate velocity, positive acceleration |
| **H3** | 2–5 years | Low interest but notable acceleration from a small base |

Think of it as:
- H1 = the wave is already breaking, paddle now or miss it
- H2 = you can see the swell forming offshore
- H3 = there's a storm out at sea that might become a wave

### Signal Strength (0–100)
The AI's overall confidence score for a detected trend. Not a single formula — AI weighs velocity, cluster acceleration, Reddit discussion, cross-source confirmation.
- 80–100: Very strong, multiple sources confirming
- 50–80: Solid, worth watching closely
- Below 50: Weak or early-stage

---

## 5. What are these terms — are they products?

**No. The terms are search behaviors** — what millions of Americans are typing into Google.

"Accelerating frozen food sales" with a portfolio fit of 9.2/10 means:
> "Americans are searching for frozen food more and more each week. When scored against Tyson's factories, brands, and retail relationships — it's a near-perfect fit."

It signals: *"People want more frozen food and Tyson is well-positioned to give it to them."*
It does NOT say which specific frozen food to make. That's the gap between the system's output and the innovation team's job.

---

## 6. How does the system know what product to suggest?

**Honest answer: it doesn't, fully.**

What the system does:
```
Trending search term → AI scores it → "Tyson should act on this" + rough product concept
```

What it does NOT do:
```
Trending search term → "Here is the exact product Tyson should invent"
```

The AI suggests a rough concept (e.g. "Jimmy Dean High-Protein Cottage Cheese Breakfast Bowl") but it doesn't know:
- What's already in Tyson's product pipeline
- What their factories can actually produce tomorrow vs. in 2 years
- What a retailer like Walmart has specifically asked for
- What price point works
- What's already saturated on shelf

**The system finds the opportunity. A human still has to invent the product.**

---

## 7. Where does the data come from? What is BigQuery doing?

### Data Sources (currently built)

**1. Google Trends**
- What: Relative search interest (0–100 index) for 80 food terms, weekly, US-only
- How: Python library `pytrends` — a bot that calls Google Trends automatically, no manual work
- This is internet data — collective search behavior of hundreds of millions of Americans

**2. Reddit**
- What: Posts and comments from 20 food subreddits — real consumer opinions in full paragraphs
- How: Python library `PRAW` — Reddit's official API
- This is also internet data — unfiltered consumer voice

### Data Sources Planned (not yet built)
YouTube, TikTok/Instagram (via Apify), news articles (GDELT), restaurant menus, Amazon sales ranks, patent filings, academic research

### What BigQuery Does
BigQuery is both the **storage AND retrieval layer** — not just a filing cabinet, but a filing cabinet you can ask questions to.

**Storage:** Raw data goes in every week
```
Google Trends data → stored in BigQuery
Reddit posts       → stored in BigQuery
AI scores          → stored in BigQuery
```

**Retrieval:** The dashboard and AI both query BigQuery
```
Dashboard loads    → asks BigQuery "give me all trend signals"
AI scoring runs    → asks BigQuery "give me top 30 velocity scores"
Weekly brief runs  → asks BigQuery "give me top 5 signals this week"
```

### BigQuery Tables

| Table | What's in it |
|---|---|
| `google_trends_weekly` | Every term, every week, raw interest score |
| `google_trends_derived` | Calculated metrics — YoY, acceleration, velocity |
| `reddit_posts` | Every scraped post — title, body, score, subreddit |
| `trend_signals` | AI output — detected trends, H1/H2/H3, signal strength |
| `opportunity_scores` | AI scoring — 5 dimensions, composite score, suggested brands |
| `keyword_volumes` | Actual search volumes from Google Keyword Planner |
| `circana_reference` | Tyson already pays for this — real retail sales data |

BigQuery is Google's cloud database, lives inside Tyson's own Google Cloud project (`dev-2534-puw-growth-2295ed`) — data never leaves Tyson's infrastructure.

---

## 8. How is the Tyson Fit Score generated?

### Step 1 — AI is Briefed on Tyson's 5 Brands

| Brand | Makes | Positioning | Sold At |
|---|---|---|---|
| **Tyson** | Chicken nuggets, strips, tenders, frozen protein | America's protein brand, mainstream, family | Walmart, Kroger, Costco, foodservice |
| **Jimmy Dean** | Breakfast sausage, sandwiches, bowls, burritos | Breakfast authority, hearty, convenient | Grocery, mass, club |
| **Ball Park** | Hot dogs | Game day, grilling, summer | Grocery, mass |
| **Hillshire Farm** | Deli meat, smoked sausage, snack kits | Quality deli, snacking occasions | Grocery, mass |
| **Aidells** | Premium sausage, meatballs | Premium, chef-inspired, flavor-forward | Grocery, specialty |

### Step 2 — AI Scores the Trend on 5 Questions (each 1–10)

**Manufacturing Adjacency (25% weight)**
*Can Tyson's existing factories make this without new equipment?*
- 9–10: Same protein, different seasoning (Tyson can make it tomorrow)
- 6–8: Same category, slightly new format
- 3–5: Adjacent but needs new process
- 1–2: Completely new capability required

Gets highest weight because Tyson's biggest real-world constraint is what their factories can actually produce.

**Brand Permission (20% weight)**
*Would consumers trust a Tyson brand to sell this?*
- 9–10: Core territory (Jimmy Dean → breakfast, no questions asked)
- 6–8: Natural extension
- 3–5: A stretch but possible
- 1–2: No brand fits at all

**Channel Readiness (15% weight)**
*Are Walmart, Kroger, Costco ready to put this on shelves?*
- 9–10: Retailers actively seeking products in this space
- 6–8: Category growing, shelf space expanding
- 3–5: Niche/specialty only
- 1–2: No retail precedent

Lowest weight because Tyson has strong retailer relationships — if the product is right, they can push it through.

**Competitive Density (20% weight) — INVERTED: higher = LESS competition = better**
*How crowded is this space?*
- 9–10: True white space, no major CPG competitor
- 6–8: 1–2 small niche brands, no major player
- 3–5: Multiple competitors including big brands
- 1–2: Saturated, commoditized, Tyson would be fighting for scraps

**Trend Momentum (20% weight)**
*Is this trend real and durable, or a 2-week TikTok fad?*
- 9–10: Multi-year structural driver (e.g. GLP-1 drugs driving protein demand — not going away)
- 6–8: Strong 12+ months of consistent growth
- 3–5: Growing but could be cyclical
- 1–2: Unclear, possible fad

### Step 3 — The Composite Score Formula
```
Composite = (Manufacturing × 0.25)
          + (Brand Permission × 0.20)
          + (Channel Readiness × 0.15)
          + (Competitive Density × 0.20)
          + (Trend Momentum × 0.20)
```

### Example — "High Protein Air Fryer Chicken Strips"
| Dimension | Score | Weight | Contribution |
|---|---|---|---|
| Manufacturing | 9 | 25% | 2.25 |
| Brand Permission | 9 | 20% | 1.80 |
| Channel Readiness | 8 | 15% | 1.20 |
| Competitive Density | 6 | 20% | 1.20 |
| Trend Momentum | 8 | 20% | 1.60 |
| **Composite** | | | **8.05 / 10** |

### Example — "Functional Mushroom Protein Powder"
| Dimension | Score | Weight | Contribution |
|---|---|---|---|
| Manufacturing | 2 | 25% | 0.50 |
| Brand Permission | 2 | 20% | 0.40 |
| Channel Readiness | 4 | 15% | 0.60 |
| Competitive Density | 7 | 20% | 1.40 |
| Trend Momentum | 7 | 20% | 1.40 |
| **Composite** | | | **4.30 / 10** |

Same trend momentum — the mushroom trend is just as real — but Tyson can't make it and has no brand that fits. Score tanks. System says: watch this trend, but don't act on it yet.

---

## 9. What does the Trend Radar graph mean?

```
        10 │                          ★ ACT NOW
           │                    (fast + fits Tyson)
 Tyson     │
 Fit     5 │         ◆ WATCH
 Score     │    (fits Tyson, not moving yet)
           │
         0 │___________________________________
           0         5                  10
                  Velocity Score
                (how fast the trend moves)
```

| Quadrant | Meaning |
|---|---|
| Top-right | Fast trend + great Tyson fit = **H1, act immediately** |
| Top-left | Great Tyson fit but slow moving = monitor, not urgent |
| Bottom-right | Trend exploding but poor Tyson fit = watch competitors |
| Bottom-left | Slow and bad fit = ignore |

**Dot colors:**
- Red = H1 (act within 6 months)
- Yellow = H2 (act in 6–18 months)
- Green = H3 (3–5 years out)

The innovation team looks at this chart Monday morning — red dots in the top-right corner tell them exactly what to prioritize this quarter.

---

## 10. Known Gaps (identified during walkthrough)

1. **The AI scores based only on `brands.yaml`** — a config file typed by hand. It doesn't know what's already in Tyson's product pipeline, what a Walmart buyer asked for last week, or what factory capacity actually looks like right now. This is a real gap.

2. **Circana data is referenced but not wired in** — Tyson already pays for real retail sales data. That data should feed into this system to validate trend signals against actual dollars sold.

3. **The system finds the opportunity; a human still invents the product** — the AI gives a rough concept suggestion but the innovation team has to do the actual product development work.

4. **No credentials connected yet** — Google Cloud auth and Reddit API keys needed before any real data flows through.

---

*Document created: April 1, 2026*
*Location: docs/onboarding-explainer.md*
