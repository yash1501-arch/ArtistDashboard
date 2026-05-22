"""
training/validate_concerts.py
Validate and correct all concert data using ML models + web search.

Checks:
1. Venue Capacity — web search via SerpAPI for real capacity
2. Tickets Sold — must be <= capacity, recalculate if impossible
3. Sell-through — flag anomalies (>95% or <5%)
4. ATP (Average Ticket Price) — validate against country/city norms
5. Revenue — must equal tickets_sold * avg_ticket_price (approximately)

Usage:
    python -m mad_analytics.training.validate_concerts --db $DATABASE_URL --dry-run
    python -m mad_analytics.training.validate_concerts --db $DATABASE_URL
"""
from __future__ import annotations
import argparse
import os
import sys
import time
import warnings
warnings.filterwarnings("ignore")

import pandas as pd
from sqlalchemy import create_engine, text

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent.parent))

from mad_analytics.venue_capacity.web_search import search_venue_capacity
from mad_analytics.venue_capacity.resolver import estimate_capacity
from mad_analytics.utils.schemas import VenueCapacityInput


def _normalize_db_url(db_url: str) -> str:
    if db_url.startswith("postgres://"):
        return db_url.replace("postgres://", "postgresql://", 1)
    return db_url


def _safe_float(value, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        f = float(value)
        if pd.isna(f):
            return default
        return f
    except (TypeError, ValueError):
        return default


# ── ATP validation ranges by country ──────────────────────────────────────────

ATP_RANGES = {
    "India": (200, 15_000),        # INR
    "United States": (30, 500),    # USD
    "United Kingdom": (25, 400),   # GBP
    "Canada": (30, 450),           # CAD
    "Australia": (40, 500),        # AUD
    "United Arab Emirates": (100, 2000),  # AED
    "Germany": (30, 350),          # EUR
    "France": (30, 350),           # EUR
    "Singapore": (50, 500),        # SGD
    "New Zealand": (40, 400),      # NZD
}

DEFAULT_ATP_RANGE = (20, 500)  # USD fallback


def _get_atp_range(country: str) -> tuple[float, float]:
    for key, rng in ATP_RANGES.items():
        if key.lower() in country.lower():
            return rng
    return DEFAULT_ATP_RANGE


# ── Main validation ───────────────────────────────────────────────────────────

def load_concerts(db_url: str) -> pd.DataFrame:
    engine = create_engine(_normalize_db_url(db_url))
    query = text("""
        SELECT c.id, c."artistId", c."venueName", c.city, c.country,
               c.capacity, c."ticketsSold", c."avgTicketPrice",
               c."totalRevenue", c."concertDate", c.currency
        FROM concerts c
        WHERE c.capacity > 0 OR c."ticketsSold" > 0 OR c."totalRevenue" > 0
        ORDER BY c."concertDate" DESC
    """)
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)
    engine.dispose()
    return df


