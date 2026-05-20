"""
revenue/predictor.py
Revenue prediction for a single concert.

Model:    GradientBoostingRegressor (sklearn)
Features: venue_capacity, avg_ticket_price, price_range, artist_tier,
          demand_score, is_weekend, month, city, country,
          rog_30d (best platform), cross_platform_score
Output:   predicted revenue + 10th/90th percentile bounds + SHAP importances

Training: run training/train_revenue.py to generate models/revenue_model.joblib
          and models/revenue_preprocessor.joblib
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd

from ..utils.schemas import RevenueInput, RevenueOutput
from ..utils import model_store
from ..utils.feature_engineering import (
    metrics_to_df, concert_base_features, infer_artist_tier,
    rog, platform_series, PLATFORM_PRIMARY_METRIC,
)
from ..demand.scorer import calculate as demand_calculate
from ..utils.schemas import DemandInput
from ..growth.rog_calculator import calculate as growth_calculate
from ..utils.schemas import GrowthInput


# ── Feature assembly ───────────────────────────────────────────────────────────

def _build_feature_row(payload: RevenueInput) -> dict:
    """
    Assemble all features into a flat dict, computing sub-modules inline
    when pre-computed values aren't provided.
    """
    concert = payload.concert
    metrics = payload.platform_metrics
    df = metrics_to_df(metrics)

    # Base concert features
    features = concert_base_features(concert)

    # Artist tier
    features["artist_tier"] = infer_artist_tier(metrics)

    # Demand score — use pre-computed or compute inline
    if payload.demand_score is not None:
        demand_score = payload.demand_score
    else:
        demand_out = demand_calculate(DemandInput(
            artist_id=concert.artist_id,
            city=concert.city,
            country=concert.country,
            target_date=concert.date,
            platform_metrics=metrics,
            recent_concerts=[],
        ))
        demand_score = demand_out.score

    features["demand_score"] = demand_score

    # Best-platform 30d RoG
    best_rog = 0.0
    for platform in PLATFORM_PRIMARY_METRIC:
        series = platform_series(df, platform)
        if not series.empty:
            r = rog(series, 30)
            if r > best_rog:
                best_rog = r
    features["best_rog_30d"] = best_rog

    # Cross-platform score
    growth_out = growth_calculate(GrowthInput(
        artist_id=concert.artist_id,
        metrics=metrics,
    ))
    features["cross_platform_score"] = growth_out.cross_platform_score

    return features


# ── Inference ──────────────────────────────────────────────────────────────────

CATEGORICAL_COLS = ["season", "city", "country", "artist_tier"]
NUMERIC_COLS = [
    "venue_capacity", "avg_ticket_price", "price_range", "max_revenue_naive",
    "is_weekend", "month", "demand_score", "best_rog_30d", "cross_platform_score",
]


def _feature_importances(model, preprocessor, row_df: pd.DataFrame) -> dict[str, float]:
    """
    Return SHAP-style importances if shap is installed, else fall back to
    sklearn's built-in feature_importances_ attribute.
    """
    try:
        import shap
        explainer = shap.TreeExplainer(model)
        X_transformed = preprocessor.transform(row_df)
        shap_values = explainer.shap_values(X_transformed)
        feature_names = preprocessor.get_feature_names_out()
        importances = dict(zip(feature_names, np.abs(shap_values[0])))
        # Normalise to sum-to-1
        total = sum(importances.values()) or 1
        return {k: round(v / total, 4) for k, v in
                sorted(importances.items(), key=lambda x: -x[1])[:10]}
    except ImportError:
        # Fallback: sklearn feature_importances_
        feature_names = preprocessor.get_feature_names_out()
        raw = model.feature_importances_
        total = raw.sum() or 1
        imp = dict(zip(feature_names, raw / total))
        return {k: round(v, 4) for k, v in
                sorted(imp.items(), key=lambda x: -x[1])[:10]}


def _confidence(lower: float, upper: float, predicted: float) -> float:
    """Tighter interval → higher confidence (max 0.95)."""
    if predicted == 0:
        return 0.5
    relative_width = (upper - lower) / predicted
    return round(min(0.95, max(0.1, 1 - relative_width / 2)), 3)


def calculate(payload: RevenueInput) -> RevenueOutput:
    """
    Predict concert revenue.

    If trained models aren't found, falls back to a rule-based heuristic
    so the API never hard-crashes in a cold-start or dev environment.
    """
    concert = payload.concert

    feature_dict = _build_feature_row(payload)
    row_df = pd.DataFrame([feature_dict])

    if model_store.exists("revenue_model") and model_store.exists("revenue_preprocessor"):
        model        = model_store.load("revenue_model")
        preprocessor = model_store.load("revenue_preprocessor")

        X = preprocessor.transform(row_df)
        predicted = float(model.predict(X)[0])

        # Quantile estimates via individual tree predictions (GBR)
        try:
            tree_preds = np.array([
                e.predict(X) for e in model.estimators_.flatten()
            ])
            lower = float(np.percentile(tree_preds, 10))
            upper = float(np.percentile(tree_preds, 90))
        except Exception:
            lower = predicted * 0.75
            upper = predicted * 1.25

        importances = _feature_importances(model, preprocessor, row_df)

    else:
        # ── Rule-based fallback (no trained model yet) ────────────────────────
        capacity       = feature_dict["venue_capacity"]
        avg_price      = feature_dict["avg_ticket_price"]
        demand_score   = feature_dict["demand_score"]
        sell_through   = 0.5 + (demand_score / 100) * 0.4  # 50–90%
        predicted      = capacity * avg_price * sell_through
        lower          = predicted * 0.70
        upper          = predicted * 1.30
        importances    = {
            "venue_capacity":    0.30,
            "avg_ticket_price":  0.25,
            "demand_score":      0.25,
            "artist_tier":       0.10,
            "seasonality":       0.10,
        }

    return RevenueOutput(
        concert_id=concert.concert_id,
        artist_id=concert.artist_id,
        predicted_revenue=round(max(0.0, predicted), 2),
        lower_bound=round(max(0.0, lower), 2),
        upper_bound=round(max(0.0, upper), 2),
        confidence=_confidence(lower, upper, predicted),
        demand_score_used=feature_dict["demand_score"],
        feature_importances=importances,
        computed_at=datetime.now(timezone.utc).isoformat(),
    )
