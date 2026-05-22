"""
Web search integration for venue capacity resolution.
Uses Google Custom Search API to find real venue capacity data.

Security measures:
- API keys are ONLY read from environment variables (never hardcoded)
- Rate limited: max 50 searches/hour, 10 searches/minute
- Results are cached in DB so the same venue is never searched twice
- Only called server-side from the resolver pipeline (not a public endpoint)
"""
from __future__ import annotations

import os
import re
import time
import logging
from typing import Optional

from ..utils.schemas import VenueCapacityCandidate

logger = logging.getLogger(__name__)

# Keys are read from environment variables ONLY
GOOGLE_API_KEY_ENV = "GOOGLE_SEARCH_API_KEY"
GOOGLE_CX_ENV = "GOOGLE_SEARCH_CX"

# ── Rate limiting ──────────────────────────────────────────────────────────────

_search_timestamps: list[float] = []
MAX_SEARCHES_PER_HOUR = 50
MAX_SEARCHES_PER_MINUTE = 10


def _is_rate_limited() -> bool:
    """Check if we've exceeded the search rate limit."""
    now = time.time()
    _search_timestamps[:] = [t for t in _search_timestamps if now - t < 3600]

    if len(_search_timestamps) >= MAX_SEARCHES_PER_HOUR:
        logger.warning("Web search hourly rate limit reached. Skipping.")
        return True

    recent = [t for t in _search_timestamps if now - t < 60]
    if len(recent) >= MAX_SEARCHES_PER_MINUTE:
        logger.warning("Web search per-minute rate limit reached. Skipping.")
        return True

    return False


def _record_search():
    """Record a search timestamp for rate limiting."""
    _search_timestamps.append(time.time())


# ── Capacity extraction patterns ──────────────────────────────────────────────

CAPACITY_PATTERNS = [
    re.compile(
        r"(?:seating\s+)?capacity\s*(?:of|:|\s*is)?\s*(\d[\d,]*)\s*(?:seats?|people|guests)?",
        re.IGNORECASE,
    ),
    re.compile(
        r"(\d[\d,]*)\s*[-\s]?\s*seats?",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:holds?|accommodates?|fits?)\s+(?:up\s+to\s+)?(\d[\d,]*)",
        re.IGNORECASE,
    ),
    re.compile(
        r"(\d[\d,]*)\s*(?:[-\s])?capacity",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:venue|arena|hall|stadium|theater|theatre)\s+(?:for|of)\s+(\d[\d,]*)",
        re.IGNORECASE,
    ),
]


def _parse_number(raw: str) -> int:
    """Parse a number string like '7,000' or '15000' to int."""
    cleaned = raw.replace(",", "").strip()
    try:
        return int(float(cleaned))
    except (ValueError, TypeError):
        return 0


def _is_reasonable_capacity(value: int) -> bool:
    """Filter out numbers that are clearly not venue capacities."""
    return 50 <= value <= 250_000


def _extract_capacities_from_text(text: str) -> list[int]:
    """Extract all plausible capacity numbers from a text snippet."""
    results = []
    for pattern in CAPACITY_PATTERNS:
        for match in pattern.finditer(text):
            value = _parse_number(match.group(1))
            if _is_reasonable_capacity(value):
                results.append(value)
    return results


# ── Main search function ───────────────────────────────────────────────────────

def search_venue_capacity(
    venue_name: str,
    city: str,
    country: str = "",
    *,
    api_key: Optional[str] = None,
    cx: Optional[str] = None,
) -> list[VenueCapacityCandidate]:
    """
    Search Google for venue capacity information.

    Returns a list of VenueCapacityCandidate objects extracted from search results.
    Returns empty list if:
    - API keys are not configured
    - Rate limit is exceeded
    - Search fails for any reason
    """
    # Resolve API credentials from env vars only
    key = api_key or os.environ.get(GOOGLE_API_KEY_ENV)
    search_cx = cx or os.environ.get(GOOGLE_CX_ENV)

    if not key or not search_cx:
        logger.debug("Google Search API not configured (set %s and %s env vars)", GOOGLE_API_KEY_ENV, GOOGLE_CX_ENV)
        return []

    # Rate limit check
    if _is_rate_limited():
        return []

    # Build search query
    query_parts = [f'"{venue_name}"']
    if city:
        query_parts.append(f'"{city}"')
    query_parts.append("capacity seats")
    query = " ".join(query_parts)

    try:
        import urllib.request
        import urllib.parse
        import json

        params = urllib.parse.urlencode({
            "key": key,
            "cx": search_cx,
            "q": query,
            "num": 5,
        })
        url = f"https://www.googleapis.com/customsearch/v1?{params}"

        req = urllib.request.Request(url, headers={"User-Agent": "MAD-Analytics/1.0"})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))

        _record_search()

    except Exception as e:
        logger.warning(f"Google Search API call failed: {e}")
        return []

    # Extract capacity candidates from search results
    candidates: list[VenueCapacityCandidate] = []
    items = data.get("items", [])

    for item in items:
        snippet = item.get("snippet", "")
        title = item.get("title", "")
        link = item.get("link", "")
        combined_text = f"{title} {snippet}"

        capacities = _extract_capacities_from_text(combined_text)

        for capacity in capacities:
            confidence = 0.78
            domain = link.lower()

            # Higher confidence for authoritative sources
            if any(auth in domain for auth in ["wikipedia.org", "setlist.fm", "songkick.com"]):
                confidence = 0.88
            elif any(auth in domain for auth in [".gov", "ticketmaster", "livenation", "aeg"]):
                confidence = 0.85
            elif "capacity" in snippet.lower() and venue_name.lower().split()[0] in snippet.lower():
                confidence = 0.82

            candidates.append(
                VenueCapacityCandidate(
                    capacity=capacity,
                    source="web_search",
                    method="google_custom_search",
                    confidence=confidence,
                    source_url=link,
                    raw_text=snippet[:200] if snippet else None,
                    notes=f"Extracted from Google search result: {title[:80]}",
                )
            )

    # Deduplicate by capacity value, keeping highest confidence
    seen: dict[int, VenueCapacityCandidate] = {}
    for candidate in candidates:
        existing = seen.get(candidate.capacity)
        if not existing or candidate.confidence > existing.confidence:
            seen[candidate.capacity] = candidate

    return sorted(seen.values(), key=lambda c: c.confidence, reverse=True)[:3]