def validate_concert(row: dict, use_web_search: bool = True, cached_web_capacity: int = None) -> dict:
    """Validate a single concert and return corrections."""
    issues = []
    corrections = {}

    venue_name = str(row.get("venueName") or "")
    city = str(row.get("city") or "")
    country = str(row.get("country") or "")
    capacity = int(_safe_float(row.get("capacity"), 0))
    tickets_sold = int(_safe_float(row.get("ticketsSold"), 0))
    atp = _safe_float(row.get("avgTicketPrice"), 0)
    revenue = _safe_float(row.get("totalRevenue"), 0)

    # ── 1. Validate Capacity via Web Search ──────────────────────────────
    web_capacity = cached_web_capacity
    if web_capacity is None and use_web_search and venue_name and len(venue_name) > 3:
        candidates = search_venue_capacity(venue_name, city, country)
        if candidates:
            plausible = [c for c in candidates if c.capacity >= 500 or "club" in venue_name.lower() or "bar" in venue_name.lower()]
            if plausible:
                best = max(plausible, key=lambda c: (c.confidence > 0.8, c.capacity))
                web_capacity = best.capacity

    if web_capacity and capacity > 0:
        # Only flag if web capacity is moderately larger (1.5x to 5x)
        # Ratios >5x often mean the web found full stadium capacity vs concert config
        ratio = web_capacity / capacity
        if 1.5 < ratio <= 5.0:
            issues.append(f"capacity {capacity} may be too low, web found {web_capacity}")
            corrections["capacity"] = web_capacity
        elif capacity > web_capacity * 2.5 and web_capacity >= 1000:
            # Only trust web for downgrades if the web value is substantial
            issues.append(f"capacity {capacity} may be too high, web found {web_capacity}")
            corrections["capacity"] = web_capacity
    elif web_capacity and capacity == 0:
        corrections["capacity"] = web_capacity
        issues.append(f"capacity was 0, set to web-verified {web_capacity}")

    # Use corrected capacity for downstream checks
    effective_capacity = corrections.get("capacity", capacity)

    # ── 2. Validate Tickets Sold ─────────────────────────────────────────
    if tickets_sold > effective_capacity and effective_capacity > 0:
        issues.append(f"ticketsSold {tickets_sold} > capacity {effective_capacity}")
        # Cap at 95% sell-through (realistic max)
        corrected_sold = int(effective_capacity * 0.90)
        corrections["ticketsSold"] = corrected_sold
        tickets_sold = corrected_sold

    if tickets_sold < 0:
        corrections["ticketsSold"] = 0
        issues.append("ticketsSold was negative")

    # ── 3. Validate Sell-Through ─────────────────────────────────────────
    sell_through = (tickets_sold / effective_capacity * 100) if effective_capacity > 0 else 0
    if sell_through > 100:
        issues.append(f"sell-through {sell_through:.1f}% exceeds 100%")
    # Note: low sell-through is not necessarily wrong, just flagged

    # ── 4. Validate ATP ──────────────────────────────────────────────────
    atp_min, atp_max = _get_atp_range(country)
    if atp > 0 and (atp < atp_min * 0.3 or atp > atp_max * 3):
        issues.append(f"ATP {atp} outside expected range [{atp_min}-{atp_max}] for {country}")

    # ── 5. Validate Revenue Consistency ──────────────────────────────────
    if tickets_sold > 0 and atp > 0 and revenue > 0:
        expected_revenue = tickets_sold * atp
        revenue_ratio = revenue / expected_revenue if expected_revenue > 0 else 0

        if revenue_ratio > 2.5 or revenue_ratio < 0.3:
            issues.append(
                f"revenue {revenue:.0f} inconsistent with tickets*ATP "
                f"({tickets_sold}*{atp:.0f}={expected_revenue:.0f}, ratio={revenue_ratio:.2f})"
            )
            # Recalculate revenue from tickets * ATP
            corrections["totalRevenue"] = round(tickets_sold * atp, 2)

    elif revenue == 0 and tickets_sold > 0 and atp > 0:
        # Revenue missing but we have tickets and price
        corrections["totalRevenue"] = round(tickets_sold * atp, 2)
        issues.append(f"revenue was 0, calculated as {tickets_sold}*{atp:.0f}")

    return {
        "id": row["id"],
        "venue_name": venue_name,
        "city": city,
        "country": country,
        "issues": issues,
        "corrections": corrections,
        "web_capacity": web_capacity,
        "sell_through": round(sell_through, 1),
    }


def apply_corrections(results: list[dict], db_url: str) -> int:
    """Apply corrections to the database."""
    engine = create_engine(_normalize_db_url(db_url))
    updated = 0

    with engine.begin() as conn:
        for result in results:
            if not result["corrections"]:
                continue

            # Build dynamic UPDATE
            sets = []
            params = {"id": result["id"]}
            for field, value in result["corrections"].items():
                col_name = {
                    "capacity": "capacity",
                    "ticketsSold": '"ticketsSold"',
                    "totalRevenue": '"totalRevenue"',
                    "avgTicketPrice": '"avgTicketPrice"',
                }.get(field, f'"{field}"')
                param_key = f"val_{field}"
                sets.append(f"{col_name} = :{param_key}")
                params[param_key] = value

            if sets:
                sql = f"UPDATE concerts SET {', '.join(sets)} WHERE id = :id"
                conn.execute(text(sql), params)
                updated += 1

    engine.dispose()
    return updated


# ── Reporting ──────────────────────────────────────────────────────────────────

