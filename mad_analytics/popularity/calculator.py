"""Popularity model using information entropy weighting across artist platform snapshots and time series metrics."""
from __future__ import annotations
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from ..utils.db import fetch_artist_snapshots
from ..utils.schemas import PopularityInput, PopularityOutput
from ..utils.feature_engineering import metrics_to_df, platform_series

SNAPSHOT_PLATFORMS = [
    "spotifyMonthlyListeners",
    "youtubeSubscribers",
    "instagramFollowers",
    "facebookFollowers",
    "twitterFollowers",
]

PLATFORM_LABELS = {
    "spotifyMonthlyListeners": "spotify",
    "youtubeSubscribers": "youtube",
    "instagramFollowers": "instagram",
    "facebookFollowers": "facebook",
    "twitterFollowers": "twitter",
}


def _build_platform_matrix(df: pd.DataFrame) -> pd.DataFrame:
    """Return a dense platform × time matrix of each platform's primary metric."""
    platforms = sorted({p for p in df["platform"].unique() if p})
    if not platforms:
        return pd.DataFrame()

    rows: dict[str, pd.Series] = {}
    for platform in platforms:
        series = platform_series(df, platform)
        rows[platform] = series

    matrix = pd.DataFrame(rows).fillna(0.0)
    matrix = matrix.sort_index()
    return matrix


def _build_snapshot_matrix(rows: list[dict[str, object]]) -> pd.DataFrame:
    """Build a cross-sectional snapshot matrix from artist-level fields."""
    if not rows:
        return pd.DataFrame()

    data = {
        PLATFORM_LABELS[platform]: [
            float(row.get(platform) or 0.0) for row in rows
        ]
        for platform in SNAPSHOT_PLATFORMS
    }
    return pd.DataFrame(data)


def _entropy_weights(matrix: pd.DataFrame) -> dict[str, float]:
    """Compute entropy-based weights for each platform column."""
    if matrix.empty:
        return {}

    n_rows = len(matrix)
    entropy_factor = 1.0 / np.log(n_rows) if n_rows > 1 else 0.0
    transformed = np.log1p(matrix)
    weights: dict[str, float] = {}
    diversifications: dict[str, float] = {}

    for platform in transformed.columns:
        column = transformed[platform].astype(float)
        column_sum = float(column.sum())
        if column_sum <= 0 or entropy_factor == 0:
            diversifications[platform] = 0.0
            continue

        probabilities = column / column_sum
        entropy = -entropy_factor * np.nansum(
            np.where(probabilities > 0, probabilities * np.log(probabilities), 0.0)
        )
        diversifications[platform] = float(max(0.0, 1.0 - entropy))

    total = sum(diversifications.values())
    if total <= 0:
        equal_weight = 1.0 / max(1, len(transformed.columns))
        return {platform: equal_weight for platform in transformed.columns}

    return {platform: value / total for platform, value in diversifications.items()}


def _normalize_vector(series: pd.Series) -> pd.Series:
    max_by_platform = series.max(axis=0).replace(0.0, np.nan)
    return (series / max_by_platform).fillna(0.0)


def _calculate_snapshot_popularity(artist_id: str) -> tuple[float, dict[str, float], dict[str, float]]:
    artists = fetch_artist_snapshots()
    if not artists:
        return 5.0, {}, {}

    matrix = _build_snapshot_matrix(artists)
    if matrix.empty:
        return 5.0, {}, {}

    weights = _entropy_weights(matrix)
    transformed = np.log1p(matrix)
    normalized = _normalize_vector(transformed)

    target_row = next((row for row in artists if row["artist_id"] == artist_id), None)
    if not target_row:
        return 5.0, {}, {}

    target_values = {
        PLATFORM_LABELS[platform]: float(target_row.get(platform) or 0.0)
        for platform in SNAPSHOT_PLATFORMS
    }
    target_series = pd.Series(target_values)
    target_normalized = _normalize_vector(target_series.to_frame().T).iloc[0]

    platform_contributions = {
        platform: round(float(target_normalized.get(platform, 0.0) * weights.get(platform, 0.0)), 4)
        for platform in matrix.columns
    }
    platform_weights = {platform: round(weights.get(platform, 0.0), 4) for platform in matrix.columns}
    score = round(min(100.0, max(0.0, 5.0 + 95.0 * sum(platform_contributions.values()))), 2)

    return score, platform_weights, platform_contributions


def calculate_all() -> list[PopularityOutput]:
    """Compute popularity scores for all active artists using backend snapshots."""
    artists = fetch_artist_snapshots()
    if not artists:
        return []

    matrix = _build_snapshot_matrix(artists)
    if matrix.empty:
        return []

    weights = _entropy_weights(matrix)
    transformed = np.log1p(matrix)
    normalized = _normalize_vector(transformed)

    outputs: list[PopularityOutput] = []
    for idx, row in normalized.iterrows():
        artist = artists[idx]
        platform_contributions = {
            platform: round(float(row.get(platform, 0.0) * weights.get(platform, 0.0)), 4)
            for platform in matrix.columns
        }
        platform_weights = {platform: round(weights.get(platform, 0.0), 4) for platform in matrix.columns}
        score = round(min(100.0, max(0.0, 5.0 + 95.0 * sum(platform_contributions.values()))), 2)
        outputs.append(PopularityOutput(
            artist_id=artist["artist_id"],
            popularity_score=score,
            platform_weights=platform_weights,
            platform_contributions=platform_contributions,
            computed_at=datetime.now(timezone.utc).isoformat(),
        ))

    return outputs


def calculate(payload: PopularityInput) -> PopularityOutput:
    """Compute an artist popularity score using either platform metrics or backend artist snapshot data."""
    if payload.platform_metrics:
        df = metrics_to_df(payload.platform_metrics)
        matrix = _build_platform_matrix(df)
        if matrix.empty:
            platform_weights = {}
            platform_contributions = {}
            score = 5.0
        else:
            weights = _entropy_weights(matrix)
            transformed = np.log1p(matrix)
            latest_relative = _normalize_vector(transformed).iloc[-1]

            platform_contributions = {
                platform: round(float(latest_relative.get(platform, 0.0) * weights.get(platform, 0.0)), 4)
                for platform in transformed.columns
            }
            platform_weights = {platform: round(weights.get(platform, 0.0), 4) for platform in transformed.columns}
            score = round(min(100.0, max(0.0, 5.0 + 95.0 * sum(platform_contributions.values()))), 2)
    else:
        score, platform_weights, platform_contributions = _calculate_snapshot_popularity(payload.artist_id)

    return PopularityOutput(
        artist_id=payload.artist_id,
        popularity_score=score,
        platform_weights=platform_weights,
        platform_contributions=platform_contributions,
        computed_at=datetime.now(timezone.utc).isoformat(),
    )
