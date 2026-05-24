"""
BookMyShow scraper — searches for concerts by artist name using SerpAPI.
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


def _search_artist_on_bms(artist_name: str, api_key: str) -> list[ScrapedConcert]:
    """Search BookMyShow for a specific artist's concerts via SerpAPI."""
    concerts = []
    query = f'"{artist_name}" bookmyshow concert live 2025 2026 tickets India'

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
        logger.warning(f"  BMS search failed for {artist_name}: {e}")
        return []

    # Parse Google Events results
    for event in data.get("events_results", []):
        title = event.get("title", "")
        if artist_name.lower() not in title.lower():
            continue

        date_info = event.get("date", "")
        venue_info = event.get("venue", {}) if isinstance(event.get("venue"), dict) else {}
        address = event.get("address", [])
        link = event.get("link", "")

        event_date = _parse_date(str(date_info)) if isinstance(date_info, str) else _parse_date(str(date_info.get("when", ""))) if isinstance(date_info, dict) else None
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
                source="bookmyshow",
            ))

    # Parse organic results from BookMyShow
    for item in data.get("organic_results", []):
        title = item.get("title", "")
        snippet = item.get("snippet", "")
        link = item.get("link", "")

        if "bookmyshow" not in link.lower():
            continue
        if any(skip in title.lower() for skip in ["music shows in", "upcoming events", "explore", "near you"]):
            continue

        combined = f"{title} {snippet}"
        event_date = _parse_date(combined)
        if not event_date:
            continue

        event_name = title.split(" - BookMyShow")[0].split(" | BookMyShow")[0].strip()
        price = _parse_price(combined)

        # Extract city from URL
        city = ""
        city_match = re.search(r"bookmyshow\.com/([a-z-]+)/", link)
        if city_match:
            slug = city_match.group(1)
            city_map = {"mumbai": "Mumbai", "delhi-ncr": "Delhi", "bengaluru": "Bangalore",
                        "hyderabad": "Hyderabad", "chennai": "Chennai", "pune": "Pune",
                        "kolkata": "Kolkata", "ahmedabad": "Ahmedabad", "kochi": "Kochi"}
            city = city_map.get(slug, slug.replace("-", " ").title())

        concerts.append(ScrapedConcert(
            event_name=event_name,
            artist_name=artist_name,
            venue_name="",
            city=city,
            country="India",
            date=event_date,
            time=None,
            price_min=price,
            price_max=None,
            currency="INR",
            source_url=link,
            source="bookmyshow",
        ))

    return concerts


def scrape_bookmyshow(artists: list[dict] = None, cities: list[str] = None) -> list[ScrapedConcert]:
    """
    Scrape BookMyShow for tracked artists.

    Args:
        artists: List of dicts with 'artistName'. If None, returns empty.
        cities: Ignored (searches by artist name, not city).
    """
    api_key = os.environ.get(SERPAPI_KEY_ENV)
    if not api_key:
        logger.warning("SERPAPI_KEY not set. Skipping BookMyShow.")
        return []

    if not artists:
        return []

    all_concerts: list[ScrapedConcert] = []

    for artist in artists:
        name = artist.get("artistName", "")
        if not name:
            continue

        logger.info(f"  BMS: {name}...")
        concerts = _search_artist_on_bms(name, api_key)
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

    logger.info(f"  BMS total: {len(unique)} unique concerts")
    return unique
