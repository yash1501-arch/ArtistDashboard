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
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error, r2_score
from sklearn.model_selection import cross_val_score, train_test_split
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

def _safe_int(value, default: int = 0) -> int:
    """Safely convert a value to int, handling None, NaN, and other edge cases."""
    if value is None:
        return default
    try:
        f = float(value)
        if pd.isna(f) or np.isinf(f):
            return default
        return int(f)
    except (TypeError, ValueError):
        return default


def _synthesize_metrics_from_snapshot(
    artist_row: dict, concert_date, num_days: int = 90
) -> list[PlatformMetricRow]:
    """
    When an artist has no time-series platform_metrics rows, synthesize
    a plausible history from their snapshot data (artist table columns).
    This mirrors what the backend service does for inference.
    """
    from datetime import timedelta

    seeds = []
    spotify = _safe_int(artist_row.get("spotify_monthly_listeners"))
    youtube = _safe_int(artist_row.get("youtube_subscribers"))
    instagram = _safe_int(artist_row.get("instagram_followers"))
    facebook = _safe_int(artist_row.get("facebook_followers"))
    twitter = _safe_int(artist_row.get("twitter_followers"))

    if spotify > 0:
        seeds.append(("spotify", spotify, spotify))  # (platform, followers, streams)
    if youtube > 0:
        seeds.append(("youtube", youtube, youtube))
    if instagram > 0:
        seeds.append(("instagram", instagram, 0))
    if facebook > 0:
        seeds.append(("facebook", facebook, 0))
    if twitter > 0:
        seeds.append(("twitter", twitter, 0))

    if not seeds:
        # Fallback: create minimal synthetic data
        seeds = [("spotify", 50_000, 50_000)]

    rows: list[PlatformMetricRow] = []
    base_date = pd.Timestamp(concert_date)

    for platform, followers, streams in seeds:
        for offset in range(num_days, 0, -1):
            d = (base_date - timedelta(days=offset)).date()
            # Simulate slight growth over time
            growth_factor = 1 - (offset / num_days) * 0.08  # ~8% growth over period
            rows.append(PlatformMetricRow(
                date=d,
                platform=platform,
                followers=max(0, int(followers * growth_factor)),
                streams=max(0, int(streams * growth_factor)),
                views=max(0, int(streams * growth_factor)) if platform == "youtube" else 0,
                likes=max(0, int(followers * growth_factor * 0.01)),
                comments=max(0, int(followers * growth_factor * 0.001)),
                shares=max(0, int(followers * growth_factor * 0.0005)),
            ))

    return rows


