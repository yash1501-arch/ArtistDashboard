"""
training/enrich_venues.py
Batch venue capacity enrichment pipeline.

Pulls all distinct venues from the concerts table, resolves their capacity
using the venue_capacity resolver, persists validated results to the venues
table, and backfills concert records with corrected capacities.

Usage
-----
    python -m mad_analytics.training.enrich_venues \
        --db postgresql://user:pass@localhost/mad_db

    # Dry run (no writes):
    python -m mad_analytics.training.enrich_venues --db $DATABASE_URL --dry-run

    # Only process venues that look like defaults (round numbers):
    python -m mad_analytics.training.enrich_venues --db $DATABASE_URL --defaults-only
"""
from __future__ import annotations
import argparse
import os
import sys
import warnings
warnings.filterwarnings("ignore")

from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from sqlalchemy import create_engine, text

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent.parent))

from mad_analytics.venue_capacity.resolver import (
    resolve_venue_capacity,
    estimate_capacity,
    extract_capacity_candidates,
    persist_capacity_resolution,
)
from mad_analytics.utils.schemas import VenueCapacityInput, VenueCapacityOutput
from mad_analytics.utils.feature_engineering import infer_artist_tier
from mad_analytics.utils.schemas import PlatformMetricRow


# ── Helpers ────────────────────────────────────────────────────────────────────

def _normalize_db_url(db_url: str) -> str:
    if db_url.startswith("postgres://"):
        return db_url.replace("postgres://", "postgresql://", 1)
    return db_url


def _safe_int(value, default: int = 0) -> int:
    if value is None:
        return default
    try:
        f = float(value)
        if pd.isna(f):
            return default
        return int(f)
    except (TypeError, ValueError):
        return default


def _is_likely_default_capacity(capacity: int) -> bool:
    """Detect suspiciously round capacities that were probably defaulted."""
    round_defaults = {1000, 2000, 2500, 3000, 3500, 5000, 10000, 15000, 20000, 25000, 30000, 50000}
    return capacity in round_defaults


def _infer_artist_tier_from_db(artist_id: str, engine) -> str:
    """Infer artist tier from their snapshot data in the artists table."""
    query = text("""
        SELECT "spotifyMonthlyListeners", "youtubeSubscribers",
               "instagramFollowers", "facebookFollowers", "twitterFollowers"
        FROM artists WHERE id = :artist_id
    """)
    with engine.connect() as conn:
        row = conn.execute(query, {"artist_id": artist_id}).mappings().first()

    if not row:
        return "mid"

    max_followers = max(
        _safe_int(row.get("spotifyMonthlyListeners")),
        _safe_int(row.get("youtubeSubscribers")),
        _safe_int(row.get("instagramFollowers")),
        _safe_int(row.get("facebookFollowers")),
        _safe_int(row.get("twitterFollowers")),
    )

    if max_followers >= 2_000_000:
        return "superstar"
    elif max_followers >= 500_000:
        return "major"
    elif max_followers >= 100_000:
        return "mid"
    elif max_followers >= 10_000:
        return "rising"
    return "micro"


# ── Data loading ───────────────────────────────────────────────────────────────

def load_venues_from_concerts(db_url: str, defaults_only: bool = False) -> pd.DataFrame:
    """
    Pull all distinct venue entries from concerts table.
    Returns DataFrame with: venue_name, city, country, capacity, artist_id, concert_count
    """
    engine = create_engine(_normalize_db_url(db_url))

    query = text("""
        SELECT
            "venueName" AS venue_name,
            city,
            country,
            capacity,
            "artistId" AS artist_id,
            COUNT(*) AS concert_count,
            AVG("ticketsSold") AS avg_tickets_sold,
            MAX("ticketsSold") AS max_tickets_sold
        FROM concerts
        WHERE "venueName" IS NOT NULL
          AND "venueName" != ''
        GROUP BY "venueName", city, country, capacity, "artistId"
        ORDER BY concert_count DESC, city
    """)

    with engine.connect() as conn:
        df = pd.read_sql(query, conn)

    engine.dispose()

    if defaults_only:
        df = df[df["capacity"].apply(lambda c: _is_likely_default_capacity(_safe_int(c)))]

    return df


def load_existing_venues(db_url: str) -> dict[str, dict]:
    """Load already-resolved venues from the venues table."""
    engine = create_engine(_normalize_db_url(db_url))
    query = text("""
        SELECT name, city, country, "avgCapacity", "capacityMin", "capacityMax",
               "venueType", verified
        FROM venues
    """)
    try:
        with engine.connect() as conn:
            rows = conn.execute(query).mappings().all()
    except Exception:
        rows = []
    engine.dispose()

    lookup = {}
    for row in rows:
        key = f"{(row['name'] or '').lower().strip()}|{(row['city'] or '').lower().strip()}|{(row['country'] or '').lower().strip()}"
        lookup[key] = dict(row)
    return lookup


# ── Resolution pipeline ────────────────────────────────────────────────────────