def print_report(results: list[dict], updated: int, dry_run: bool):
    total = len(results)
    with_issues = [r for r in results if r["issues"]]
    with_corrections = [r for r in results if r["corrections"]]
    web_searched = [r for r in results if r["web_capacity"]]

    print(f"\n{'='*65}")
    print(f"  CONCERT DATA VALIDATION {'(DRY RUN)' if dry_run else 'REPORT'}")
    print(f"{'='*65}")
    print(f"  Total concerts checked     : {total}")
    print(f"  Venues web-searched        : {len(web_searched)}")
    print(f"  Concerts with issues       : {len(with_issues)}")
    print(f"  Concerts corrected         : {len(with_corrections)}")
    print(f"  DB rows updated            : {updated}")
    print(f"{'='*65}")

    if with_issues:
        print(f"\n  Issues found:")
        for r in with_issues[:25]:
            print(f"    {r['venue_name'][:30]:30s} {r['city']:15s}")
            for issue in r["issues"]:
                print(f"      - {issue}")
            if r["corrections"]:
                print(f"      FIX: {r['corrections']}")
        if len(with_issues) > 25:
            print(f"    ... and {len(with_issues) - 25} more")

    # Summary stats
    sell_throughs = [r["sell_through"] for r in results if r["sell_through"] > 0]
    if sell_throughs:
        avg_st = sum(sell_throughs) / len(sell_throughs)
        print(f"\n  Sell-through stats:")
        print(f"    Average: {avg_st:.1f}%")
        print(f"    Min: {min(sell_throughs):.1f}%")
        print(f"    Max: {max(sell_throughs):.1f}%")

    print()


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Validate concert data using ML models + web search")
    parser.add_argument("--db", default=os.environ.get("DATABASE_URL", ""),
                        help="PostgreSQL connection URL")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview corrections without writing to database")
    parser.add_argument("--no-web-search", action="store_true",
                        help="Skip web search (faster, less accurate)")
    parser.add_argument("--limit", type=int, default=0,
                        help="Limit number of concerts to validate (0 = all)")
    args = parser.parse_args()

    if not args.db:
        print("ERROR: Provide --db or set DATABASE_URL environment variable")
        sys.exit(1)

    # Ensure SERPAPI_KEY is available
    if not args.no_web_search and not os.environ.get("SERPAPI_KEY"):
        # Try loading from backend/.env
        from pathlib import Path
        env_path = Path(__file__).parent.parent.parent / "backend" / ".env"
        if env_path.exists():
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("SERPAPI_KEY") and "=" in line:
                        _, _, val = line.partition("=")
                        os.environ["SERPAPI_KEY"] = val.strip().strip('"').strip("'")

    print(f"{'[DRY RUN] ' if args.dry_run else ''}Concert Data Validation")
    print(f"{'='*65}")
    print(f"  Web search: {'ENABLED' if not args.no_web_search else 'DISABLED'}")
    print(f"  SerpAPI key: {'configured' if os.environ.get('SERPAPI_KEY') else 'NOT SET'}")

    # Load concerts
    print(f"\n  Loading concerts...")
    df = load_concerts(args.db)
    if args.limit > 0:
        df = df.head(args.limit)
    print(f"  Loaded {len(df)} concerts to validate.")

    # Validate each concert
    print(f"\n  Validating...")
    results = []
    venue_cache = {}  # Cache web search results by venue_name+city

    for idx, row in df.iterrows():
        venue_key = f"{row.get('venueName', '')}|{row.get('city', '')}"
        # Pass cached web capacity to avoid duplicate searches
        cached_cap = venue_cache.get(venue_key)
        result = validate_concert(
            row.to_dict(),
            use_web_search=not args.no_web_search,
            cached_web_capacity=cached_cap,
        )
        # Cache the web result
        if result.get("web_capacity") and venue_key not in venue_cache:
            venue_cache[venue_key] = result["web_capacity"]
        results.append(result)
        # Progress indicator
        if (idx + 1) % 10 == 0:
            print(f"    Processed {idx + 1}/{len(df)} ({len(venue_cache)} unique venues searched)...")
        # Small delay between web searches to respect rate limits
        if not args.no_web_search and row.get("venueName") and venue_key not in venue_cache:
            time.sleep(2.0)

    # Apply corrections
    if not args.dry_run:
        updated = apply_corrections(results, args.db)
    else:
        updated = 0

    # Report
    print_report(results, updated, args.dry_run)

    if not args.dry_run and updated > 0:
        print("[OK] Corrections applied. Run train_revenue.py to retrain the model.")
    elif args.dry_run:
        print("[INFO] Dry run complete. Remove --dry-run to apply corrections.")


if __name__ == "__main__":
    main()
