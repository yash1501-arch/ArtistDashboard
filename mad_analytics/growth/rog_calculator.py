"""
growth/rog_calculator.py
Rate-of-Growth calculator + multi-horizon forecast for every platform.

Input:  GrowthInput  (artist_id + list[PlatformMetricRow])
Output: GrowthOutput (per-platform forecasts + cross-platform score)
"""
from __future__ import annotations
import math
from datetime import datetime, timezone

import numpy as np

from ..utils.schemas import GrowthInput, GrowthOutput, PlatformForecast
from ..utils.feature_engineering import (
    metrics_to_df, platform_series, rog,
    exponential_smooth, forecast_holt, detect_breakpoints,
    PLATFORM_PRIMARY_METRIC,
)


# ── Trend classification ───────────────────────────────────────────────────────

def _classify_trend(rog_30: float, rog_90: float) -> str:
    if rog_30 > 5 or rog_90 > 10:
        return "rising"
    if rog_30 < -5 or rog_90 < -10:
        return "declining"
    return "stable"


def _anomaly_detected(series, sigma_threshold: float = 3.0) -> bool:
    """Flag if the last value is > sigma_threshold std-devs from smoothed baseline."""
    if len(series) < 7:
        return False
    smoothed = exponential_smooth(series)
    residuals = series - smoothed
    std = residuals.std()
    if std == 0:
        return False
    last_z = abs(float(residuals.iloc[-1])) / float(std)
    return last_z > sigma_threshold


# ── Cross-platform score ───────────────────────────────────────────────────────

PLATFORM_WEIGHTS = {
    "spotify":     0.25,
    "youtube":     0.20,
    "instagram":   0.20,
    "twitter":     0.10,
    "facebook":    0.10,
    "apple_music": 0.15,
}

def _cross_platform_score(forecasts: list[PlatformForecast]) -> float:
    """
    Weighted average of per-platform 30-day RoG clamped to [0, 100].
    Platforms with no data contribute 0.
    """
    total_weight = 0.0
    weighted_sum = 0.0
    for pf in forecasts:
        w = PLATFORM_WEIGHTS.get(pf.platform, 0.05)
        # Normalise RoG: 0% → 50 pts, +20% → ~80 pts, -20% → ~20 pts (sigmoid)
        score = 50 + 50 * math.tanh(pf.rog_30d / 20)
        weighted_sum += w * score
        total_weight += w
    if total_weight == 0:
        return 50.0
    return round(weighted_sum / total_weight, 2)


# ── Main entry point ───────────────────────────────────────────────────────────

def calculate(payload: GrowthInput) -> GrowthOutput:
    """
    Full RoG calculation for all platforms in the payload.

    Steps
    -----
    1. Convert metrics list → tidy DataFrame
    2. For each available platform, compute 7/30/90d RoG on smoothed series
    3. Forecast 30 / 90 / 180 days ahead using Holt linear trend
    4. Detect anomalies and structural breakpoints
    5. Aggregate into a cross-platform growth score
    """
    df = metrics_to_df(payload.metrics)
    available_platforms = df["platform"].unique().tolist()

    platform_forecasts: list[PlatformForecast] = []
    all_breakpoints: list[str] = []

    for platform in available_platforms:
        series = platform_series(df, platform)
        if series.empty or len(series) < 3:
            continue

        smoothed = exponential_smooth(series)

        r7   = rog(series, 7)
        r30  = rog(series, 30)
        r90  = rog(series, 90)

        f30  = forecast_holt(smoothed, 30)
        f90  = forecast_holt(smoothed, 90)
        f180 = forecast_holt(smoothed, 180)

        bkps = detect_breakpoints(smoothed)
        all_breakpoints.extend(bkps)

        platform_forecasts.append(PlatformForecast(
            platform=platform,
            current_value=float(series.iloc[-1]),
            rog_7d=r7,
            rog_30d=r30,
            rog_90d=r90,
            forecast_30d=round(f30, 2),
            forecast_90d=round(f90, 2),
            forecast_180d=round(f180, 2),
            trend=_classify_trend(r30, r90),
            anomaly_detected=_anomaly_detected(series),
        ))

    cross_score = _cross_platform_score(platform_forecasts)
    unique_bkps = sorted(set(all_breakpoints))

    return GrowthOutput(
        artist_id=payload.artist_id,
        computed_at=datetime.now(timezone.utc).isoformat(),
        cross_platform_score=cross_score,
        breakpoints=unique_bkps,
        platforms=platform_forecasts,
    )
