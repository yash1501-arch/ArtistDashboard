"""
training/update_artist_popularity.py
Compute popularity scores for all active artists and store them
directly in the artists table's `popularity` column.

Usage
-----
    python -m mad_analytics.training.update_artist_popularity \
        --db postgresql://user:pass@localhost/mad_db
"""
from __future__ import annotations
import argparse
import os
import sys
import warnings
warnings.filterwarnings("ignore")

import pandas as pd
from sqlalchemy import create_engine, text

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent.parent))

from mad_analytics.popularity.calculator import calculate_all, calculate
from mad_analytics.utils.schemas import PopularityInput


def _normalize_db_url(db_url: str) -> str:
    if db_url.startswith("postgres://"):
        return db_url.replace("postgres://", "postgresql://", 1)
    return db_url


def main():
    parser = argparse.ArgumentParser(description="Update artist popularity scores in the database")
    parser.add_argument("--db", default=os.environ.get("DATABASE_URL", ""),
                        help="PostgreSQL connection URL")
    args = parser.parse_args()

    if not args.db:
        print("ERROR: Provide --db or set DATABASE_URL environment variable")
        sys.exit(1)

    db_url = _normalize_db_url(args.db)
    os.environ["DATABASE_URL"] = db_url

    print("Computing popularity scores for all artists...")
    print("=" * 50)

    # Calculate popularity for all artists using the entropy-weighted model
    outputs = calculate_all()

    if not outputs:
        print("No artists found or no snapshot data available.")
        sys.exit(0)

    print(f"Computed scores for {len(outputs)} artists.")

    # Update the artists table with popularity scores
    engine = create_engine(db_url)
    updated = 0

    with engine.begin() as conn:
        for output in outputs:
            result = conn.execute(
                text('UPDATE artists SET popularity = :score WHERE id = :artist_id'),
                {"score": round(output.popularity_score, 2), "artist_id": output.artist_id}
            )
            if result.rowcount > 0:
                updated += 1

    engine.dispose()

    print(f"\nUpdated {updated} artists in the database.")
    print(f"\nPopularity scores:")
    print(f"{'Artist ID':<40} {'Score':>8}")
    print("-" * 50)

    # Sort by score descending for display
    sorted_outputs = sorted(outputs, key=lambda o: o.popularity_score, reverse=True)
    for output in sorted_outputs:
        print(f"  {output.artist_id:<38} {output.popularity_score:>6.2f}")

    print(f"\n[OK] All popularity scores saved to artists.popularity column.")


if __name__ == "__main__":
    main()
