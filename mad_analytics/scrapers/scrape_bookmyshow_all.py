"""
Scrape ALL available music concerts from BookMyShow.
Uses Playwright with stealth mode, persistent session, and human-like behaviour
to bypass Cloudflare protection.

Usage:
    python -m mad_analytics.scrapers.scrape_bookmyshow_all
    python -m mad_analytics.scrapers.scrape_bookmyshow_all --cities mumbai,delhi-ncr
    python -m mad_analytics.scrapers.scrape_bookmyshow_all --headless
"""
from __future__ import annotations
import argparse
import json
import os
import random
import re
import sys
import time
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Load env
_env_path = Path(__file__).parent.parent.parent / "backend" / ".env"
if _env_path.exists():
    with open(_env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and not os.environ.get(key):
                    os.environ[key] = value

from sqlalchemy import create_engine, text

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL", "")
PROFILE_DIR = str(Path(__file__).parent.parent.parent / "bms_profile")

CITIES = [
    "mumbai", "delhi-ncr", "bengaluru", "hyderabad", "chennai",
    "pune", "kolkata", "ahmedabad", "kochi", "jaipur",
    "chandigarh", "lucknow", "indore", "goa",
]

CITY_DISPLAY = {
    "mumbai": "Mumbai", "delhi-ncr": "Delhi", "bengaluru": "Bangalore",
    "hyderabad": "Hyderabad", "chennai": "Chennai", "pune": "Pune",
    "kolkata": "Kolkata", "ahmedabad": "Ahmedabad", "kochi": "Kochi",
    "jaipur": "Jaipur", "chandigarh": "Chandigarh", "lucknow": "Lucknow",
    "indore": "Indore", "goa": "Goa",
}


# ── Human-like behaviour simulation ───────────────────────────────────────────

def _random_delay(min_sec: float = 2.0, max_sec: float = 5.0):
    """Sleep for a random duration to mimic human behaviour."""
    time.sleep(random.uniform(min_sec, max_sec))


def _simulate_human(page):
    """Simulate human-like mouse movements and scrolling."""
    try:
        # Random mouse movement
        x = random.randint(100, 800)
        y = random.randint(100, 500)
        page.mouse.move(x, y)
        time.sleep(random.uniform(0.3, 0.8))

        # Random scroll
        scroll_amount = random.randint(200, 600)
        page.mouse.wheel(0, scroll_amount)
        time.sleep(random.uniform(0.5, 1.5))

        # Another mouse move
        x2 = random.randint(200, 900)
        y2 = random.randint(150, 450)
        page.mouse.move(x2, y2)
        time.sleep(random.uniform(0.2, 0.6))
    except Exception:
        pass


def _is_blocked(page) -> bool:
    """Detect if Cloudflare has blocked the page."""
    try:
        text = page.inner_text("body")
        blocked_indicators = [
            "sorry, you have been blocked",
            "you are unable to access",
            "performance & security by cloudflare",
            "ray id:",
            "attention required",
        ]
        text_lower = text.lower()
        return any(indicator in text_lower for indicator in blocked_indicators)
    except Exception:
        return False


# ── Date and Price parsing ─────────────────────────────────────────────────────

def _parse_date(text: str) -> Optional[str]:
    """Parse date from BMS formats."""
    if not text:
        return None

    current_year = datetime.now().year

    # Full date with year
    patterns_year = [
        r"(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s,]+(\d{4})",
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2})[\s,]+(\d{4})",
    ]
    for pattern in patterns_year:
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

    # Date without year
    patterns_no_year = [
        r"(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)",
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s,]+(\d{1,2})",
    ]
    for pattern in patterns_no_year:
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


def _parse_price(text: str) -> Optional[float]:
    """Extract price from text."""
    match = re.search(r"[₹]\s*([\d,]+)", text)
    if match:
        cleaned = match.group(1).replace(",", "")
        if cleaned:
            try:
                return float(cleaned)
            except ValueError:
                pass
    return None


