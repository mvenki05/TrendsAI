# TrendPulse: Analytical Frameworks, Formulas & Implementation Guide

> Research compiled April 2026. This document is the canonical reference for every scoring formula, detection algorithm, and sizing model used in TrendPulse. All methods are designed for Python implementation against Google Trends (pytrends), Reddit (PRAW), retail sales, and product review data.

---

## Table of Contents

1. [Trend Velocity & Acceleration Detection](#1-trend-velocity--acceleration-detection)
2. [Share of Search — Market Share Proxy](#2-share-of-search--market-share-proxy)
3. [Multi-Source Composite Trend Score](#3-multi-source-composite-trend-score)
4. [Trend Maturity Classification (S-Curve Positioning)](#4-trend-maturity-classification-s-curve-positioning)
5. [Bass Diffusion Model — Demand Forecasting](#5-bass-diffusion-model--demand-forecasting)
6. [Ulwick Opportunity Algorithm — Unmet Need Scoring](#6-ulwick-opportunity-algorithm--unmet-need-scoring)
7. [White Space Analysis — Market Gap Detection](#7-white-space-analysis--market-gap-detection)
8. [TAM / SAM / SOM Market Sizing](#8-tam--sam--som-market-sizing)
9. [Consumer Sentiment NLP Scoring](#9-consumer-sentiment-nlp-scoring)
10. [Launch Timing Framework — Crossing the Chasm](#10-launch-timing-framework--crossing-the-chasm)
11. [Tyson Portfolio Fit Scoring (5-Dimension)](#11-tyson-portfolio-fit-scoring-5-dimension)
12. [Putting It All Together — The TrendPulse Pipeline](#12-putting-it-all-together--the-trendpulse-pipeline)

---

## 1. Trend Velocity & Acceleration Detection

### What it measures
Raw search interest tells you *what* people care about. Velocity and acceleration tell you *how fast* interest is growing and *whether that growth is itself speeding up* — the two most important signals for catching a trend before it peaks.

### Core Formulas

**Velocity (first derivative — rate of change)**

```
Velocity(t) = Interest(t) - Interest(t-1)
```

For weekly Google Trends data (0–100 normalized index):

```python
import pandas as pd

def compute_velocity(series: pd.Series, window: int = 4) -> pd.Series:
    """Rolling 4-week velocity = mean weekly point change."""
    return series.diff(1).rolling(window).mean()
```

**Acceleration (second derivative — rate of change of velocity)**

```
Acceleration(t) = Velocity(t) - Velocity(t-1)
```

A positive acceleration means the growth rate is *itself* increasing — this is the hallmark of an emerging trend that hasn't peaked yet.

```python
def compute_acceleration(series: pd.Series, window: int = 4) -> pd.Series:
    velocity = compute_velocity(series, window)
    return velocity.diff(1).rolling(window).mean()
```

**Year-over-Year (YoY) Growth**

```
YoY(t) = (Interest(t) - Interest(t-52)) / Interest(t-52) × 100
```

```python
def compute_yoy(series: pd.Series) -> pd.Series:
    """52-week YoY for weekly data."""
    return ((series - series.shift(52)) / series.shift(52).replace(0, 0.01)) * 100
```

**Compound Annual Growth Rate (CAGR)**

```
CAGR = (End_Value / Start_Value)^(1/n_years) - 1
```

```python
def compute_cagr(start_val: float, end_val: float, n_years: float) -> float:
    return (end_val / max(start_val, 0.01)) ** (1 / n_years) - 1
```

### Velocity Score (normalized 0–100)

Combines YoY growth, acceleration, and absolute level into one score for ranking:

```python
def velocity_score(
    yoy_growth: float,       # percent, e.g. 45.0
    acceleration: float,     # weekly point change in velocity
    current_interest: float  # raw Google Trends index 0-100
) -> float:
    """
    Weighted velocity score (0-100).
    Weights: 50% YoY growth, 30% acceleration signal, 20% current level.
    """
    # Normalize each component to 0-1 using reasonable CPG maxima
    yoy_norm    = min(max(yoy_growth / 200.0, 0), 1)       # cap at +200% YoY
    accel_norm  = min(max((acceleration + 5) / 10.0, 0), 1) # center around 0
    level_norm  = current_interest / 100.0

    score = (0.50 * yoy_norm + 0.30 * accel_norm + 0.20 * level_norm) * 100
    return round(score, 1)
```

### Acceleration Flagging Threshold (rule-based)

A term is flagged as **accelerating** when ALL of:
- YoY growth > 20%
- 4-week rolling acceleration > 0 (growth rate speeding up)
- Current interest index >= 10 (not just noise)
- The acceleration has been positive for at least 3 consecutive weeks

```python
def is_accelerating(df: pd.DataFrame) -> bool:
    """df has columns: interest, velocity, acceleration (weekly rows)."""
    recent = df.tail(4)
    return (
        df['yoy_growth'].iloc[-1] > 20 and
        (recent['acceleration'] > 0).sum() >= 3 and
        df['interest'].iloc[-1] >= 10
    )
```

### Why the second derivative matters

Most tools only track velocity (week-over-week or YoY growth). Acceleration catches trends at the inflection point — the moment the growth rate turns positive — which is 3–6 months before mainstream awareness peaks. For Tyson's 18–24 month innovation cycle, this lead time is the actionable window.

**Sources:** [Pinnvalor Smart Trend Analysis](https://www.pinnvalor.com/Smart-Trend-Analysis-A-Toolkit-with-YOY-CAGR-and-Indexing-Explained), [Wall Street Prep YoY](https://www.wallstreetprep.com/knowledge/year-over-year-yoy/)

---

## 2. Share of Search — Market Share Proxy

### What it measures
Share of Search (SoS) is the percentage of category-level search queries captured by a specific brand or ingredient/format. Research by Les Binet (2020, IPA/WARC) found an **83% correlation coefficient** between Share of Search and Share of Market (SoM), and that SoS predicts SoM changes **3–12 months in advance**.

This makes it the highest-signal free-data proxy for market share that can be computed from Google Trends.

### Formula

```
Share of Search (brand) = Brand_Search_Volume / Sum(All_Brands_Search_Volume) × 100
```

### Implementation with Google Trends (pytrends)

Google Trends only supports 5 terms per call and returns relative (not absolute) data. The trick is to use a **reference anchor term** present in all batches:

```python
from pytrends.request import TrendReq
import pandas as pd
import time

def share_of_search(
    terms: list[str],
    anchor: str,
    timeframe: str = "today 12-m",
    geo: str = "US"
) -> pd.DataFrame:
    """
    Compute Share of Search across terms using an anchor term
    for cross-batch normalization.

    Args:
        terms: List of brand/category terms (any length)
        anchor: A stable reference term present in every batch
        timeframe: Google Trends timeframe string
        geo: Country code

    Returns:
        DataFrame with columns [term, avg_interest, share_of_search_pct]
    """
    pytrends = TrendReq(hl="en-US", tz=360)
    batches = [terms[i:i+4] for i in range(0, len(terms), 4)]
    results = {}

    for batch in batches:
        kw_list = batch + [anchor]
        pytrends.build_payload(kw_list, timeframe=timeframe, geo=geo)
        df = pytrends.interest_over_time()
        if df.empty:
            continue

        # Normalize each term relative to the anchor
        anchor_mean = df[anchor].mean()
        if anchor_mean == 0:
            anchor_mean = 0.01
        for term in batch:
            results[term] = (df[term].mean() / anchor_mean) * 100

        time.sleep(2)  # Rate limit respect

    total = sum(results.values())
    rows = [
        {"term": t, "avg_interest": v, "share_of_search_pct": round(v / total * 100, 2)}
        for t, v in results.items()
    ]
    return pd.DataFrame(rows).sort_values("share_of_search_pct", ascending=False)
```

### Interpreting trends in Share of Search

Track SoS monthly. A brand or ingredient gaining SoS (even if its absolute search volume is small) is a leading indicator of category share growth. For TrendPulse, apply this at the **ingredient/format** level (e.g. "cottage cheese", "birria", "pea protein") to detect which formats are stealing mindshare from established categories.

**Sources:** [Marketing Week — SoS represents 83% of market share](https://www.marketingweek.com/share-of-search-market-share/), [Glimpse Share of Search Guide](https://meetglimpse.com/software-guides/share-of-search/), [Kantar — Demystifying Share of Search](https://www.kantar.com/north-america/Inspiration/Analytics/Demystifying-share-of-search)

---

## 3. Multi-Source Composite Trend Score

### What it measures
No single data source is sufficient. Google Trends captures *intent*; Reddit captures *enthusiasm and discourse depth*; retail velocity captures *commercial proof*. A composite score fuses all three into a single 0–100 signal that is more robust than any individual source.

### The Three-Signal Composite Model

| Signal | Source | What It Captures | Weight |
|---|---|---|---|
| Search Momentum | Google Trends (pytrends) | Consumer intent, query acceleration | 40% |
| Social Buzz Score | Reddit (PRAW) | Engagement depth, sentiment, post velocity | 35% |
| Retail Velocity | Circana / Spins / Retailer data | Commercial proof, unit velocity | 25% |

### Component Formulas

**Signal 1 — Search Momentum Score (SMS)**

Uses the Velocity Score from Section 1 (0–100).

**Signal 2 — Social Buzz Score (SBS)**

```python
import math

def social_buzz_score(
    post_count_30d: int,
    avg_score: float,          # Reddit upvote score average
    avg_comments: float,       # Average comment count
    sentiment_compound: float, # VADER compound score (-1 to +1)
    yoy_post_growth: float     # % growth in post count vs prior year
) -> float:
    """
    Social Buzz Score (0-100) from Reddit signals.
    """
    # Engagement depth: weighted average of score and comments
    engagement = math.log1p(post_count_30d) * (avg_score + avg_comments * 2)
    engagement_norm = min(engagement / 5000, 1.0)

    # Sentiment bonus: positive sentiment amplifies score
    sentiment_norm = (sentiment_compound + 1) / 2  # rescale -1..1 to 0..1

    # Growth signal: YoY post growth
    growth_norm = min(max(yoy_post_growth / 200.0, 0), 1)

    sbs = (0.50 * engagement_norm + 0.30 * growth_norm + 0.20 * sentiment_norm) * 100
    return round(sbs, 1)
```

**Signal 3 — Retail Velocity Score (RVS)**

Retail velocity is dollar or unit sales per store per week ($/store/week). Normalize against category average:

```python
def retail_velocity_score(
    term_velocity: float,       # $/store/week for this trend segment
    category_avg_velocity: float,  # $/store/week for parent category
    yoy_velocity_growth: float  # % YoY change in velocity
) -> float:
    """
    Retail Velocity Score (0-100). Uses indexed velocity vs. category.
    """
    velocity_index = term_velocity / max(category_avg_velocity, 0.01)
    index_norm = min(velocity_index / 3.0, 1.0)  # 3x category avg = max score
    growth_norm = min(max(yoy_velocity_growth / 100.0, 0), 1.0)

    rvs = (0.60 * index_norm + 0.40 * growth_norm) * 100
    return round(rvs, 1)
```

### Composite Trend Score (CTS)

```python
def composite_trend_score(
    search_momentum_score: float,  # 0-100 from Section 1
    social_buzz_score: float,      # 0-100 from above
    retail_velocity_score: float,  # 0-100 from above
    weights: tuple[float, float, float] = (0.40, 0.35, 0.25)
) -> float:
    """
    Weighted composite trend score (0-100).
    Default weights: 40% search, 35% social, 25% retail.
    Retail weight can be set to 0 for pre-launch trends with no retail data.
    """
    w_s, w_r, w_rv = weights
    score = w_s * search_momentum_score + w_r * social_buzz_score + w_rv * retail_velocity_score
    return round(score, 1)
```

### Confidence Weighting (data availability adjustment)

When a signal is unavailable (e.g. no retail data for an emerging ingredient), redistribute its weight proportionally:

```python
def adjust_weights_for_missing(
    available_signals: dict[str, float],  # {"search": 72.0, "social": 58.0}
    default_weights: dict[str, float]     # {"search": 0.40, "social": 0.35, "retail": 0.25}
) -> float:
    total_weight = sum(default_weights[k] for k in available_signals)
    adjusted = {k: default_weights[k] / total_weight for k in available_signals}
    return sum(v * adjusted[k] for k, v in available_signals.items())
```

**Sources:** [Brandwatch CPG Industry Trends](https://www.brandwatch.com/blog/cpg-industry-trends/), [Spate Predictive Analytics](https://www.spate.nyc/blog/predictive-analytics-product-innovation-cpg), [Springer Composite Index Methodology](https://link.springer.com/article/10.1007/s11205-017-1832-9)

---

## 4. Trend Maturity Classification (S-Curve Positioning)

### What it measures
Rogers' Diffusion of Innovations (1962, updated 2003) defines five adopter segments that map to an S-shaped adoption curve. Knowing where a trend sits on that curve determines:
- Whether to build a product now (Early Adopter phase) or wait (Early Majority)
- Whether a trend is too early to size confidently
- Whether a trend has already peaked (Late Majority) and is no longer worth chasing

### Rogers Adopter Segments

| Stage | Population Share | Google Trends Index | Typical Behavior |
|---|---|---|---|
| Innovators | 2.5% | 1–15 | Niche enthusiasts, specialty forums |
| Early Adopters | 13.5% | 15–35 | Influencers, premium channels, food media |
| Early Majority | 34% | 35–65 | Mainstream social media, mid-tier retail |
| Late Majority | 34% | 65–85 | Mass retail, private label entry |
| Laggards | 16% | 85–100 (declining) | Discount channels, commoditized |

*Index thresholds are illustrative; calibrate against category-specific baselines.*

### Maturity Classification Algorithm

```python
from enum import Enum

class TrendStage(str, Enum):
    INNOVATOR    = "innovator"       # Too early — watch, don't build
    EARLY_ADOPTER = "early_adopter"  # Sweet spot for CPG innovation
    EARLY_MAJORITY = "early_majority" # Act now — still time to win
    LATE_MAJORITY  = "late_majority"  # Defend, don't launch new
    LAGGING        = "lagging"        # Avoid — trend declining

def classify_trend_stage(
    current_index: float,   # Google Trends value 0-100
    yoy_growth: float,      # % YoY
    acceleration: float,    # weekly acceleration (second derivative)
    peak_index: float       # highest historical index value
) -> TrendStage:
    """
    Classify a trend's position on the Rogers S-curve.
    """
    pct_of_peak = (current_index / max(peak_index, 1)) * 100

    if current_index < 15 and yoy_growth > 0:
        return TrendStage.INNOVATOR
    elif current_index < 35 and acceleration > 0 and yoy_growth > 15:
        return TrendStage.EARLY_ADOPTER
    elif current_index < 65 and yoy_growth > 5:
        return TrendStage.EARLY_MAJORITY
    elif current_index >= 65 and acceleration >= 0:
        return TrendStage.LATE_MAJORITY
    else:
        return TrendStage.LAGGING
```

### The Chasm — The Most Important Transition Point

Geoffrey Moore's *Crossing the Chasm* identifies the critical gap between Early Adopters (visionaries) and the Early Majority (pragmatists). This is the highest-risk transition:

- Early Adopters accept incomplete products and value novelty
- Early Majority require: proven results, mainstream distribution, competitive pricing, and social proof

**TrendPulse signal for crossing the chasm:**
- Google Trends index moves from 20–35 to 40–55 within a 6-month window
- Reddit discourse shifts from niche subreddits (r/FoodNerds) to mainstream ones (r/Cooking, r/Fitness)
- First mass-market retailer (Walmart, Kroger) lists a product in the category
- A second-tier CPG brand (not just startups) launches a competing SKU

**Sources:** [Wikipedia — Diffusion of Innovations](https://en.wikipedia.org/wiki/Diffusion_of_innovations), [Crossing the Chasm — Wikipedia](https://en.wikipedia.org/wiki/Crossing_the_Chasm), [High Tech Strategies Innovation Curve](https://www.hightechstrategies.com/innovation-adoption-curve/)

---

## 5. Bass Diffusion Model — Demand Forecasting

### What it measures
Frank Bass (1969) derived a mathematical model of how new products spread through a population via two mechanisms: **innovation** (people adopt independently, driven by advertising/awareness) and **imitation** (people adopt after seeing others do it — word of mouth). This is the gold standard for pre-launch demand forecasting in CPG.

### Core Differential Equation

```
dN(t)/dt = [p + q × (N(t)/M)] × (M - N(t))
```

Where:
- `N(t)` = cumulative adopters at time t
- `M` = total market potential (total addressable adopters)
- `p` = coefficient of innovation (typically 0.001–0.03 for CPG)
- `q` = coefficient of imitation (typically 0.1–0.5 for CPG)
- `dN(t)/dt` = new adopters in period t

### Key Outputs

**Cumulative adoption:**
```
F(t) = [p × (e^((p+q)t) - 1)] / [p × e^((p+q)t) + q]
```

**Period adoption (new adopters each period):**
```
f(t) = [e^((p+q)t) × p × (p+q)^2] / [p × e^((p+q)t) + q]^2
```

**Peak sales timing:**
```
t* = ln(q/p) / (p + q)
```

This tells you when the trend will hit maximum adoption rate — a critical input to launch timing.

### Parameter Estimation from Historical Analogues

When you have no sales data for a truly new product, use analogous category data. A regression form makes estimation tractable:

```
s(t) = β₀ + β₁·S(t) + β₂·S(t)²

Recovery:
  m = (-β₁ ± √(β₁² - 4β₀β₂)) / (2β₂)
  p = β₀ / m
  q = -m × β₂
```

### Python Implementation

```python
import numpy as np
from scipy.optimize import curve_fit
from scipy.integrate import odeint
import pandas as pd

def bass_model_ode(N: float, t: float, p: float, q: float, M: float) -> float:
    """ODE form of Bass model."""
    return (p + q * N / M) * (M - N)

def bass_cumulative(t: np.ndarray, p: float, q: float, M: float) -> np.ndarray:
    """Cumulative adoption at each time point."""
    F = (p * (np.exp((p + q) * t) - 1)) / (p * np.exp((p + q) * t) + q)
    return M * F

def bass_period_sales(t: np.ndarray, p: float, q: float, M: float) -> np.ndarray:
    """New adopters per period (sales forecast)."""
    numerator = np.exp((p + q) * t) * p * (p + q) ** 2
    denominator = (p * np.exp((p + q) * t) + q) ** 2
    return M * (numerator / denominator)

def fit_bass_model(
    time_periods: np.ndarray,
    observed_sales: np.ndarray,
    M_guess: float | None = None
) -> dict:
    """
    Fit Bass model to observed sales data using nonlinear least squares.

    Args:
        time_periods: Array of time indices (e.g. [0, 1, 2, ...])
        observed_sales: Array of period sales observations
        M_guess: Initial guess for market potential (defaults to 2x total observed)

    Returns:
        dict with keys: p, q, M, peak_period, forecast_5yr
    """
    if M_guess is None:
        M_guess = observed_sales.sum() * 2

    try:
        popt, _ = curve_fit(
            bass_period_sales,
            time_periods,
            observed_sales,
            p0=[0.01, 0.3, M_guess],
            bounds=([0.001, 0.01, M_guess * 0.5], [0.1, 0.9, M_guess * 5]),
            maxfev=10000
        )
        p, q, M = popt
    except RuntimeError:
        # Fallback: use regression approach
        cum_sales = np.cumsum(observed_sales)
        X = np.column_stack([cum_sales, cum_sales ** 2])
        from sklearn.linear_model import LinearRegression
        reg = LinearRegression().fit(X, observed_sales)
        b0, b1, b2 = reg.intercept_, reg.coef_[0], reg.coef_[1]
        disc = b1 ** 2 - 4 * b0 * b2
        M = (-b1 + np.sqrt(max(disc, 0))) / (2 * b2)
        p = b0 / M
        q = -M * b2

    peak_period = np.log(q / p) / (p + q)
    forecast_t = np.arange(len(time_periods), len(time_periods) + 5 * 52)
    forecast = bass_period_sales(forecast_t, p, q, M)

    return {
        "p": round(p, 4),
        "q": round(q, 4),
        "M": round(M),
        "peak_period": round(peak_period, 1),
        "forecast_5yr": forecast.tolist()
    }

def peak_sales_timing(p: float, q: float) -> float:
    """Return the time period at which adoption rate peaks."""
    return np.log(q / p) / (p + q)
```

### Typical CPG Parameter Ranges

| Category | p (innovation) | q (imitation) | Notes |
|---|---|---|---|
| Food/Beverage new format | 0.001–0.010 | 0.20–0.45 | High imitation, low innovation coefficient |
| Functional/health food | 0.005–0.015 | 0.15–0.35 | Driven partly by media |
| Novel protein (plant-based) | 0.003–0.012 | 0.25–0.50 | Strong word-of-mouth |
| Consumer electronics | 0.001–0.003 | 0.30–0.60 | High social contagion |

Rule of thumb: if `q >> p`, the trend will spread mainly through word-of-mouth and social proof — classic for food trends. Peak occurs before 50% market penetration when `q > p`.

### Applying to Google Trends Data

When no retail sales data exists, proxy `observed_sales` with Google Trends index values. The shape (not scale) of the curve is still valid for estimating p, q, and peak timing.

**Sources:** [Bass Diffusion Model — GeeksforGeeks](https://www.geeksforgeeks.org/machine-learning/bass-diffusion-model/), [Bass Model Chapter — Das MLBook](https://srdas.github.io/MLBook/productForecastingBassModel.html), [Wikipedia — Bass Diffusion Model](https://en.wikipedia.org/wiki/Bass_diffusion_model), [PyMC Marketing Bass Example](https://www.pymc-marketing.io/en/stable/notebooks/bass/bass_example.html)

---

## 6. Ulwick Opportunity Algorithm — Unmet Need Scoring

### What it measures
Tony Ulwick's Outcome-Driven Innovation (ODI) framework operationalizes the Jobs-to-Be-Done theory with quantitative survey data. The **Opportunity Algorithm** identifies which consumer desired outcomes are *most important* yet *least satisfied* — defining the white space for innovation.

### Formula

```
Opportunity Score = Importance + max(Importance - Satisfaction, 0)
```

- **Importance** and **Satisfaction** are measured on 1–10 survey scales
- The `max()` function prevents over-satisfied outcomes from dragging score down
- The formula double-weights importance while penalizing the satisfaction gap

### Scoring Interpretation

| Opportunity Score | Interpretation | Action |
|---|---|---|
| 15–20 | Critical white space | Immediate priority for innovation |
| 12–14 | Strong opportunity | Build business case |
| 9–11 | Moderate opportunity | Monitor or differentiate |
| Below 9 | Low priority | Over-served or unimportant |

### Python Implementation

```python
from dataclasses import dataclass

@dataclass
class DesiredOutcome:
    name: str
    importance: float   # 1-10 (survey average)
    satisfaction: float # 1-10 (survey average)

    @property
    def opportunity_score(self) -> float:
        return self.importance + max(self.importance - self.satisfaction, 0)

    @property
    def segment(self) -> str:
        score = self.opportunity_score
        if score >= 15:
            return "critical_white_space"
        elif score >= 12:
            return "strong_opportunity"
        elif score >= 9:
            return "moderate_opportunity"
        return "low_priority"

def rank_opportunities(outcomes: list[DesiredOutcome]) -> list[dict]:
    return sorted(
        [
            {
                "name": o.name,
                "importance": o.importance,
                "satisfaction": o.satisfaction,
                "opportunity_score": o.opportunity_score,
                "segment": o.segment
            }
            for o in outcomes
        ],
        key=lambda x: x["opportunity_score"],
        reverse=True
    )
```

### Adapting ODI for TrendPulse (without primary surveys)

When primary survey data isn't available, proxy Importance and Satisfaction from:

| ODI Dimension | TrendPulse Proxy |
|---|---|
| Importance | Google Trends index + Reddit post volume (normalized 1–10) |
| Satisfaction | Inverse of negative sentiment ratio from product reviews + Reddit complaints (normalized 1–10) |

```python
def proxy_importance(trends_index: float, reddit_volume_norm: float) -> float:
    """Proxy importance from search + social volume (1-10 scale)."""
    combined = 0.6 * (trends_index / 10) + 0.4 * reddit_volume_norm * 10
    return min(max(combined, 1), 10)

def proxy_satisfaction(
    negative_review_ratio: float,  # 0-1 (fraction of reviews with < 3 stars)
    complaint_mention_ratio: float  # 0-1 (fraction of posts expressing frustration)
) -> float:
    """Proxy satisfaction from inverse of complaint signals (1-10 scale)."""
    dissatisfaction = 0.5 * negative_review_ratio + 0.5 * complaint_mention_ratio
    return round(10 * (1 - dissatisfaction), 1)
```

**Sources:** [Ulwick ODI — Strategyn](https://strategyn.com/jobs-to-be-done/), [Opportunity Scoring — RoadmapOne](https://roadmap.one/blog/posts/blog8-8-opportunity-scoring/), [The Opportunity Algorithm — Marketing Journal](https://www.marketingjournal.org/the-path-to-growth-the-opportunity-algorithm-anthony-ulwick/)

---

## 7. White Space Analysis — Market Gap Detection

### What it measures
White space = the intersection of (a) high consumer desire, (b) low competitive supply, and (c) brand credibility. It is structured opportunity, not a blank canvas. The framework identifies where Tyson has a manufacturable, on-brand path into an underserved trend.

### The Three-Lens White Space Framework (Brand Consultancy adaptation)

**Lens 1 — Consumer Needs**
Map what consumers want that existing products don't deliver:
- Functional unmet needs: nutrition profile, convenience, price point, format
- Emotional unmet needs: indulgence without guilt, belonging, clean label, adventure

**Lens 2 — Cultural Shifts**
Identify macro forces reshaping expectations (these sustain trends past fads):
- Health & wellness (GLP-1 diet, high protein, fiber)
- Sustainability (lower carbon protein, reduced waste)
- Convenience (heat-and-eat, portable protein)
- Flavor adventure (global cuisines crossing into mainstream protein)

**Lens 3 — Competitive Absences**
Map the gaps in the competitive landscape:
- Where are Tyson's direct competitors NOT playing?
- Where are startups winning but without scale?
- Where is retailer private label absent or weak?

### White Space Scoring Matrix

Rate each opportunity on five dimensions (1–5 scale each):

| Dimension | Definition | Data Source |
|---|---|---|
| Consumer Demand | Trend Composite Score percentile | TrendPulse CTS |
| Competitive Density | Inverse of # of established SKUs in the space | Retailer data |
| Brand Permission | Tyson brand equity stretch (can we credibly own this?) | Brand scoring |
| Manufacturing Fit | Proximity to existing Tyson production capabilities | Internal |
| Retail Readiness | Category buyer appetite, shelf adjacency | Retailer discussions |

```python
def white_space_score(
    consumer_demand: float,    # 1-5
    competitive_density: float, # 1-5 (5 = very low competition)
    brand_permission: float,   # 1-5
    manufacturing_fit: float,  # 1-5
    retail_readiness: float    # 1-5
) -> float:
    """
    White Space Score (0-100) using equal weighting across 5 lenses.
    """
    raw = (consumer_demand + competitive_density + brand_permission +
           manufacturing_fit + retail_readiness) / 25.0  # max = 25
    return round(raw * 100, 1)
```

### Visualization: Perceptual Map / Bubble Chart

Plot opportunities as bubbles where:
- X-axis = Trend Velocity Score (consumer demand growth)
- Y-axis = Brand Permission Score
- Bubble size = Estimated Market Size (TAM)
- Color = Trend Stage (Innovator / Early Adopter / Early Majority)

High-right large bubbles = highest priority white spaces.

**Sources:** [Brand Consultancy — White Space Framework](https://www.thebrandconsultancy.com/blog/a-framework-for-finding-white-space-and-unlocking-growth-in-cpg), [Spate CPG Predictive Analytics](https://www.spate.nyc/blog/predictive-analytics-product-innovation-cpg), [Blitzllama Gap Analysis Frameworks](https://www.blitzllama.com/blog/gap-analysis-tools-frameworks)

---

## 8. TAM / SAM / SOM Market Sizing

### What it measures
Market sizing translates a trend signal into a dollar opportunity. The TAM/SAM/SOM hierarchy moves from theoretical maximum to realistically capturable revenue.

### Definitions and Formulas

**Total Addressable Market (TAM)**
The entire market if Tyson had 100% share with no constraints.

```
TAM = Total US population × % who would ever buy this product category
    × Average annual spend per buyer
```

Or from top-down: Use published market research (IRI, Circana, Mintel) for the parent category.

**Serviceable Available Market (SAM)**
The portion Tyson can realistically target given its distribution, channels, and price points.

```
SAM = TAM × (Tyson's addressable channel coverage %)
         × (% of consumers in Tyson's income/demographic target)
```

**Serviceable Obtainable Market (SOM)**
What Tyson can actually capture in Years 1–3 given competition.

```
SOM = SAM × (Tyson's realistic market share %)
         × (Expected distribution penetration %)
```

### Bottom-Up Sizing from Search Data

When no published category data exists for a truly new trend:

```
Estimated Annual Buyers = (Monthly Search Volume × 0.15) × 12
                           [15% conversion from search to purchase — calibrate per category]

Estimated Category Value = Estimated Annual Buyers × Average Unit Price × Purchase Frequency
```

```python
def estimate_tam_from_search(
    monthly_search_volume: int,     # Absolute monthly searches (from Glimpse or Keyword Planner)
    search_to_buyer_rate: float,    # Estimated % of searchers who purchase (default 0.12)
    avg_unit_price: float,          # Estimated retail price per unit ($)
    purchase_frequency: float       # Average annual purchases per buyer
) -> dict:
    """
    Bottom-up TAM estimate from search volume.
    Use when no Circana/IRI category data is available.
    """
    annual_buyers = monthly_search_volume * search_to_buyer_rate * 12
    tam = annual_buyers * avg_unit_price * purchase_frequency
    return {
        "estimated_annual_buyers": int(annual_buyers),
        "estimated_tam_usd": round(tam),
        "assumptions": {
            "search_to_buyer_rate": search_to_buyer_rate,
            "avg_unit_price": avg_unit_price,
            "purchase_frequency": purchase_frequency
        }
    }

def estimate_som(
    sam_usd: float,
    target_market_share_pct: float,      # e.g. 5.0 for 5%
    distribution_penetration_pct: float  # e.g. 60.0 for 60% ACV
) -> float:
    """Realistically obtainable market size in dollars."""
    return sam_usd * (target_market_share_pct / 100) * (distribution_penetration_pct / 100)
```

### Sizing Confidence Tiers

| Evidence Level | Sizing Approach | Confidence |
|---|---|---|
| Circana/IRI category data available | Direct from syndicated data | High |
| Keyword Planner + price data | Bottom-up from search volume | Medium |
| Google Trends only (no absolute volume) | Analogous category proxy | Low |
| Pure trend signal (no commercial data) | Order of magnitude estimate | Directional only |

### Analogue-Based Sizing

For truly novel trends, find a comparable trend that already matured and use its peak sales as a ceiling:

```python
def analogue_sizing(
    current_trend_index: float,  # Google Trends 0-100
    analogue_peak_index: float,
    analogue_peak_sales_usd: float,
    analogue_market_share: float  # Tyson's expected share vs. analogue brand's peak share
) -> float:
    """Scale opportunity based on a comparable trend's peak performance."""
    index_ratio = current_trend_index / max(analogue_peak_index, 1)
    return analogue_peak_sales_usd * index_ratio * analogue_market_share
```

**Sources:** [Antler — TAM SAM SOM](https://www.antler.co/blog/tam-sam-som), [HG Insights — Complete Guide to Market Sizing](https://hginsights.com/blog/tam-sam-som-the-complete-guide-to-market-sizing/), [Seer Interactive Market Sizing](https://www.seerinteractive.com/insights/marketing-sizing-with-tam-sam-som)

---

## 9. Consumer Sentiment NLP Scoring

### What it measures
Sentiment scoring transforms qualitative Reddit posts, reviews, and social content into quantitative signals: How positively or negatively are consumers talking about a trend? What specific pain points or desires are driving it?

### Tool Selection

| Tool | Best For | Limitations |
|---|---|---|
| **VADER** | Reddit, Twitter, short informal text | Struggles with sarcasm, domain-specific terms |
| **TextBlob** | General text, polarity + subjectivity | Less calibrated for social media slang |
| **transformers (DistilBERT)** | High accuracy, domain-fine-tuned | Slower, requires GPU for large datasets |

For TrendPulse at scale, VADER is the recommended default. DistilBERT can be used for weekly batch re-scoring of high-priority trends.

### VADER Compound Score

VADER outputs:
- `pos`: fraction of text with positive valence
- `neg`: fraction with negative valence
- `neu`: fraction neutral
- `compound`: normalized score from -1 (maximally negative) to +1 (maximally positive)

```python
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
import pandas as pd

analyzer = SentimentIntensityAnalyzer()

def score_post(text: str) -> dict:
    scores = analyzer.polarity_scores(text)
    return {
        "compound": scores["compound"],
        "positive": scores["pos"],
        "negative": scores["neg"],
        "label": "positive" if scores["compound"] >= 0.05
                 else "negative" if scores["compound"] <= -0.05
                 else "neutral"
    }

def aggregate_sentiment(posts: list[dict]) -> dict:
    """
    Aggregate sentiment across a batch of Reddit posts.
    Each post dict must have 'title', 'body', 'score' (upvotes), 'num_comments'.
    """
    results = []
    for post in posts:
        text = f"{post['title']} {post.get('body', '')}"
        sentiment = score_post(text)
        # Weight by engagement (upvote-weighted sentiment)
        weight = max(post.get('score', 1), 1) + post.get('num_comments', 0) * 2
        results.append({**sentiment, "weight": weight})

    df = pd.DataFrame(results)
    total_weight = df["weight"].sum()

    return {
        "weighted_compound": (df["compound"] * df["weight"]).sum() / total_weight,
        "pct_positive": (df["label"] == "positive").mean() * 100,
        "pct_negative": (df["label"] == "negative").mean() * 100,
        "pct_neutral": (df["label"] == "neutral").mean() * 100,
        "post_count": len(df)
    }
```

### TextBlob Subjectivity Filter

TextBlob's subjectivity score (0 = objective, 1 = subjective) is useful for filtering out news/press release reposts vs. genuine consumer opinion:

```python
from textblob import TextBlob

def filter_for_consumer_voice(posts: list[dict], min_subjectivity: float = 0.3) -> list[dict]:
    """Keep only posts with enough subjectivity to reflect consumer opinion."""
    filtered = []
    for post in posts:
        blob = TextBlob(f"{post['title']} {post.get('body', '')}")
        if blob.sentiment.subjectivity >= min_subjectivity:
            filtered.append(post)
    return filtered
```

### Aspect-Based Sentiment for Trend Insight Extraction

Beyond overall sentiment, extract which specific aspects consumers care about:

```python
FOOD_ASPECTS = {
    "taste":        ["taste", "flavor", "delicious", "yummy", "bland", "disgusting"],
    "health":       ["protein", "calories", "clean", "healthy", "organic", "processed"],
    "convenience":  ["easy", "quick", "prep", "meal prep", "ready", "simple"],
    "price":        ["expensive", "cheap", "affordable", "worth it", "overpriced"],
    "texture":      ["texture", "crispy", "chewy", "soft", "mushy", "crunchy"],
}

def aspect_sentiment(text: str) -> dict[str, float]:
    """Return compound sentiment score for each food aspect mentioned."""
    text_lower = text.lower()
    result = {}
    for aspect, keywords in FOOD_ASPECTS.items():
        if any(kw in text_lower for kw in keywords):
            # Extract surrounding context window for scoring
            for kw in keywords:
                idx = text_lower.find(kw)
                if idx >= 0:
                    window = text[max(0, idx-50): idx+100]
                    result[aspect] = analyzer.polarity_scores(window)["compound"]
                    break
    return result
```

**Sources:** [Brand24 — Reddit Sentiment Analysis](https://brand24.com/blog/reddit-sentiment-analysis/), [AltexSoft — Sentiment Analysis Methods](https://www.altexsoft.com/blog/sentiment-analysis-methods/), [Neptune.ai — TextBlob vs VADER vs Flair](https://neptune.ai/blog/sentiment-analysis-python-textblob-vs-vader-vs-flair)

---

## 10. Launch Timing Framework — Crossing the Chasm

### What it measures
A trend that is too early will fail in mainstream retail; too late and margins are competed away. The optimal launch window is typically when a trend is in Late Early Adopter to Early Early Majority stage — enough proof of concept to convince retail buyers, but before the category is crowded.

### The Timing Decision Matrix

| Trend Stage | Google Trends Index | Recommended Action |
|---|---|---|
| Innovator (< 15) | < 15 | Watch only. Track on 6-month refresh. |
| Early Adopter (15–35) | 15–35 | Incubate. Run limited tests. File for ingredient/format IP. |
| **LAUNCH WINDOW** | **30–55** | **Develop and launch. This is the sweet spot.** |
| Early Majority (55–70) | 55–70 | Launch if development is complete. Margin pressure starting. |
| Late Majority (> 70) | > 70 | Defend existing position. Don't build new. |
| Declining | Falling | Divest or ignore. |

### Quantitative Launch Window Signals

A trend is in the **optimal launch window** when ALL of the following are true:

1. **Trend index** is between 25–60 (growing but not yet mainstream)
2. **YoY growth** > 30% for at least 2 consecutive years
3. **Acceleration** is positive (growth is speeding up, not slowing)
4. **Bass model `t*`** (peak sales timing) is estimated to be 18–48 months out (enough runway to build and launch before peak)
5. **Chasm indicators present:** At least one major chain has trialed the category, Reddit discourse exists in mainstream food subreddits, and a second-tier CPG (not just DTC startup) has entered the space.

```python
def is_in_launch_window(
    trend_index: float,
    yoy_growth: float,
    acceleration: float,
    bass_peak_months_out: float,
    chasm_signals_present: bool
) -> dict:
    """
    Determine if a trend is in the optimal CPG launch window.
    Returns a dict with boolean result and reason for each criterion.
    """
    criteria = {
        "index_in_range":      25 <= trend_index <= 60,
        "strong_yoy_growth":   yoy_growth >= 30,
        "positive_acceleration": acceleration > 0,
        "sufficient_runway":   18 <= bass_peak_months_out <= 48,
        "chasm_signals":       chasm_signals_present
    }
    passed = sum(criteria.values())
    return {
        "in_launch_window": passed >= 4,  # require 4 of 5
        "score": passed,
        "criteria": criteria,
        "recommendation": (
            "LAUNCH NOW" if passed == 5
            else "STRONG CANDIDATE" if passed == 4
            else "WATCH" if passed >= 3
            else "TOO EARLY OR TOO LATE"
        )
    }
```

### Tyson-Specific Timing Adjustments

Tyson's innovation cycle is approximately 18–24 months from brief to shelf. Work backwards from the desired retail launch date:

- If trend is in **Early Adopter stage today**: Greenlight innovation development now. Target launch when trend enters Early Majority (Google Trends 40–55).
- If trend is **already in Early Majority**: Compress timeline or pursue a fast-follow strategy (co-manufacture/white label) to get to shelf within 9–12 months.
- If trend is **at Late Majority**: Skip or acquire a startup already at scale rather than building from scratch.

**Sources:** [Crossing the Chasm — Wikipedia](https://en.wikipedia.org/wiki/Crossing_the_Chasm), [itonics — Mastering New Product Adoption](https://www.itonics-innovation.com/blog/new-product-adoption), [Business-to-You — Crossing the Chasm Explained](https://www.business-to-you.com/crossing-the-chasm-technology-adoption-life-cycle/)

---

## 11. Tyson Portfolio Fit Scoring (5-Dimension)

### What it measures
Even a strong trend may not be the right opportunity for Tyson. This framework quantifies strategic fit across five dimensions that determine whether Tyson can win in a given space.

### Scoring Dimensions and Weights

| Dimension | Weight | Definition | Key Questions |
|---|---|---|---|
| Manufacturing Adjacency | 25% | How close is this to existing Tyson production capabilities? | Can we make this on existing lines? New capital required? |
| Brand Permission | 20% | Does a Tyson brand have credibility and equity here? | Would consumers accept this from Tyson/Jimmy Dean/Aidells etc.? |
| Channel Readiness | 15% | Are retail buyers and channels ready to shelf this? | Has the category been proven in mainstream retail? |
| Competitive Density | 20% | How crowded is the competitive field? | Is this space still winnably open? (inverted — lower density = higher score) |
| Trend Momentum | 20% | How strong and durable is the underlying trend? | Composite Trend Score from Section 3 |

### Scoring Rubrics

**Manufacturing Adjacency (1–5)**
- 5: Uses existing lines with minor modification (e.g. new sauce on chicken strips)
- 4: Same protein, new format (e.g. chicken in a new breading/cut)
- 3: Adjacent protein, existing lines (e.g. pork to turkey)
- 2: New protein, significant capital investment required
- 1: Requires entirely new manufacturing platform

**Brand Permission (1–5)**
- 5: Tyson/Jimmy Dean/Ball Park directly owns this territory already
- 4: Clear adjacent territory with strong equity transfer
- 3: Possible with new sub-brand or brand stretch
- 2: Significant stretch — would need new brand or partnership
- 1: Outside any Tyson brand's credible territory

**Channel Readiness (1–5)**
- 5: Category proven in mass retail (Walmart, Kroger, Target); buyers actively sourcing
- 4: Present in premium/specialty; expanding to conventional
- 3: Food service proven; retail trial underway
- 2: DTC/online only; limited retail presence
- 1: No established channel; entirely new category to retail buyers

**Competitive Density (1–5, inverted)**
- 5: No established players; truly open white space
- 4: 1–2 startups but no scaled CPG competitor
- 3: 2–4 midsize players; category developing
- 2: 1–2 large CPG companies have entered
- 1: Highly competitive; major players with established share

**Trend Momentum (1–5)**
- Convert Composite Trend Score (0–100) to 1–5: `ceil(CTS / 20)`

### Portfolio Fit Score Calculation

```python
from dataclasses import dataclass

@dataclass
class PortfolioFitScore:
    manufacturing_adjacency: float  # 1-5
    brand_permission: float         # 1-5
    channel_readiness: float        # 1-5
    competitive_density: float      # 1-5 (5 = low competition)
    trend_momentum: float           # 1-5

    WEIGHTS = {
        "manufacturing_adjacency": 0.25,
        "brand_permission": 0.20,
        "channel_readiness": 0.15,
        "competitive_density": 0.20,
        "trend_momentum": 0.20
    }

    @property
    def total_score(self) -> float:
        raw = (
            self.manufacturing_adjacency * self.WEIGHTS["manufacturing_adjacency"] +
            self.brand_permission * self.WEIGHTS["brand_permission"] +
            self.channel_readiness * self.WEIGHTS["channel_readiness"] +
            self.competitive_density * self.WEIGHTS["competitive_density"] +
            self.trend_momentum * self.WEIGHTS["trend_momentum"]
        )
        return round((raw / 5) * 100, 1)  # normalize to 0-100

    @property
    def priority_tier(self) -> str:
        s = self.total_score
        if s >= 75:
            return "PRIORITY_1"   # Fast-track to brief
        elif s >= 55:
            return "PRIORITY_2"   # Include in quarterly review
        elif s >= 40:
            return "PRIORITY_3"   # Watch list
        return "DEPRIORITIZE"
```

### Brand Mapping to Trend Types

| Tyson Brand | Credible Innovation Territories |
|---|---|
| **Tyson** | Chicken format innovation, frozen meals, global flavors on chicken, high-protein snacking |
| **Jimmy Dean** | Breakfast protein innovation, high-protein snacks, better-for-you breakfast, plant-protein breakfast |
| **Ball Park** | Grilling innovation, game-day snacking, better hot dogs, portable protein |
| **Hillshire Farm** | Snacking platforms, charcuterie-adjacent, premium deli, lunch solutions |
| **Aidells** | Premium sausage, international flavors, clean label protein, meatball innovation |

---

## 12. Putting It All Together — The TrendPulse Pipeline

### End-to-End Scoring Flow

```
For each keyword/trend in the 80-term universe:
│
├── INGESTION
│   ├── Google Trends: interest_over_time() via pytrends
│   ├── Reddit: PRAW search across tracked subreddits
│   └── Keyword Planner: monthly search volume (absolute)
│
├── SIGNAL COMPUTATION (src/intelligence/trend_detection.py)
│   ├── velocity_score()              → Section 1
│   ├── compute_yoy()                 → Section 1
│   ├── compute_acceleration()        → Section 1
│   ├── share_of_search()             → Section 2
│   ├── social_buzz_score()           → Section 3
│   └── composite_trend_score()       → Section 3
│
├── CLASSIFICATION (src/intelligence/trend_detection.py)
│   └── classify_trend_stage()        → Section 4 (Rogers S-curve position)
│
├── SIZING (src/scoring/sizing.py)
│   ├── fit_bass_model()              → Section 5 (peak timing + forecast)
│   ├── estimate_tam_from_search()    → Section 8
│   └── estimate_som()                → Section 8
│
├── OPPORTUNITY SCORING (src/scoring/portfolio_fit.py)
│   ├── proxy_importance()            → Section 6 (Ulwick ODI adaptation)
│   ├── proxy_satisfaction()          → Section 6
│   ├── DesiredOutcome.opportunity_score → Section 6
│   ├── white_space_score()           → Section 7
│   └── PortfolioFitScore.total_score → Section 11
│
├── TIMING DECISION
│   └── is_in_launch_window()         → Section 10
│
└── OUTPUT
    ├── BigQuery: trend_signals, opportunity_scores
    └── Brief generation (src/briefs/)
```

### Priority Score — The Final Rank

Combine all scores into a single ranking metric used to prioritize which trends get a full opportunity brief:

```python
def priority_score(
    composite_trend_score: float,  # 0-100, Section 3
    opportunity_score_norm: float, # 0-100, normalize Ulwick 0-20 to 0-100
    portfolio_fit_score: float,    # 0-100, Section 11
    market_size_score: float,      # 0-100, log(SOM_$) normalized
    timing_score: float            # 0-100, Section 10 (5 criteria → 20 pts each)
) -> float:
    """
    Final priority score (0-100) for opportunity ranking.
    Weights are configurable in config/settings.yaml.
    """
    return round(
        0.25 * composite_trend_score +
        0.20 * opportunity_score_norm +
        0.25 * portfolio_fit_score +
        0.20 * market_size_score +
        0.10 * timing_score,
        1
    )
```

### Calibration Benchmarks

Use these to validate that scores are sensibly distributed:
- A trend like "birria tacos" at peak (2022–2023) should score ~70–80 CTS, Early Majority stage
- A trend like "cottage cheese protein bowls" (2023–2024) should score ~55–70 CTS, Late Early Adopter → Early Majority
- A fading trend like "cauliflower pizza crust" (2024+) should classify as Late Majority or Declining
- A nascent trend like "mycoprotein breakfast" (2025) should score ~30–45 CTS, Innovator/Early Adopter

---

## Quick Reference: Formula Cheat Sheet

| Formula | Variables | Section |
|---|---|---|
| `Velocity = Interest(t) - Interest(t-1)` | Interest = Google Trends 0-100 | 1 |
| `Acceleration = Velocity(t) - Velocity(t-1)` | | 1 |
| `YoY = (I(t) - I(t-52)) / I(t-52) × 100` | Weekly data | 1 |
| `SoS = Brand_Vol / Total_Vol × 100` | Any volume metric | 2 |
| `CTS = 0.40×SMS + 0.35×SBS + 0.25×RVS` | All normalized 0-100 | 3 |
| `dN/dt = (p + q×N/M) × (M-N)` | Bass diffusion | 5 |
| `t* = ln(q/p) / (p+q)` | Peak sales timing | 5 |
| `Opportunity = I + max(I-S, 0)` | I=Importance, S=Satisfaction | 6 |
| `SOM = SAM × share% × ACV%` | Market sizing | 8 |
| `PFS = Σ(weight_i × dimension_i) / 5 × 100` | Portfolio fit | 11 |
| `Priority = 0.25×CTS + 0.20×Opp + 0.25×PFS + 0.20×Size + 0.10×Timing` | Final rank | 12 |

---

## Key Sources

- [Marketing Week — Share of Search represents 83% of market share](https://www.marketingweek.com/share-of-search-market-share/)
- [Kantar — Demystifying Share of Search](https://www.kantar.com/north-america/Inspiration/Analytics/Demystifying-share-of-search)
- [Glimpse — Share of Search Methodology](https://meetglimpse.com/software-guides/share-of-search/)
- [Bass Diffusion Model — GeeksforGeeks](https://www.geeksforgeeks.org/machine-learning/bass-diffusion-model/)
- [Das ML Book — Bass Model Chapter](https://srdas.github.io/MLBook/productForecastingBassModel.html)
- [Wikipedia — Bass Diffusion Model](https://en.wikipedia.org/wiki/Bass_diffusion_model)
- [PyMC Marketing — Bass Example](https://www.pymc-marketing.io/en/stable/notebooks/bass/bass_example.html)
- [Strategyn — Outcome-Driven Innovation](https://strategyn.com/jobs-to-be-done/)
- [RoadmapOne — Opportunity Scoring Algorithm](https://roadmap.one/blog/posts/blog8-8-opportunity-scoring/)
- [Marketing Journal — Ulwick Opportunity Algorithm](https://www.marketingjournal.org/the-path-to-growth-the-opportunity-algorithm-anthony-ulwick/)
- [Wikipedia — Diffusion of Innovations (Rogers)](https://en.wikipedia.org/wiki/Diffusion_of_innovations)
- [Wikipedia — Crossing the Chasm](https://en.wikipedia.org/wiki/Crossing_the_Chasm)
- [Brand Consultancy — White Space in CPG](https://www.thebrandconsultancy.com/blog/a-framework-for-finding-white-space-and-unlocking-growth-in-cpg)
- [Antler — TAM SAM SOM Guide](https://www.antler.co/blog/tam-sam-som)
- [HG Insights — Complete Market Sizing Guide](https://hginsights.com/blog/tam-sam-som-the-complete-guide-to-market-sizing/)
- [Brand24 — Reddit Sentiment Analysis](https://brand24.com/blog/reddit-sentiment-analysis/)
- [Neptune.ai — Sentiment Analysis Comparison](https://neptune.ai/blog/sentiment-analysis-python-textblob-vs-vader-vs-flair)
- [Spate — Predictive Analytics for CPG](https://www.spate.nyc/blog/predictive-analytics-product-innovation-cpg)
- [BCG — Innovation Wake-Up Call for CPG](https://www.bcg.com/publications/2023/innovation-wake-up-call-for-cpg-businesses)
- [Pinnvalor — Smart Trend Analysis Toolkit](https://www.pinnvalor.com/Smart-Trend-Analysis-A-Toolkit-with-YOY-CAGR-and-Indexing-Explained)
- [Springer — Composite Index Methodology](https://link.springer.com/article/10.1007/s11205-017-1832-9)
