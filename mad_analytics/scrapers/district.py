"""
District (by Zomato) scraper — searches for concerts by artist name using SerpAPI.
Fetches concert details for artists present in the database.
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


def _parse_price(text: str) -> Optional[float]:
    match = re.search(r"[₹Rs\.]+\s*([\d,]+)", text)
    if match:
        cleaned = match.group(1).replace(",", "").strip()
        if cleaned:
            try:
                return float(cleaned)
            except ValueError:
                pass
    return None


def _parse_date(text: str) -> Optional[str]:
    current_year = datetime.now().year
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
                if dt.year >= 2025:
                    return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue
    # Without year
    patterns2 = [
        r"(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)",
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s,]+(\d{1,2})",
    ]
    for pattern in patterns2:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            groups = match.groups()
            try:
                if groups[0].isdigit():
                    dt = datetime.strptime(f"{groups[0]} {groups[1]} {current_year}", "%d %b %Y")
                else:
                    dt = datetime.strptime(f"{groups[0]} {groups[1]} {current_year}", "%b %d %Y")
                if dt < datetime.now():
                    dt = dt.replace(year=current_year + 1)
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue
    return None


def _is_music_event(title: str, snippet: str) -> bool:
    combined = f"{title} {snippet}".lower()
    music_kw = ["concert", "live", "tour", "music", "singing", "band", "dj",
                "festival", "acoustic", "unplugged", "gig"]
    exclude_kw = ["comedy", "standup", "stand-up", "workshop", "food", "ipl", "cricket"]
    if any(kw in combined for kw in exclude_kw):
        return False
    return any(kw in combined for kw in music_kw)


def _search_artist_on_district(artist_name: str, api_key: str) -> list[ScrapedConcert]:
    """Search District.in for a specific artist's concerts via SerpAPI."""
    concerts = []
    query = f'"{artist_name}" district.in concert live event 2025 2026'

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
        logger.warning(f"  District search failed for {artist_name}: {e}")
        return []

    # Google Events
    for event in data.get("events_results", []):
        title = event.get("title", "")
        if artist_name.lower() not in title.lower():
            continue

        date_info = event.get("date", "")
        venue_info = event.get("venue", {}) if isinstance(event.get("venue"), dict) else {}
        address = event.get("address", [])
        link = event.get("link", "")

        event_date = _parse_date(str(date_info)) if isinstance(date_info, str) else None
        venue_name = venue_info.get("name", "") if isinstance(venue_info, dict) else ""
        city = address[0] if isinstance(address, list) and address else ""

        if event_date:
            concerts.append(ScrapedConcert(
                event_name=title,
                artist_name=artist_name,
                venue_name=venue_name,
                city=city,
                country="India",
                date=event_date,
                time=None,
                price_min=None,
                price_max=None,
                currency="INR",
                source_url=link,
                source="district",
            ))

    # Organic results from district.in
    for item in data.get("organic_results", []):
        title = item.get("title", "")
        snippet = item.get("snippet", "")
        link = item.get("link", "")

        if "district.in" not in link.lower():
            continue
        if not _is_music_event(title, snippet):
            continue
        if link.endswith("/events/") or link.endswith("/events"):
            continue

        combined = f"{title} {snippet}"
        event_date = _parse_date(combined)
        if not event_date:
            continue

        event_name = title.split(" - District")[0].split(" | ")[0].strip()
        price = _parse_price(combined)

        concerts.append(ScrapedConcert(
            event_name=event_name,
            artist_name=artist_name,
            venue_name="",
            city="",
            country="India",
            date=event_date,
            time=None,
            price_min=price,
            price_max=None,
            currency="INR",
            source_url=link,
            source="district",
        ))

    return concerts


def scrape_district(artists: list[dict] = None, cities: list[str] = None) -> list[ScrapedConcert]:
    """
    Scrape District (Zomato) for tracked artists.

    Args:
        artists: List of dicts with 'artistName'. If None, returns empty.
        cities: Ignored (searches by artist name).
    """
    api_key = os.environ.get(SERPAPI_KEY_ENV)
    if not api_key:
        logger.warning("SERPAPI_KEY not set. Skipping District.")
        return []

    if not artists:
        return []

    all_concerts: list[ScrapedConcert] = []

    for artist in artists:
        name = artist.get("artistName", "")
        if not name:
            continue

        logger.info(f"  District: {name}...")
        concerts = _search_artist_on_district(name, api_key)
        all_concerts.extend(concerts)
        if concerts:
            logger.info(f"    Found {len(concerts)} concerts")
        time.sleep(2)

    # Deduplicate
    seen = set()
    unique = []
    for c in all_concerts:
        key = f"{c.artist_name}|{c.city}|{c.date}"
        if key not in seen:
            seen.add(key)
            unique.append(c)

    logger.info(f"  District total: {len(unique)} unique concerts")
    return unique
