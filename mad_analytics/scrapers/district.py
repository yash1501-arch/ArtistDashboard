"""
District (by Zomato) concert scraper.
Uses SerpAPI to search for District.in concert listings.
"""
from __future__ import annotations

import json
import os
import re
import time
import logging
from datetime import datetime
from typing import Optional

from .models import ScrapedConcert

logger = logging.getLogger(__name__)

BASE_URL = "https://www.district.in"
SERPAPI_KEY_ENV = "SERPAPI_KEY"

CITIES = [
    ("mumbai", "Mumbai"),
    ("delhi-ncr", "Delhi"),
    ("bengaluru", "Bangalore"),
    ("hyderabad", "Hyderabad"),
    ("chennai", "Chennai"),
    ("pune", "Pune"),
    ("kolkata", "Kolkata"),
    ("ahmedabad", "Ahmedabad"),
    ("kochi", "Kochi"),
    ("jaipur", "Jaipur"),
]


def _parse_price(text: str) -> Optional[float]:
    """Extract price from text."""
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
    """Parse date from search snippet."""
    patterns = [
        r"(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s,]+(\d{4})",
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2})[\s,]+(\d{4})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            groups = match.groups()
            try:
                if len(groups[0]) <= 2:
                    dt = datetime.strptime(f"{groups[0]} {groups[1]} {groups[2]}", "%d %b %Y")
                else:
                    dt = datetime.strptime(f"{groups[0]} {groups[1]} {groups[2]}", "%b %d %Y")
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue
    return None


def _parse_time(text: str) -> Optional[str]:
    """Extract time from text."""
    match = re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))", text)
    return match.group(1).strip() if match else None


def _is_music_event(title: str, snippet: str) -> bool:
    """Check if the event is music-related."""
    combined = f"{title} {snippet}".lower()
    music_kw = ["concert", "live", "tour", "music", "singing", "band", "dj",
                "festival", "acoustic", "unplugged", "gig", "jamming", "bhakti", "sufi"]
    exclude_kw = ["comedy", "standup", "stand-up", "workshop", "class", "food", "dining", "ipl", "cricket"]

    if any(kw in combined for kw in exclude_kw):
        return False
    return any(kw in combined for kw in music_kw)


def _search_concerts_via_serpapi(city_name: str, api_key: str) -> list[ScrapedConcert]:
    """Use SerpAPI to find District.in concert listings for a city."""
    concerts = []

    query = f"site:district.in {city_name} music concert live event 2026"

    try:
        import urllib.request
        import urllib.parse

        params = urllib.parse.urlencode({
            "api_key": api_key,
            "engine": "google",
            "q": query,
            "num": 20,
        })
        url = f"https://serpapi.com/search.json?{params}"
        req = urllib.request.Request(url, headers={"User-Agent": "MAD-Analytics/1.0"})

        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))

    except Exception as e:
        logger.warning(f"SerpAPI search failed for District {city_name}: {e}")
        return []

    for item in data.get("organic_results", []):
        title = item.get("title", "")
        snippet = item.get("snippet", "")
        link = item.get("link", "")
        combined = f"{title} {snippet}"

        # Only process music events
        if not _is_music_event(title, snippet):
            continue

        # Skip listing pages
        if link.endswith("/events/") or link.endswith("/events"):
            continue

        # Extract data
        event_name = title.split(" - District")[0].split(" | ")[0].strip()
        if not event_name:
            continue

        artist_name = _extract_artist(event_name)
        event_date = _parse_date(combined)
        event_time = _parse_time(combined)
        price = _parse_price(combined)

        # Extract venue from snippet
        venue_name = ""
        venue_match = re.search(r"(?:at|@|venue[:\s])\s*([^,₹\n]+?)(?:\s*,|\s*₹|\s*$)", combined, re.IGNORECASE)
        if venue_match:
            venue = venue_match.group(1).strip()
            if len(venue) < 60 and not any(kw in venue.lower() for kw in ["onwards", "book", "ticket"]):
                venue_name = venue

        concerts.append(ScrapedConcert(
            event_name=event_name,
            artist_name=artist_name,
            venue_name=venue_name,
            city=city_name,
            country="India",
            date=event_date,
            time=event_time,
            price_min=price,
            price_max=None,
            currency="INR",
            source_url=link,
            source="district",
        ))

    return concerts


def _extract_artist(title: str) -> str:
    """Extract artist name from event title."""
    cleaned = re.sub(r"\s*[-–|]\s*(Live|Tour|Concert|Show|India|Mumbai|Delhi|Bangalore).*$", "", title, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+(Live|Tour|Concert|Show|Performing)$", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip() or title.strip()


def scrape_district(cities: list[str] = None) -> list[ScrapedConcert]:
    """
    Scrape concert listings from District (Zomato) via SerpAPI.

    Args:
        cities: List of city slugs. Defaults to all major cities.

    Returns:
        List of ScrapedConcert objects.
    """
    api_key = os.environ.get(SERPAPI_KEY_ENV)
    if not api_key:
        logger.warning("SERPAPI_KEY not set. Cannot scrape District.")
        return []

    target_cities = cities or [slug for slug, _ in CITIES]
    city_names = {slug: name for slug, name in CITIES}
    all_concerts: list[ScrapedConcert] = []

    for city_slug in target_cities:
        city_name = city_names.get(city_slug, city_slug.replace("-", " ").title())
        logger.info(f"Searching District concerts in {city_name}...")
        concerts = _search_concerts_via_serpapi(city_name, api_key)
        all_concerts.extend(concerts)
        logger.info(f"  Found {len(concerts)} music events")
        time.sleep(2)

    # Deduplicate
    seen = set()
    unique = []
    for c in all_concerts:
        key = f"{c.event_name}|{c.city}|{c.date}"
        if key not in seen:
            seen.add(key)
            unique.append(c)

    logger.info(f"District total: {len(unique)} unique concerts")
    return unique