def load_training_data(db_url: str) -> pd.DataFrame:
    """
    Pull concerts with actual_revenue + their platform metrics from PostgreSQL.
    For artists without time-series metrics, synthesize from snapshot data.
    Returns a flat feature DataFrame ready for training.
    """
    from sqlalchemy import create_engine, text
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    engine = create_engine(db_url)

    concerts_sql = text("""
        SELECT c.id AS concert_id, c."artistId" AS artist_id, c.city, c.country,
               c.capacity AS venue_capacity,
               c."avgTicketPrice",
               c."ticketPriceTier3",
               c."ticketPriceVip",
               c."concertDate" AS date,
               c."totalRevenue" AS actual_revenue,
               c."ticketsSold" AS tickets_sold,
               c."demandScore" AS demand_score_stored
        FROM concerts c
        WHERE c."totalRevenue" IS NOT NULL
          AND c."totalRevenue" > 0
          AND c.capacity > 0
        ORDER BY c."concertDate"
    """)

    metrics_sql = text("""
        SELECT "artistId" AS artist_id, "metricDate" AS date,
               LOWER(platform::text) AS platform,
               followers, streams, likes, comments, shares
        FROM platform_metrics
        ORDER BY "artistId", "metricDate"
    """)

    # Also fetch artist snapshot data for synthesizing metrics
    artists_sql = text("""
        SELECT id AS artist_id,
               "spotifyMonthlyListeners" AS spotify_monthly_listeners,
               "youtubeSubscribers" AS youtube_subscribers,
               "instagramFollowers" AS instagram_followers,
               "facebookFollowers" AS facebook_followers,
               "twitterFollowers" AS twitter_followers
        FROM artists
        WHERE active = true
    """)

    with engine.connect() as conn:
        concerts_df = pd.read_sql(concerts_sql, conn)
        metrics_df = pd.read_sql(metrics_sql, conn)
        artists_df = pd.read_sql(artists_sql, conn)

    engine.dispose()

    print(f"Loaded {len(concerts_df)} concerts with actual revenue.")
    print(f"Loaded {len(metrics_df)} platform metric rows.")
    print(f"Loaded {len(artists_df)} artist snapshots.")

    # Build artist snapshot lookup
    artist_snapshots = {}
    for _, a_row in artists_df.iterrows():
        artist_snapshots[a_row["artist_id"]] = a_row.to_dict()

    rows = []
    skipped = 0
    synthesized = 0

    for _, row in concerts_df.iterrows():
        artist_id = row["artist_id"]
        artist_metrics = metrics_df[metrics_df["artist_id"] == artist_id]

        if len(artist_metrics) >= 7:
            # Use actual time-series metrics
            metric_rows = []
            for _, r in artist_metrics.iterrows():
                platform = str(r["platform"]).lower().strip()
                followers = int(r["followers"]) if pd.notna(r["followers"]) else 0
                streams = int(r["streams"]) if pd.notna(r["streams"]) else 0
                views = streams if platform == "youtube" else 0
                likes = int(r["likes"]) if pd.notna(r["likes"]) else 0
                comments = int(r["comments"]) if pd.notna(r["comments"]) else 0
                shares = int(r["shares"]) if pd.notna(r["shares"]) else 0

                metric_rows.append(PlatformMetricRow(
                    date=r["date"],
                    platform=platform,
                    followers=followers,
                    streams=streams,
                    views=views,
                    likes=likes,
                    comments=comments,
                    shares=shares,
                ))
        elif artist_id in artist_snapshots:
            # Synthesize from snapshot data
            metric_rows = _synthesize_metrics_from_snapshot(
                artist_snapshots[artist_id], row["date"]
            )
            synthesized += 1
        else:
            skipped += 1
            continue

        # Calculate ticket price range
        avg_price = float(row["avgTicketPrice"]) if pd.notna(row["avgTicketPrice"]) else 0
        tier3 = float(row["ticketPriceTier3"]) if pd.notna(row["ticketPriceTier3"]) else None
        vip = float(row["ticketPriceVip"]) if pd.notna(row["ticketPriceVip"]) else None

        ticket_price_min = tier3 if tier3 else (avg_price * 0.5 if avg_price > 0 else 500.0)
        ticket_price_max = vip if vip else (avg_price * 2.0 if avg_price > 0 else 2000.0)

        # Ensure valid price range
        if ticket_price_min <= 0:
            ticket_price_min = 500.0
        if ticket_price_max <= ticket_price_min:
            ticket_price_max = ticket_price_min * 3.0

        concert = ConcertRow(
            concert_id=str(row["concert_id"]),
            artist_id=str(artist_id),
            city=str(row["city"]),
            country=str(row["country"]),
            venue_capacity=int(row["venue_capacity"]),
            ticket_price_min=ticket_price_min,
            ticket_price_max=ticket_price_max,
            date=row["date"],
            actual_revenue=float(row["actual_revenue"]),
            tickets_sold=int(row["tickets_sold"]) if pd.notna(row["tickets_sold"]) and row["tickets_sold"] > 0 else None,
        )

        features = concert_base_features(concert)
        features["artist_tier"] = infer_artist_tier(metric_rows)

        df = metrics_to_df(metric_rows)

        # Demand score: use stored value if available, else compute from social velocity
        stored_demand = row.get("demand_score_stored")
        if pd.notna(stored_demand) and float(stored_demand) > 0:
            features["demand_score"] = float(stored_demand)
        else:
            features["demand_score"] = min(95.0, max(5.0, social_velocity(df) * 100))

        # Best platform 30d RoG
        best_rog = 0.0
        for platform in PLATFORM_PRIMARY_METRIC:
            series = platform_series(df, platform)
            if not series.empty:
                r = rog(series, 30)
                if r > best_rog:
                    best_rog = r
        features["best_rog_30d"] = best_rog

        # Cross-platform score
        features["cross_platform_score"] = min(100.0, max(0.0, social_velocity(df) * 100 * 1.1))

        features["actual_revenue"] = float(row["actual_revenue"])
        rows.append(features)

    print(f"\nFeature rows built: {len(rows)}")
    print(f"Skipped (no metrics or snapshot): {skipped}")
    print(f"Synthesized from snapshot: {synthesized}")

    return pd.DataFrame(rows)


