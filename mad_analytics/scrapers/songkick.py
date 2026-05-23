"""
Songkick scraper — fetches upcoming and past concerts for tracked artists.
Uses SerpAPI to search Songkick pages (their official API is deprecated).

Songkick still has public artist pages with concert listings.
"""
from __future__ import annotations

import json
import os
import re
import time
import logging
import urllib.request
import urllib.parse
from datetime import datetime
from typing import Optional

from .models import ScrapedConcert

logger = logging.getLogger(__name__)

SERPAPI_KEY_ENV = "SERPAPI_KEY"


def _parse_date(text: str) -> Optional[str]:
    """Parse date from Songkick format."""
    patterns = [
        r"(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s,]+(\d{4})",
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2})[\s,]+(\d{4})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            groups = match.groups()
            try:
                if groups[0].isdigit():
                    dt = datetime.strptime(f"{groups[0]} {groups[1]} {groups[2]}", "%d %b %Y")
                else:
                    dt = datetime.strptime(f"{groups[0]} {groups[1]} {groups[2]}", "%b %d %Y")
                if dt.year >= 2024:
                    return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue
    return None


def _parse_price(text: str) -> Optional[float]:
    """Extract price from text."""
    match = re.search(r"[₹$£€]\s*([\d,]+)", text)
    if match:
        cleaned = match.group(1).replace(",", "")
        if cleaned:
            try:
                return float(cleaned)
            except ValueError:
                pass
    return None


def _search_artist_concerts(artist_name: str, api_key: str) -> list[ScrapedConcert]:
    """Search Songkick via SerpAPI for an artist's concerts."""
    concerts = []

    query = f'site:songkick.com "{artist_name}" concert 2025 2026'

    try:
        params = urllib.parse.urlencode({
            "api_key": api_key,
            "engine": "google",
            "q": query,
            "num": 10,
        })
        url = f"https://serpapi.com/search.json?{params}"
        req = urllib.request.Request(url, headers={"User-Agent": "MAD-Analytics/1.0"})

        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))

    except Exception as e:
        logger.warning(f"  Songkick search failed for {artist_name}: {e}")
        return []

    # Also check Google Events results
    for event in data.get("events_results", []):
        title = event.get("title", "")
        if artist_name.lower() not in title.lower():
            continue

        date_info = event.get("date", "")
        venue_info = event.get("venue", {}) if isinstance(event.get("venue"), dict) else {}
        address = event.get("address", [])
        link = event.get("link", "")

        event_date = None
        if isinstance(date_info, dict):
            event_date = date_info.get("start_date") or _parse_date(str(date_info.get("when", "")))
        elif isinstance(date_info, str):
            event_date = _parse_date(date_info)

        venue_name = venue_info.get("name", "") if isinstance(venue_info, dict) else ""
        city = ""
        country = ""
        if isinstance(address, list) and address:
            parts = address
            city = parts[0] if parts else ""
            country = parts[-1] if len(parts) > 1 else ""

        if event_date:
            concerts.append(ScrapedConcert(
                event_name=title,
                artist_name=artist_name,
                venue_name=venue_name,
                city=city,
                country=country or "Unknown",
                date=event_date,
                time=None,
                price_min=None,
                price_max=None,
                currency="INR" if "india" in country.lower() else "USD",
                source_url=link,
                source="songkick",
            ))

    # Parse organic results from Songkick
    for item in data.get("organic_results", []):
        title = item.get("title", "")
        snippet = item.get("snippet", "")
        link = item.get("link", "")

        if "songkick.com" not in link:
            continue

        # Skip artist profile pages, only want event pages
        if "/artists/" in link and "/calendar" not in link and "/gigography" not in link:
            continue

        combined = f"{title} {snippet}"
        event_date = _parse_date(combined)
        if not event_date:
            continue

        # Extract venue and city from snippet
        venue_name = ""
        city = ""
        country = ""

        # Songkick format: "Artist at Venue, City, Country"
        venue_match = re.search(r"at\s+([^,]+),\s*([^,]+?)(?:,\s*([^,\.\n]+))?", combined)
        if venue_match:
            venue_name = venue_match.group(1).strip()
            city = venue_match.group(2).strip()
            country = (venue_match.group(3) or "").strip()

        event_name = title.split(" | Songkick")[0].split(" - Songkick")[0].strip()

        concerts.append(ScrapedConcert(
            event_name=event_name or f"{artist_name} Live",
            artist_name=artist_name,
            venue_name=venue_name,
            city=city,
            country=country or "Unknown",
            date=event_date,
            time=None,
            price_min=_parse_price(combined),
            price_max=None,
            currency="INR" if "india" in country.lower() else "USD",
            source_url=link,
            source="songkick",
        ))

    return concerts


def scrape_songkick(artists: list[dict]) -> list[ScrapedConcert]:
    """
    Scrape Songkick for all tracked artists via SerpAPI.

    Args:
        artists: List of dicts with 'id' and 'artistName' keys.

    Returns:
        List of ScrapedConcert objects.
    """
    api_key = os.environ.get(SERPAPI_KEY_ENV)
    if not api_key:
        logger.warning("SERPAPI_KEY not set. Skipping Songkick scraping.")
        return []

    all_concerts: list[ScrapedConcert] = []

    for artist in artists:
        name = artist.get("artistName", "")
        if not name:
            continue

        logger.info(f"  Songkick: {name}...")
        concerts = _search_artist_concerts(name, api_key)
        all_concerts.extend(concerts)

        if concerts:
            logger.info(f"    Found {len(concerts)} concerts")

        time.sleep(2)  # Rate limit

    # Deduplicate
    seen = set()
    unique = []
    for c in all_concerts:
        key = f"{c.artist_name}|{c.city}|{c.date}"
        if key not in seen:
            seen.add(key)
            unique.append(c)

    logger.info(f"  Songkick total: {len(unique)} unique concerts")
    return unique
