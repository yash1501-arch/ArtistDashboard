"""
demand/scorer.py
Composite 0–100 demand score for an artist in a given city on a given date.

Components
----------
- social_velocity  (40%)  — how fast the artist is growing across platforms
- ticket_velocity  (30%)  — recent sell-through rate at past concerts
- seasonality      (20%)  — month-of-year × weekend bonus
- recency          (10%)  — how recently the artist performed nearby

Input:  DemandInput
Output: DemandOutput
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta

from ..utils.schemas import DemandInput, DemandOutput
from ..utils.feature_engineering import (
    metrics_to_df,
    social_velocity,
    ticket_velocity,
    seasonality_factor,
)


# ── Component weights ─────────────────────────────────────────────────────────

WEIGHTS = {
    "social_velocity": 0.40,
    "ticket_velocity": 0.30,
    "seasonality":     0.20,
    "recency":         0.10,
}


def _recency_score(concerts, city: str, country: str) -> float:
    """
    Score based on how recently the artist played in the same city/country.
    Recent = higher novelty anticipation if > 3 months ago, else saturation risk.
    Returns 0–1.
    """
    if not concerts:
        return 0.5   # neutral — no data

    now = datetime.now(timezone.utc).date()
    nearby = [
        c for c in concerts
        if c.city.lower() == city.lower() or c.country.lower() == country.lower()
    ]
    if not nearby:
        return 0.7   # never played here → high novelty

    most_recent = max(c.date for c in nearby)
    days_since = (now - most_recent).days

    if days_since < 30:
        return 0.2   # too soon — audience fatigue risk
    if days_since < 90:
        return 0.5
    if days_since < 180:
        return 0.8
    return 0.9       # long absence → strong anticipation


# ── Main entry point ───────────────────────────────────────────────────────────

def calculate(payload: DemandInput) -> DemandOutput:
    """
    Compute the composite demand score.

    Each component returns a 0–1 float.
    Final score = weighted sum × 100, clamped to [0, 100].
    """
    df = metrics_to_df(payload.platform_metrics)

    sv = social_velocity(df, days=14)
    tv = ticket_velocity(payload.recent_concerts, days_back=90)
    sf = seasonality_factor(payload.target_date, payload.city)
    rv = _recency_score(payload.recent_concerts, payload.city, payload.country)

    components = {
        "social_velocity": round(sv, 4),
        "ticket_velocity": round(tv, 4),
        "seasonality":     round(sf, 4),
        "recency":         round(rv, 4),
    }

    raw_score = sum(WEIGHTS[k] * v for k, v in components.items())
    score = round(min(100.0, max(0.0, raw_score * 100)), 2)

    return DemandOutput(
        artist_id=payload.artist_id,
        city=payload.city,
        score=score,
        components=components,
        computed_at=datetime.now(timezone.utc).isoformat(),
    )
