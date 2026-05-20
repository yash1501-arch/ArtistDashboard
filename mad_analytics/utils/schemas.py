"""Pydantic schemas — strict I/O contracts for every calculation module."""
from __future__ import annotations
from datetime import date
from typing import Optional
from pydantic import BaseModel, Field, field_validator


# ── Shared ────────────────────────────────────────────────────────────────────

class PlatformMetricRow(BaseModel):
    """One day's worth of metrics for a single platform."""
    date: date
    platform: str                          # spotify | instagram | youtube | facebook | twitter | apple_music
    followers: Optional[int] = None
    streams: Optional[int] = None
    views: Optional[int] = None
    likes: Optional[int] = None
    comments: Optional[int] = None
    shares: Optional[int] = None


class ConcertRow(BaseModel):
    """Minimal concert record needed by revenue + demand models."""
    concert_id: str
    artist_id: str
    city: str
    country: str
    venue_capacity: int
    ticket_price_min: float
    ticket_price_max: float
    date: date
    actual_revenue: Optional[float] = None   # None = unseen / prediction target
    tickets_sold: Optional[int] = None


# ── RoG (Growth) ──────────────────────────────────────────────────────────────

class GrowthInput(BaseModel):
    artist_id: str
    metrics: list[PlatformMetricRow] = Field(..., min_length=7)

    @field_validator("metrics")
    @classmethod
    def sorted_asc(cls, v: list[PlatformMetricRow]) -> list[PlatformMetricRow]:
        return sorted(v, key=lambda r: r.date)


class PlatformForecast(BaseModel):
    platform: str
    current_value: float
    rog_7d: float       # % growth last 7 days
    rog_30d: float
    rog_90d: float
    forecast_30d: float
    forecast_90d: float
    forecast_180d: float
    trend: str          # rising | stable | declining
    anomaly_detected: bool


class GrowthOutput(BaseModel):
    artist_id: str
    computed_at: str
    cross_platform_score: float = Field(..., ge=0, le=100)
    breakpoints: list[str]          # ISO dates where trend changed
    platforms: list[PlatformForecast]


# ── Demand ────────────────────────────────────────────────────────────────────

class DemandInput(BaseModel):
    artist_id: str
    city: str
    country: str
    target_date: date
    platform_metrics: list[PlatformMetricRow] = Field(..., min_length=7)
    recent_concerts: list[ConcertRow] = Field(default_factory=list)


class DemandOutput(BaseModel):
    artist_id: str
    city: str
    score: float = Field(..., ge=0, le=100)
    components: dict[str, float]    # social_velocity, ticket_velocity, seasonality, recency
    computed_at: str


# ── Revenue ───────────────────────────────────────────────────────────────────

class RevenueInput(BaseModel):
    concert: ConcertRow
    platform_metrics: list[PlatformMetricRow] = Field(..., min_length=14)
    demand_score: Optional[float] = None    # pre-computed or auto-calculated

    @field_validator("concert")
    @classmethod
    def capacity_positive(cls, v: ConcertRow) -> ConcertRow:
        if v.venue_capacity <= 0:
            raise ValueError("venue_capacity must be > 0")
        return v


class RevenueOutput(BaseModel):
    concert_id: str
    artist_id: str
    predicted_revenue: float
    lower_bound: float          # 10th percentile
    upper_bound: float          # 90th percentile
    confidence: float           # 0–1
    demand_score_used: float
    feature_importances: dict[str, float]
    computed_at: str
