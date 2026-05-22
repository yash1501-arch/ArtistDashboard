"""Venue Capacity Extraction and Validation Pipeline.

This pipeline extracts venue capacity information from concert data,
computes aggregated statistics (min, max, average capacity), and updates
the Venue table in the database.
"""

from __future__ import annotations

import logging
import os
import uuid
from typing import Optional

from sqlalchemy import create_engine, text

logger = logging.getLogger(__name__)


def _get_db_url(db_url: Optional[str] = None) -> str:
    """Get and normalize database URL from environment or argument."""
    if db_url:
        return db_url.replace("postgres://", "postgresql://", 1) if db_url.startswith("postgres://") else db_url
    env_url = os.environ.get("DATABASE_URL")
    if not env_url:
        raise RuntimeError("Database URL is not configured. Set the DATABASE_URL environment variable.")
    return env_url.replace("postgres://", "postgresql://", 1) if env_url.startswith("postgres://") else env_url


def update_venue_capacities(db_url: Optional[str] = None) -> int:
    """Update venue capacities based on concert data.

    Args:
        db_url: Optional database URL override.

    Returns:
        Number of venues updated.
    """
    engine = create_engine(_get_db_url(db_url))
    updated_count = 0

    try:
        with engine.begin() as conn:
            # Query to get aggregated capacity data per venue
            query = text(
                """
                SELECT
                    c."venueName" AS venue_name,
                    c.city AS city,
                    c."country" AS country,
                    MIN(c.capacity) AS min_cap,
                    MAX(c.capacity) AS max_cap,
                    AVG(c.capacity) AS avg_cap,
                    COUNT(*) AS concert_count
                FROM "concerts" c
                WHERE c."venueName" IS NOT NULL
                  AND c.capacity IS NOT NULL
                GROUP BY c."venueName", c.city, c."country"
                """
            )
            results = conn.execute(query).mappings().all()

            if not results:
                logger.info("No concert data with capacity found.")
                return 0

            # Upsert query for Venue table
            upsert_query = text(
                """
                INSERT INTO "venues" (id, name, city, country, "capacityMin", "capacityMax", "avgCapacity", verified, source, "lastUpdated", created_at, "address", "latitude", "longitude", "venueType", "ticketPriceMin", "ticketPriceMax", "avgTicketPrice", "state")
                VALUES (:id, :venue_name, :city, :country, :min_cap, :max_cap, :avg_cap, :verified, 'concert_data', now(), now(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
                ON CONFLICT (name, city, country) DO UPDATE SET
                    "capacityMin" = EXCLUDED."capacityMin",
                    "capacityMax" = EXCLUDED."capacityMax",
                    "avgCapacity" = EXCLUDED."avgCapacity",
                    verified = EXCLUDED.verified,
                    source = EXCLUDED.source,
                    "lastUpdated" = now()
                """
            )

            for row in results:
                venue_name = row["venue_name"]
                city = row["city"]
                country = row["country"]
                min_cap = int(row["min_cap"]) if row["min_cap"] is not None else None
                max_cap = int(row["max_cap"]) if row["max_cap"] is not None else None
                avg_cap = int(round(float(row["avg_cap"]))) if row["avg_cap"] is not None else None
                concert_count = row["concert_count"]
                verified = concert_count >= 3  # Verified if we have at least 3 concerts
                venue_id = str(uuid.uuid4())

                params = {
                    "id": venue_id,
                    "venue_name": venue_name,
                    "city": city,
                    "country": country,
                    "min_cap": min_cap,
                    "max_cap": max_cap,
                    "avg_cap": avg_cap,
                    "verified": verified,
                }

                result = conn.execute(upsert_query, params)
                # rowcount indicates number of rows affected (inserted or updated)
                updated_count += result.rowcount

            logger.info(
                f"Processed {len(results)} venue groups. Updated {updated_count} venue records."
            )

    except Exception as e:
        logger.error(f"Failed to update venue capacities: {e}")
        raise
    finally:
        engine.dispose()

    return updated_count


if __name__ == "__main__":
    # Allow running as a script for testing
    logging.basicConfig(level=logging.INFO)
    count = update_venue_capacities()
    print(f"Updated {count} venue capacity records.")