def resolve_batch(
    df: pd.DataFrame,
    db_url: str,
    existing_venues: dict[str, dict],
    dry_run: bool = False,
) -> list[dict]:
    """
    Resolve capacity for each venue in the DataFrame.
    Returns a list of result dicts with resolution details.
    """
    engine = create_engine(_normalize_db_url(db_url))
    results = []
    seen_venues: set[str] = set()

    for _, row in df.iterrows():
        venue_name = str(row["venue_name"]).strip()
        city = str(row["city"]).strip()
        country = str(row["country"]).strip()
        current_capacity = _safe_int(row["capacity"], 5000)
        artist_id = str(row["artist_id"])

        # Deduplicate by venue+city+country
        venue_key = f"{venue_name.lower()}|{city.lower()}|{country.lower()}"
        if venue_key in seen_venues:
            continue
        seen_venues.add(venue_key)

        # Check if already resolved in venues table
        existing = existing_venues.get(venue_key)
        if existing and existing.get("verified") and existing.get("avgCapacity"):
            existing_cap = int(existing["avgCapacity"])
            max_sold = _safe_int(row.get("max_tickets_sold"))

            # Validate: if tickets_sold > venue capacity, the venue data is wrong
            if max_sold > 0 and max_sold > existing_cap:
                # Don't trust the verified capacity — tickets sold proves it's wrong
                # Fall through to re-resolve with tickets_sold as the floor
                pass
            else:
                results.append({
                    "venue_name": venue_name,
                    "city": city,
                    "country": country,
                    "old_capacity": current_capacity,
                    "new_capacity": existing_cap,
                    "confidence": 0.96,
                    "status": "already_verified",
                    "source": "venue_db",
                    "action": "skip",
                })
                continue

        # Infer artist tier for better estimation
        artist_tier = _infer_artist_tier_from_db(artist_id, engine)

        # Infer venue type from name
        venue_type = _infer_venue_type(venue_name)

        # Use tickets_sold as a capacity floor (if sold > current capacity, capacity is wrong)
        max_sold = _safe_int(row.get("max_tickets_sold"))
        supplied_capacity = None
        if max_sold > 0 and current_capacity > 0 and max_sold > current_capacity:
            # Tickets sold exceeds stated capacity — use sold as minimum capacity
            supplied_capacity = int(max_sold * 1.1)  # Add 10% buffer
        elif max_sold > 0 and current_capacity == 0:
            # No capacity set but we have ticket sales data
            supplied_capacity = int(max_sold * 1.15)  # Add 15% buffer for unsold seats

        # Run the resolver
        # Determine supplied_capacity: use current if it's not a round default, else None
        resolved_supplied = None
        if supplied_capacity and supplied_capacity > 0:
            resolved_supplied = supplied_capacity
        elif current_capacity > 0 and not _is_likely_default_capacity(current_capacity):
            resolved_supplied = current_capacity

        payload = VenueCapacityInput(
            venue_name=venue_name,
            city=city,
            country=country,
            venue_type=venue_type,
            artist_tier=artist_tier,
            supplied_capacity=resolved_supplied if resolved_supplied and resolved_supplied > 0 else None,
            persist=not dry_run,
            db_url=db_url,
        )

        try:
            output = resolve_venue_capacity(payload)
        except Exception as e:
            results.append({
                "venue_name": venue_name,
                "city": city,
                "country": country,
                "old_capacity": current_capacity,
                "new_capacity": current_capacity,
                "confidence": 0.0,
                "status": "error",
                "source": str(e),
                "action": "skip",
            })
            continue

        # Determine action
        capacity_changed = output.capacity != current_capacity
        action = "update" if capacity_changed and output.confidence >= 0.6 else "keep"

        results.append({
            "venue_name": venue_name,
            "city": city,
            "country": country,
            "old_capacity": current_capacity,
            "new_capacity": output.capacity,
            "confidence": output.confidence,
            "status": output.status,
            "source": output.source,
            "action": action,
            "venue_type": venue_type,
            "artist_tier": artist_tier,
        })

    engine.dispose()
    return results


def _infer_venue_type(venue_name: str) -> str:
    """Infer venue type from the venue name."""
    name_lower = venue_name.lower()
    type_keywords = {
        "stadium": "stadium",
        "arena": "arena",
        "amphitheatre": "amphitheatre",
        "amphitheater": "amphitheatre",
        "theater": "theater",
        "theatre": "theater",
        "auditorium": "auditorium",
        "club": "club",
        "lounge": "lounge",
        "bar": "club",
        "festival": "festival",
        "grounds": "grounds",
        "ground": "grounds",
        "park": "park",
        "hall": "hall",
        "center": "hall",
        "centre": "hall",
        "dome": "arena",
        "coliseum": "arena",
        "pavilion": "amphitheatre",
        "garden": "arena",
        "field": "grounds",
    }
    for keyword, vtype in type_keywords.items():
        if keyword in name_lower:
            return vtype
    return ""


# ── Backfill concerts ──────────────────────────────────────────────────────────

