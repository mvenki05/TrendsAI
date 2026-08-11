"""
TrendLens — Trend math.

Smarter analysis of a weekly Google Trends interest series (0-100, oldest→newest)
than a single YoY number. Pure computation — no new data, no APIs.

Adds:
  - spike guard: ignore % growth off a tiny baseline (the "+2040%" artifact)
  - acceleration: is the trend still climbing, or maturing/peaking?
  - volatility: jumpy series => fad-like, not durable
  - a single classification: rising-accelerating / rising-maturing / volatile-fad /
    declining / flat / low-base / no-data

`analyze(series)` returns a dict of these. Designed to slot into map_searches /
discover validation without changing what's already stored.
"""

import statistics

MIN_BASE = 5.0       # baseline interest below this => % growth is unreliable
RISING_YOY = 15.0    # YoY % to count as rising
HIGH_VOLATILITY = 0.6  # week-over-week noise ratio above this => fad-like


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def analyze(series: list[int]) -> dict:
    """Return rich trend metrics for a weekly interest series (oldest→newest)."""
    vals = [float(v) for v in series if v is not None]
    n = len(vals)
    if n < 8:
        return {"classification": "no-data", "has_data": bool(vals),
                "current": int(round(_mean(vals[-4:]))) if vals else None,
                "yoy_growth": None, "acceleration": None, "volatility": None, "low_base": False}

    current = _mean(vals[-4:])
    baseline = _mean(vals[:4])
    low_base = baseline < MIN_BASE
    yoy = round((current / baseline - 1) * 100, 1) if baseline > 0 else None

    # Acceleration: recent momentum vs earlier momentum, using quarter means of the series.
    q = max(1, n // 4)
    q1, q2, q3, q4 = _mean(vals[:q]), _mean(vals[q:2 * q]), _mean(vals[2 * q:3 * q]), _mean(vals[-q:])
    recent_momentum = q4 - q3
    earlier_momentum = q2 - q1
    acceleration = round(recent_momentum - earlier_momentum, 2)

    # Volatility: avg absolute week-over-week change relative to the mean level.
    diffs = [abs(vals[i] - vals[i - 1]) for i in range(1, n)]
    level = _mean(vals) or 1.0
    volatility = round(_mean(diffs) / level, 2)

    # Classification.
    if low_base:
        cls = "low-base (unreliable %)"
    elif volatility >= HIGH_VOLATILITY and yoy is not None and yoy >= RISING_YOY:
        cls = "volatile / fad-like"
    elif yoy is not None and yoy >= RISING_YOY:
        cls = "rising — accelerating" if acceleration > 0 else "rising — maturing"
    elif yoy is not None and yoy <= -RISING_YOY:
        cls = "declining"
    else:
        cls = "flat"

    return {
        "classification": cls,
        "has_data": current > 0,
        "current": int(round(current)),
        "baseline": int(round(baseline)),
        "yoy_growth": yoy,
        "acceleration": acceleration,   # >0 climbing faster, <0 slowing
        "volatility": volatility,        # higher = jumpier / more fad-like
        "low_base": low_base,
        "is_rising": bool(yoy is not None and yoy >= RISING_YOY and not low_base),
        "is_durable": bool(yoy is not None and yoy >= RISING_YOY and not low_base
                           and volatility < HIGH_VOLATILITY and acceleration >= 0),
    }
