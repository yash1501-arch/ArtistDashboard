"""Feature engineering — shared transformations for all three models."""
from __future__ import annotations
import math
from datetime import date, timedelta
from collections import defaultdict
from typing import Optional

import numpy as np
import pandas as pd

from .schemas import PlatformMetricRow, ConcertRow


# ── Platform helpers ──────────────────────────────────────────────────────────

PLATFORM_PRIMARY_METRIC = {
    "spotify":     "streams",
    "apple_music": "streams",
    "youtube":     "views",
    "instagram":   "followers",
    "facebook":    "followers",
    "twitter":     "followers",
}

ARTIST_TIER_BREAKS = [0, 10_000, 100_000, 500_000, 2_000_000, math.inf]
ARTIST_TIER_LABELS = ["micro", "rising", "mid", "major", "superstar"]


def metrics_to_df(metrics: list[PlatformMetricRow]) -> pd.DataFrame:
    """Convert list of metric rows into a tidy DataFrame indexed by (date, platform)."""
    rows = [r.model_dump() for r in metrics]
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)
    return df


def platform_series(df: pd.DataFrame, platform: str) -> pd.Series:
    """Return the primary metric time-series for a single platform."""
    col = PLATFORM_PRIMARY_METRIC.get(platform, "followers")
    sub = df[df["platform"] == platform][["date", col]].dropna()
    sub = sub.set_index("date")[col].sort_index()
    return sub


def rog(series: pd.Series, window: int) -> float:
    """
    Percentage rate-of-growth over `window` days.
    Uses the last available value vs the value `window` days before it.
    Returns 0.0 when there is insufficient data.
    """
    if len(series) < 2:
        return 0.0
    end_val = series.iloc[-1]
    cutoff = series.index[-1] - timedelta(days=window)
    past = series[series.index <= cutoff]
    if past.empty:
        return 0.0
    start_val = past.iloc[-1]
    if start_val <= 0:
        # Can't compute meaningful RoG from a zero or negative baseline;
        # fall back to absolute growth capped to avoid divide-by-zero.
        return 0.0
    return round((end_val - start_val) / start_val * 100, 4)


def exponential_smooth(series: pd.Series, alpha: float = 0.3) -> pd.Series:
    """Simple exponential smoothing to reduce viral-spike noise."""
    return series.ewm(alpha=alpha, adjust=False).mean()


def forecast_holt(series: pd.Series, steps: int) -> float:
    """
    Holt linear trend forecast (no seasonal component).
    Falls back to last value when series is too short.
    """
    s = exponential_smooth(series)
    if len(s) < 3:
        return float(s.iloc[-1]) if len(s) else 0.0
    try:
        from statsmodels.tsa.holtwinters import Holt
        model = Holt(s.values, initialization_method="estimated")
        fit = model.fit(optimized=True, remove_bias=True)
        pred = fit.forecast(steps)
        return max(0.0, float(pred[-1]))
    except Exception:
        # Graceful fallback: linear extrapolation
        slope = (float(s.iloc[-1]) - float(s.iloc[-3])) / 2
        return max(0.0, float(s.iloc[-1]) + slope * steps)


def detect_breakpoints(series: pd.Series, penalty: float = 5.0) -> list[str]:
    """
    Detect trend change-points using PELT (ruptures library).
    Returns ISO date strings of detected breakpoints.
    Falls back to [] if ruptures is not installed.
    """
    if len(series) < 14:
        return []
    try:
        import ruptures as rpt
        signal = series.values.reshape(-1, 1)
        algo = rpt.Pelt(model="rbf").fit(signal)
        bkps = algo.predict(pen=penalty)
        dates = []
        for idx in bkps[:-1]:   # last entry is always len(series)
            if 0 <= idx < len(series):
                dates.append(series.index[idx].date().isoformat())
        return dates
    except ImportError:
        return []


def infer_artist_tier(metrics: list[PlatformMetricRow]) -> str:
    """
    Assign an artist tier based on max follower count across social platforms.
    Streams/views are intentionally excluded — a niche artist can have high
    streams without being 'major'.
    """
    max_val = 0
    for m in metrics:
        v = getattr(m, "followers", None)
        if v and v > max_val:
            max_val = v
    for i, (lo, hi) in enumerate(zip(ARTIST_TIER_BREAKS, ARTIST_TIER_BREAKS[1:])):
        if lo <= max_val < hi:
            return ARTIST_TIER_LABELS[i]
    return "micro"


# ── Concert features ──────────────────────────────────────────────────────────

SEASON_MAP = {12: "winter", 1: "winter", 2: "winter",
              3: "spring", 4: "spring", 5: "spring",
              6: "summer", 7: "summer", 8: "summer",
              9: "autumn", 10: "autumn", 11: "autumn"}

WEEKEND_DAYS = {4, 5, 6}   # Fri, Sat, Sun (weekday() indices)


def concert_base_features(concert: ConcertRow) -> dict:
    """Numeric / categorical features derived from a single concert record."""
    avg_price = (concert.ticket_price_min + concert.ticket_price_max) / 2
    price_range = concert.ticket_price_max - concert.ticket_price_min
    return {
        "venue_capacity":    concert.venue_capacity,
        "avg_ticket_price":  avg_price,
        "price_range":       price_range,
        "max_revenue_naive": concert.venue_capacity * avg_price,
        "is_weekend":        int(concert.date.weekday() in WEEKEND_DAYS),
        "month":             concert.date.month,
        "season":            SEASON_MAP[concert.date.month],
        "city":              concert.city,
        "country":           concert.country,
    }


def social_velocity(df: pd.DataFrame, days: int = 14) -> float:
    """
    Mean daily follower / stream growth across all platforms over last `days`.
    Normalised to [0, 1] via a log scale (asymptotes at 1M/day).
    """
    cutoff = df["date"].max() - timedelta(days=days)
    recent = df[df["date"] >= cutoff]
    total_growth = 0.0
    for platform, col in PLATFORM_PRIMARY_METRIC.items():
        sub = recent[recent["platform"] == platform][["date", col]].dropna()
        if len(sub) >= 2:
            total_growth += float(sub[col].iloc[-1] - sub[col].iloc[0])
    if total_growth <= 0:
        return 0.0
    return min(1.0, math.log1p(total_growth) / math.log1p(1_000_000))


def ticket_velocity(concerts: list[ConcertRow], days_back: int = 90) -> float:
    """
    Ratio of tickets sold vs capacity across recent concerts.
    Returns 0.0 when no sold-out data is available.
    """
    if not concerts:
        return 0.0
    cutoff = date.today() - timedelta(days=days_back)
    recent = [c for c in concerts if c.date >= cutoff and c.tickets_sold and c.venue_capacity]
    if not recent:
        return 0.0
    ratios = [c.tickets_sold / c.venue_capacity for c in recent]
    return round(float(np.mean(ratios)), 4)


def seasonality_factor(target_date: date, city: str) -> float:
    """
    Simple month-of-year + weekend multiplier as a 0–1 score.
    Summer + Friday/Saturday = higher demand.  Expand with city-level data later.
    """
    month_weights = {1:.55, 2:.5, 3:.6, 4:.7, 5:.75, 6:.9,
                     7:.95, 8:1.0, 9:.85, 10:.8, 11:.65, 12:.6}
    base = month_weights.get(target_date.month, 0.7)
    weekend_bonus = 0.1 if target_date.weekday() in WEEKEND_DAYS else 0.0
    return min(1.0, base + weekend_bonus)