# ── Preprocessing pipeline ────────────────────────────────────────────────────

def build_preprocessor() -> ColumnTransformer:
    return ColumnTransformer([
        ("num", StandardScaler(), NUMERIC_COLS),
        ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL_COLS),
    ])


# ── Training ──────────────────────────────────────────────────────────────────

def train(df: pd.DataFrame) -> tuple:
    """Train the revenue model with adaptive parameters based on dataset size."""
    X = df[NUMERIC_COLS + CATEGORICAL_COLS]
    y = df["actual_revenue"].values

    n_samples = len(df)
    print(f"\nTraining on {n_samples} samples...")

    # Adaptive hyperparameters based on dataset size
    if n_samples < 30:
        n_estimators = 100
        max_depth = 3
        min_samples_leaf = 2
        test_size = 0.25
    elif n_samples < 100:
        n_estimators = 200
        max_depth = 4
        min_samples_leaf = 3
        test_size = 0.2
    else:
        n_estimators = 300
        max_depth = 5
        min_samples_leaf = 5
        test_size = 0.2

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42
    )

    preprocessor = build_preprocessor()
    X_train_t = preprocessor.fit_transform(X_train)
    X_test_t = preprocessor.transform(X_test)

    model = GradientBoostingRegressor(
        n_estimators=n_estimators,
        learning_rate=0.05,
        max_depth=max_depth,
        min_samples_leaf=min_samples_leaf,
        subsample=0.8,
        random_state=42,
    )
    model.fit(X_train_t, y_train)

    # Evaluate
    train_preds = model.predict(X_train_t)
    test_preds = model.predict(X_test_t)

    train_mae = mean_absolute_error(y_train, train_preds)
    test_mae = mean_absolute_error(y_test, test_preds)
    test_r2 = r2_score(y_test, test_preds)
    test_mape = mean_absolute_percentage_error(y_test, test_preds) * 100

    print(f"\n{'='*50}")
    print(f"  TRAINING RESULTS")
    print(f"{'='*50}")
    print(f"  Train MAE  : INR {train_mae:>12,.0f}")
    print(f"  Test MAE   : INR {test_mae:>12,.0f}")
    print(f"  Test R²    : {test_r2:>12.4f}")
    print(f"  Test MAPE  : {test_mape:>12.1f}%")
    print(f"  Baseline   : INR {np.std(y_test):>12,.0f}  (std of actuals)")
    print(f"  Mean Rev   : INR {np.mean(y):>12,.0f}")
    print(f"{'='*50}")

    # Cross-validation score (if enough data)
    if n_samples >= 20:
        cv_folds = min(5, n_samples // 5)
        if cv_folds >= 3:
            X_all_t = preprocessor.transform(X)
            cv_scores = cross_val_score(model, X_all_t, y, cv=cv_folds, scoring="r2")
            print(f"  CV R² ({cv_folds}-fold): {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    # Feature importances
    feature_names = preprocessor.get_feature_names_out()
    importances = model.feature_importances_
    sorted_idx = np.argsort(importances)[::-1]
    print(f"\n  Top features:")
    for i in range(min(10, len(feature_names))):
        idx = sorted_idx[i]
        print(f"    {feature_names[idx]:30s} {importances[idx]:.4f}")

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

    if len(df) == 0:
        print("ERROR: No training data available. Ensure concerts have totalRevenue and capacity > 0.")
        sys.exit(1)

    if len(df) < 10:
        print(f"WARNING: Only {len(df)} training samples — model will be unreliable.")
        print("Consider adding more concert data with actual revenue before training.")

    model, preprocessor = train(df)

    model_store.save("revenue_model", model)
    model_store.save("revenue_preprocessor", preprocessor)
    print(f"\n[OK] Saved -> {model_store.MODELS_DIR / 'revenue_model.joblib'}")
    print(f"[OK] Saved -> {model_store.MODELS_DIR / 'revenue_preprocessor.joblib'}")
    print(f"\nModel is now active. The revenue predictor will use it for inference.")


if __name__ == "__main__":
    main()
