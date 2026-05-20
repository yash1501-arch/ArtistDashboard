"""
training/train_revenue.py
Train and persist the GradientBoostingRegressor for concert revenue prediction.

Usage
-----
    python -m mad_analytics.training.train_revenue \
        --db postgresql://user:pass@localhost/mad_db

The script pulls concerts + platform_metrics from PostgreSQL via SQLAlchemy,
engineers features, trains the model, and saves artifacts to models/.
"""
from __future__ import annotations
import argparse
import os
import sys
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent.parent))

from mad_analytics.utils import model_store
from mad_analytics.utils.feature_engineering import (
    concert_base_features, infer_artist_tier, PLATFORM_PRIMARY_METRIC,
    metrics_to_df, rog, platform_series, social_velocity,
)
from mad_analytics.utils.schemas import ConcertRow, PlatformMetricRow

CATEGORICAL_COLS = ["season", "city", "country", "artist_tier"]
NUMERIC_COLS = [
    "venue_capacity", "avg_ticket_price", "price_range", "max_revenue_naive",
    "is_weekend", "month", "demand_score", "best_rog_30d", "cross_platform_score",
]


# ── Data loading ───────────────────────────────────────────────────────────────

def load_training_data(db_url: str) -> pd.DataFrame:
    """
    Pull concerts with actual_revenue + their platform metrics from PostgreSQL.
    Returns a flat feature DataFrame ready for training.
    """
    from sqlalchemy import create_engine, text
    engine = create_engine(db_url)

    concerts_sql = text("""
        SELECT c.id AS concert_id, c.artist_id, c.city, c.country,
               c.venue_capacity, c.ticket_price_min, c.ticket_price_max,
               c.date, c.actual_revenue, c.tickets_sold
        FROM concerts c
        WHERE c.actual_revenue IS NOT NULL
          AND c.venue_capacity > 0
        ORDER BY c.date
    """)

    metrics_sql = text("""
        SELECT artist_id, date, platform,
               followers, streams, views, likes, comments, shares
        FROM platform_metrics
        ORDER BY artist_id, date
    """)

    with engine.connect() as conn:
        concerts_df = pd.read_sql(concerts_sql, conn)
        metrics_df  = pd.read_sql(metrics_sql, conn)

    print(f"Loaded {len(concerts_df)} concerts with actual revenue.")
    print(f"Loaded {len(metrics_df)} platform metric rows.")

    rows = []
    for _, row in concerts_df.iterrows():
        artist_metrics = metrics_df[metrics_df["artist_id"] == row["artist_id"]]
        if len(artist_metrics) < 7:
            continue

        metric_rows = [
            PlatformMetricRow(
                date=r["date"], platform=r["platform"],
                followers=r.get("followers"), streams=r.get("streams"),
                views=r.get("views"), likes=r.get("likes"),
                comments=r.get("comments"), shares=r.get("shares"),
            )
            for _, r in artist_metrics.iterrows()
        ]

        concert = ConcertRow(
            concert_id=str(row["concert_id"]),
            artist_id=str(row["artist_id"]),
            city=row["city"], country=row["country"],
            venue_capacity=int(row["venue_capacity"]),
            ticket_price_min=float(row["ticket_price_min"]),
            ticket_price_max=float(row["ticket_price_max"]),
            date=row["date"],
            actual_revenue=float(row["actual_revenue"]),
            tickets_sold=row.get("tickets_sold"),
        )

        features = concert_base_features(concert)
        features["artist_tier"] = infer_artist_tier(metric_rows)

        df = metrics_to_df(metric_rows)
        features["demand_score"] = social_velocity(df) * 100

        best_rog = 0.0
        for platform in PLATFORM_PRIMARY_METRIC:
            series = platform_series(df, platform)
            if not series.empty:
                r = rog(series, 30)
                if r > best_rog:
                    best_rog = r
        features["best_rog_30d"] = best_rog
        features["cross_platform_score"] = min(100.0, social_velocity(df) * 100 * 1.1)
        features["actual_revenue"] = float(row["actual_revenue"])
        rows.append(features)

    return pd.DataFrame(rows)


# ── Preprocessing pipeline ────────────────────────────────────────────────────

def build_preprocessor() -> ColumnTransformer:
    return ColumnTransformer([
        ("num", StandardScaler(), NUMERIC_COLS),
        ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL_COLS),
    ])


# ── Training ──────────────────────────────────────────────────────────────────

def train(df: pd.DataFrame) -> tuple:
    X = df[NUMERIC_COLS + CATEGORICAL_COLS]
    y = df["actual_revenue"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    preprocessor = build_preprocessor()
    X_train_t = preprocessor.fit_transform(X_train)
    X_test_t  = preprocessor.transform(X_test)

    model = GradientBoostingRegressor(
        n_estimators=300,
        learning_rate=0.05,
        max_depth=5,
        min_samples_leaf=5,
        subsample=0.8,
        random_state=42,
    )
    model.fit(X_train_t, y_train)

    preds = model.predict(X_test_t)
    mae   = mean_absolute_error(y_test, preds)
    r2    = r2_score(y_test, preds)

    print(f"\nTest MAE  : ₹{mae:,.0f}")
    print(f"Test R²   : {r2:.4f}")
    print(f"Baseline  : ₹{np.std(y_test):,.0f}  (std of actuals)")

    return model, preprocessor


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Train MAD revenue prediction model")
    parser.add_argument("--db", default=os.environ.get("DATABASE_URL", ""), help="PostgreSQL connection URL")
    parser.add_argument("--csv", default="", help="Path to CSV export (alternative to --db)")
    args = parser.parse_args()

    if args.csv:
        df = pd.read_csv(args.csv)
        print(f"Loaded {len(df)} rows from CSV.")
    elif args.db:
        df = load_training_data(args.db)
    else:
        print("ERROR: Provide --db or --csv")
        sys.exit(1)

    if len(df) < 20:
        print(f"WARNING: Only {len(df)} training samples — model may be unreliable.")

    model, preprocessor = train(df)

    model_store.save("revenue_model", model)
    model_store.save("revenue_preprocessor", preprocessor)
    print("\nSaved → models/revenue_model.joblib")
    print("Saved → models/revenue_preprocessor.joblib")


if __name__ == "__main__":
    main()