def _parse_all_prices(text: str) -> list[float]:
    """Extract ALL prices from text."""
    matches = re.findall(r"₹\s*([\d,]+)", text)
    prices = []
    for m in matches:
        cleaned = m.replace(",", "")
        if cleaned:
            try:
                val = float(cleaned)
                if 50 <= val <= 500_000:  # Reasonable ticket price range
                    prices.append(val)
            except ValueError:
                pass
    return sorted(set(prices))


def _extract_artist(title: str) -> str:
    """Extract artist name from event title."""
    cleaned = re.sub(
        r"\s*[-–|:]\s*(Live|Tour|Concert|Show|India|Mumbai|Delhi|Bangalore|Hyderabad|Chennai|Pune|Kolkata|in Concert).*$",
        "", title, flags=re.IGNORECASE
    )
    cleaned = re.sub(r"\s+(Live|Tour|Concert|Show|Performing)$", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip() or title.strip()


# ── Scraping functions ─────────────────────────────────────────────────────────

def scrape_listing_page(page, city_slug: str) -> list[dict]:
    """Scrape the music listing page for a city. Returns basic concert info."""
    concerts = []
    city_name = CITY_DISPLAY.get(city_slug, city_slug.title())
    url = f"https://in.bookmyshow.com/explore/music-shows-{city_slug}"

    logger.info(f"  Listing page: {url}")

    page.goto(url, wait_until="domcontentloaded", timeout=45000)
    _random_delay(3, 6)
    _simulate_human(page)

    # Scroll to load more
    for _ in range(4):
        page.evaluate("window.scrollBy(0, 1200)")
        _random_delay(1.5, 3)

    if _is_blocked(page):
        logger.warning(f"    BLOCKED on listing page for {city_slug}")
        return []

    # Collect URLs and basic info from cards
    cards_data = page.evaluate("""() => {
        const cards = document.querySelectorAll('a[href*="/events/"], a[href*="/live/"]');
        return Array.from(cards).map(card => ({
            href: card.href,
            text: card.innerText
        }));
    }""")

    logger.info(f"    Found {len(cards_data)} event cards")

    for card in cards_data:
        href = card.get("href", "")
        text = card.get("text", "")
        if not text or len(text) < 5:
            continue

        lines = [l.strip() for l in text.split("\n") if l.strip()]
        if not lines:
            continue

        event_name = lines[0]
        if len(event_name) < 3 or len(event_name) > 150:
            continue

        # BMS card: Event Name / Venue: City / Category / ₹ Price onwards
        venue_name = ""
        price = None
        for line in lines[1:]:
            if "₹" in line:
                price = _parse_price(line)
            elif not venue_name and len(line) > 3 and len(line) < 80 and "₹" not in line:
                venue_name = re.sub(r":\s*\w+$", "", line).strip()

        concerts.append({
            "event_name": event_name,
            "artist_name": _extract_artist(event_name),
            "venue_name": venue_name,
            "city": city_name,
            "country": "India",
            "date": None,
            "price_min": price,
            "prices": [],
            "source_url": href,
            "source": "bookmyshow",
        })

    return concerts


def scrape_event_detail(page, concert: dict, max_retries: int = 3) -> dict:
    """Visit an event detail page to get date and full pricing tiers."""
    url = concert.get("source_url", "")
    if not url:
        return concert

    for attempt in range(max_retries):
        try:
            # Human-like pre-navigation delay
            _random_delay(5, 9)

            page.goto(url, wait_until="networkidle", timeout=30000)
            _random_delay(2, 4)
            _simulate_human(page)

            # Scroll to reveal pricing section
            page.evaluate("window.scrollBy(0, 400)")
            _random_delay(1, 2)

            # Check if blocked
            if _is_blocked(page):
                if attempt < max_retries - 1:
                    logger.warning(f"    Blocked (attempt {attempt+1}/{max_retries}), waiting...")
                    _random_delay(15, 25)  # Long wait before retry
                    continue
                else:
                    logger.warning(f"    Blocked after {max_retries} attempts, skipping.")
                    return concert

            # Extract page content
            body_text = page.inner_text("body")

            # Extract date
            event_date = _parse_date(body_text[:3000])
            if event_date:
                concert["date"] = event_date

            # Extract ALL prices (tier pricing)
            all_prices = _parse_all_prices(body_text[:5000])
            if all_prices:
                concert["prices"] = all_prices
                concert["price_min"] = min(all_prices)
                concert["price_max"] = max(all_prices)

                # Map to tier structure
                if len(all_prices) >= 4:
                    concert["price_tier3"] = all_prices[0]   # Cheapest
                    concert["price_tier2"] = all_prices[len(all_prices)//3]
                    concert["price_tier1"] = all_prices[2*len(all_prices)//3]
                    concert["price_vip"] = all_prices[-1]    # Most expensive
                elif len(all_prices) == 3:
                    concert["price_tier3"] = all_prices[0]
                    concert["price_tier2"] = all_prices[1]
                    concert["price_vip"] = all_prices[2]
                elif len(all_prices) == 2:
                    concert["price_tier3"] = all_prices[0]
                    concert["price_vip"] = all_prices[1]

            # Extract time
            time_match = re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))", body_text[:2000])
            if time_match:
                concert["time"] = time_match.group(1)

            # Success — break retry loop
            break

        except Exception as e:
            if attempt < max_retries - 1:
                _random_delay(8, 15)
            else:
                logger.debug(f"    Detail page failed: {e}")

    return concert


# ── Database storage ───────────────────────────────────────────────────────────

def _normalize_db_url(url: str) -> str:
    return url.replace("postgres://", "postgresql://", 1) if url.startswith("postgres://") else url


def store_concerts(concerts: list[dict], db_url: str) -> tuple[int, int]:
    """Store concerts in DB. Returns (stored, skipped)."""
    engine = create_engine(_normalize_db_url(db_url))
    stored = 0
    skipped = 0

    with engine.begin() as conn:
        for concert in concerts:
            if not concert.get("artist_name"):
                skipped += 1
                continue

            # Use placeholder date if none found
            concert_date = concert.get("date")
            if not concert_date:
                concert_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")

            # Check duplicate
            existing = conn.execute(text("""
                SELECT id FROM concerts
                WHERE "artistName" ILIKE :artist
                  AND "concertDate" = :date
                  AND city = :city
                LIMIT 1
            """), {
                "artist": concert["artist_name"],
                "date": concert_date,
                "city": concert.get("city") or "",
            }).first()

            if existing:
                skipped += 1
                continue

            # Find artist in DB (required for storage)
            artist_row = conn.execute(text("""
                SELECT id FROM artists
                WHERE "artistName" ILIKE :name
                   OR :name ILIKE '%' || "artistName" || '%'
                LIMIT 1
            """), {"name": concert["artist_name"]}).first()

            if not artist_row:
                skipped += 1
                continue

            artist_id = artist_row[0]

            # Calculate avg ticket price from tiers
            avg_price = concert.get("price_min") or 0
            prices = concert.get("prices", [])
            if prices:
                avg_price = sum(prices) / len(prices)

            conn.execute(text("""
                INSERT INTO concerts (
                    id, "artistId", "concertDate", city, country,
                    "venueName", capacity, "ticketsSold",
                    "avgTicketPrice", "totalRevenue", currency,
                    "ticketPriceVip", "ticketPriceTier1", "ticketPriceTier2", "ticketPriceTier3",
                    "artistName", source, "sourceUrl", notes,
                    "verificationStatus", created_at
                ) VALUES (
                    gen_random_uuid(), :artist_id, :date, :city, :country,
                    :venue, 0, 0,
                    :avg_price, 0, 'INR',
                    :vip, :tier1, :tier2, :tier3,
                    :artist_name, 'bookmyshow', :source_url, :notes,
                    'PENDING', NOW()
                )
            """), {
                "artist_id": artist_id,
                "date": concert_date,
                "city": concert.get("city") or "TBA",
                "country": "India",
                "venue": concert.get("venue_name") or None,
                "avg_price": round(avg_price, 2),
                "vip": concert.get("price_vip"),
                "tier1": concert.get("price_tier1"),
                "tier2": concert.get("price_tier2"),
                "tier3": concert.get("price_tier3"),
                "artist_name": concert["artist_name"],
                "source_url": concert.get("source_url") or "",
                "notes": (
                    f"Scraped from BookMyShow on {datetime.now().strftime('%Y-%m-%d')}. "
                    f"Event: {concert['event_name']}. "
                    f"Prices: {concert.get('prices', [])}. "
                    f"Time: {concert.get('time') or 'TBA'}."
                ),
            })
            stored += 1

    engine.dispose()
    return stored, skipped


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Scrape BookMyShow concerts")
    parser.add_argument("--cities", default="", help="Comma-separated city slugs")
    parser.add_argument("--headless", action="store_true", help="Run in headless mode (less reliable)")
    parser.add_argument("--max-details", type=int, default=10, help="Max event detail pages to visit per city")
    args = parser.parse_args()

    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)

    cities = args.cities.split(",") if args.cities else CITIES

    print("=" * 60)
    print("  BookMyShow Scraper — Stealth Mode")
    print("=" * 60)
    print(f"  Cities: {', '.join(cities)}")
    print(f"  Mode: {'headless' if args.headless else 'visible (stealth)'}")
    print(f"  Max detail pages per city: {args.max_details}")
    print()

    from playwright.sync_api import sync_playwright
    try:
        from playwright_stealth import Stealth
        stealth = Stealth()
    except ImportError:
        stealth = None

    all_concerts = []

    with sync_playwright() as p:
        # Launch with anti-detection settings
        context = p.chromium.launch_persistent_context(
            user_data_dir=PROFILE_DIR,
            headless=args.headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--start-maximized",
                "--no-first-run",
                "--disable-extensions",
            ],
            locale="en-IN",
            timezone_id="Asia/Kolkata",
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )

        page = context.pages[0] if context.pages else context.new_page()

        # Apply stealth (hide automation fingerprints)
        if stealth:
            stealth.apply_stealth_sync(page)

        for city in cities:
            logger.info(f"\n{'='*40}")
            logger.info(f"City: {CITY_DISPLAY.get(city, city)}")
            logger.info(f"{'='*40}")

            # Step 1: Scrape listing page (get all events with basic info)
            concerts = scrape_listing_page(page, city)
            logger.info(f"  Listing: {len(concerts)} events found")

            # Step 2: Visit detail pages for a subset (get dates + full pricing)
            events_to_detail = random.sample(
                concerts,
                min(args.max_details, len(concerts))
            ) if concerts else []

            logger.info(f"  Fetching details for {len(events_to_detail)} events...")

            for i, concert in enumerate(events_to_detail):
                logger.info(f"    [{i+1}/{len(events_to_detail)}] {concert['event_name'][:40]}...")
                scrape_event_detail(page, concert)
                if concert.get("date"):
                    logger.info(f"      Date: {concert['date']}, Prices: {concert.get('prices', [])}")

            all_concerts.extend(concerts)
            _random_delay(3, 6)

        context.close()

    # Deduplicate
    seen = set()
    unique = []
    for c in all_concerts:
        key = f"{c['event_name']}|{c.get('city')}|{c.get('date')}"
        if key not in seen:
            seen.add(key)
            unique.append(c)

    print(f"\n  Total scraped: {len(unique)} unique concerts")
    with_dates = sum(1 for c in unique if c.get("date"))
    with_prices = sum(1 for c in unique if c.get("prices"))
    print(f"  With dates: {with_dates}")
    print(f"  With tier pricing: {with_prices}")

    # Store
    if unique:
        print(f"\n  Storing in database...")
        stored, skipped = store_concerts(unique, DATABASE_URL)
        print(f"  Stored: {stored}, Skipped: {skipped}")
    else:
        print("  No concerts to store.")

    print(f"\n{'='*60}")
    print(f"  Done.")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