def backfill_concerts(results: list[dict], db_url: str, dry_run: bool = False) -> int:
    """Update concert records with resolved capacities."""
    if dry_run:
        return 0

    updates = [r for r in results if r["action"] == "update"]
    if not updates:
        return 0

    engine = create_engine(_normalize_db_url(db_url))
    updated = 0

    for result in updates:
        query = text("""
            UPDATE concerts
            SET capacity = :new_capacity
            WHERE "venueName" = :venue_name
              AND city = :city
              AND country = :country
              AND (capacity IS NULL OR capacity = :old_capacity)
        """)
        try:
            with engine.begin() as conn:
                r = conn.execute(query, {
                    "new_capacity": result["new_capacity"],
                    "venue_name": result["venue_name"],
                    "city": result["city"],
                    "country": result["country"],
                    "old_capacity": result["old_capacity"],
                })
                updated += r.rowcount
        except Exception as e:
            print(f"  ⚠ Failed to update {result['venue_name']}: {e}")

    engine.dispose()
    return updated


# ── Reporting ──────────────────────────────────────────────────────────────────

def print_report(results: list[dict], updated_concerts: int, dry_run: bool):
    """Print a summary report of the enrichment run."""
    total = len(results)
    validated = sum(1 for r in results if r["status"] == "validated")
    estimated = sum(1 for r in results if r["status"] == "estimated")
    review = sum(1 for r in results if r["status"] == "review_required")
    already = sum(1 for r in results if r["status"] == "already_verified")
    errors = sum(1 for r in results if r["status"] == "error")
    updates = sum(1 for r in results if r["action"] == "update")

    print(f"\n{'='*60}")
    print(f"  VENUE CAPACITY ENRICHMENT {'(DRY RUN)' if dry_run else 'REPORT'}")
    print(f"{'='*60}")
    print(f"  Total unique venues processed : {total}")
    print(f"  Already verified (skipped)    : {already}")
    print(f"  Newly validated (high conf)   : {validated}")
    print(f"  Estimated (heuristic)         : {estimated}")
    print(f"  Needs manual review           : {review}")
    print(f"  Errors                        : {errors}")
    print(f"  Capacity updates applied      : {updates}")
    print(f"  Concert records updated       : {updated_concerts}")
    print(f"{'='*60}")

    # Show changes
    changes = [r for r in results if r["action"] == "update"]
    if changes:
        print(f"\n  Capacity changes:")
        for r in changes[:20]:
            arrow = "→"
            print(f"    {r['venue_name'][:30]:30s} {r['city']:15s} "
                  f"{r['old_capacity']:>6,} {arrow} {r['new_capacity']:>6,}  "
                  f"(conf={r['confidence']:.2f}, src={r['source']})")
        if len(changes) > 20:
            print(f"    ... and {len(changes) - 20} more")

    # Show review-needed
    reviews = [r for r in results if r["status"] == "review_required"]
    if reviews:
        print(f"\n  ⚠ Venues needing manual review:")
        for r in reviews[:10]:
            print(f"    {r['venue_name'][:30]:30s} {r['city']:15s} "
                  f"cap={r['new_capacity']:>6,} (conf={r['confidence']:.2f})")
        if len(reviews) > 10:
            print(f"    ... and {len(reviews) - 10} more")

    print()


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Batch venue capacity enrichment")
    parser.add_argument("--db", default=os.environ.get("DATABASE_URL", ""),
                        help="PostgreSQL connection URL")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview changes without writing to database")
    parser.add_argument("--defaults-only", action="store_true",
                        help="Only process venues with suspiciously round capacities")
    args = parser.parse_args()

    if not args.db:
        print("ERROR: Provide --db or set DATABASE_URL environment variable")
        sys.exit(1)

    db_url = args.db
    print(f"{'[DRY RUN] ' if args.dry_run else ''}Venue Capacity Enrichment Pipeline")
    print(f"{'='*60}")

    # Step 1: Load venues from concerts
    print("\n1. Loading venues from concerts table...")
    df = load_venues_from_concerts(db_url, defaults_only=args.defaults_only)
    print(f"   Found {len(df)} venue entries ({df['venue_name'].nunique()} unique venues)")

    if df.empty:
        print("   No venues to process.")
        sys.exit(0)

    # Step 2: Load existing resolved venues
    print("\n2. Loading existing venue resolutions...")
    existing = load_existing_venues(db_url)
    print(f"   Found {len(existing)} already-resolved venues")

    # Step 3: Resolve capacities
    print("\n3. Resolving venue capacities...")
    results = resolve_batch(df, db_url, existing, dry_run=args.dry_run)

    # Step 4: Backfill concert records
    print("\n4. Backfilling concert records...")
    updated_concerts = backfill_concerts(results, db_url, dry_run=args.dry_run)

    # Step 5: Report
    print_report(results, updated_concerts, dry_run=args.dry_run)

    if not args.dry_run:
        print("✓ Enrichment complete. Run train_revenue.py to retrain with updated capacities.")
    else:
        print("ℹ Dry run complete. Remove --dry-run to apply changes.")


if __name__ == "__main__":
    main()
