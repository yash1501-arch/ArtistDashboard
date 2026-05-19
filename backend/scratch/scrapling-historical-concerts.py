import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus, urlparse

from scrapling import DynamicFetcher, Fetcher, StealthyFetcher


FETCHERS = {
    "static": Fetcher,
    "dynamic": DynamicFetcher,
    "stealth": StealthyFetcher,
}

SOURCE_HINTS = {
    "bookmyshow.com": "BOOKMYSHOW",
    "eventbrite.com": "EVENTBRITE",
    "songkick.com": "SONGKICK",
    "bandsintown.com": "BANDSINTOWN",
    "ticketmaster.com": "TICKETMASTER",
    "insider.in": "INSIDER",
    "district.in": "DISTRICT",
}

SEARCH_TEMPLATES = [
    'https://www.google.com/search?q={query}',
    'https://www.bing.com/search?q={query}',
]

DEFAULT_ENV_FILES = [
    Path(__file__).resolve().parents[1] / ".env",
    Path(__file__).resolve().parents[1] / "ml_engine" / ".env",
]

EVENT_URL_PATTERNS = [
    re.compile(r"https?://(?:in\.)?bookmyshow\.com/events/[^\s\"'<>]+", re.IGNORECASE),
    re.compile(r"https?://(?:www\.)?eventbrite\.[a-z.]+/e/[^\s\"'<>]+", re.IGNORECASE),
    re.compile(r"https?://(?:www\.)?songkick\.com/[^\s\"'<>]+", re.IGNORECASE),
    re.compile(r"https?://(?:www\.)?bandsintown\.com/e/[^\s\"'<>]+", re.IGNORECASE),
    re.compile(r"https?://(?:www\.)?ticketmaster\.[a-z.]+/[^\s\"'<>]+", re.IGNORECASE),
    re.compile(r"https?://(?:www\.)?(?:insider|district)\.in/[^\s\"'<>]+", re.IGNORECASE),
]

NOISE_EVENT_NAMES = {
    "bookmyshow",
    "eventbrite",
    "sign in",
    "search",
    "find events",
}


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_url(value: str) -> str:
    value = value.split("&sa=")[0]
    value = value.split("&ved=")[0]
    value = value.rstrip(").,;'\"")
    return value.replace("\\u0026", "&")


def fetch_page(fetcher_name: str, url: str) -> Any:
    fetcher = FETCHERS[fetcher_name]
    kwargs = {
        "timeout": 45_000,
        "headers": {
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent": "ArtistIQ-ConcertHistory/1.0",
        },
    }
    if fetcher_name == "static":
        return fetcher.get(url, **kwargs)

    kwargs.pop("headers")
    kwargs.update({
        "useragent": "ArtistIQ-ConcertHistory/1.0",
        "extra_headers": {"Accept-Language": "en-US,en;q=0.9"},
        "headless": True,
        "wait": 4_000,
        "network_idle": True,
        "disable_resources": False,
    })
    return fetcher.fetch(url, **kwargs)


def first_text(root: Any, selectors: list[str]) -> str:
    for selector in selectors:
        try:
            matches = root.css(selector)
        except Exception:
            continue
        for match in matches:
            value = clean_text(match.get_all_text(" ", strip=True))
            if value:
                return value
    return ""


def iter_json_nodes(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for node in value for item in iter_json_nodes(node)]
    if not isinstance(value, dict):
        return []

    nodes = [value]
    graph = value.get("@graph")
    if isinstance(graph, list):
        nodes.extend(item for node in graph for item in iter_json_nodes(node))
    return nodes


def is_event_node(node: dict[str, Any]) -> bool:
    node_type = node.get("@type")
    types = node_type if isinstance(node_type, list) else [node_type]
    normalized = {str(item).lower() for item in types}
    return "event" in normalized or "musicevent" in normalized


def value_name(value: Any) -> str:
    if isinstance(value, dict):
        return clean_text(value.get("name"))
    if isinstance(value, list):
        return clean_text(", ".join(name for item in value if (name := value_name(item))))
    return clean_text(value)


def value_url(value: Any) -> str:
    if isinstance(value, dict):
        return clean_text(value.get("url"))
    if isinstance(value, list):
        for item in value:
            found = value_url(item)
            if found:
                return found
    return clean_text(value)


def source_platform(url: str) -> str:
    host = urlparse(url).netloc.lower()
    for domain, platform in SOURCE_HINTS.items():
        if domain in host:
            return platform
    return "WEB"


def extract_jsonld(page: Any, url: str, fallback_artist: str, country: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for script in page.css('script[type="application/ld+json"]'):
        content = clean_text(script.get_all_text(" ", strip=True))
        if not content:
            continue
        try:
            parsed = json.loads(content)
        except Exception:
            continue
        for node in iter_json_nodes(parsed):
            if not is_event_node(node):
                continue
            location = node.get("location") if isinstance(node.get("location"), dict) else {}
            address = location.get("address") if isinstance(location, dict) and isinstance(location.get("address"), dict) else {}
            offer = node.get("offers")
            offer = offer[0] if isinstance(offer, list) and offer else offer if isinstance(offer, dict) else {}
            event = {
                "artistName": value_name(node.get("performer") or node.get("organizer")) or fallback_artist,
                "eventName": clean_text(node.get("name")),
                "venueName": value_name(location),
                "city": clean_text(address.get("addressLocality")) if isinstance(address, dict) else "",
                "country": clean_text(address.get("addressCountry")) if isinstance(address, dict) else country,
                "eventDate": clean_text(node.get("startDate")),
                "sourcePlatform": source_platform(url),
                "sourceUrl": value_url(node.get("url")) or url,
                "officialTicketUrl": value_url(offer.get("url")) if isinstance(offer, dict) else url,
                "ticketPriceRange": {
                    "min": offer.get("lowPrice") or offer.get("price") if isinstance(offer, dict) else None,
                    "max": offer.get("highPrice") if isinstance(offer, dict) else None,
                    "currency": offer.get("priceCurrency") if isinstance(offer, dict) else None,
                },
                "confidenceScore": 0.88,
                "rawPayload": {"extraction": "jsonld"},
            }
            events.append(event)
    return events


def extract_urls_from_search_page(page: Any) -> list[str]:
    urls: list[str] = []
    html = clean_text(getattr(page, "body", b"").decode("utf-8", errors="ignore") if isinstance(getattr(page, "body", b""), bytes) else getattr(page, "body", ""))
    text = clean_text(page.get_all_text(" ", strip=True))
    for source in [html, text]:
        for pattern in EVENT_URL_PATTERNS:
            urls.extend(normalize_url(match.group(0)) for match in pattern.finditer(source))

    try:
        for link in page.css("a[href]"):
            href = clean_text(link.attrib.get("href"))
            if href.startswith("/url?q="):
                href = href.removeprefix("/url?q=").split("&", 1)[0]
            if any(pattern.search(href) for pattern in EVENT_URL_PATTERNS):
                urls.append(normalize_url(href))
    except Exception:
        pass

    return dedupe_strings(urls)


def discover_urls(artist: str, years: list[int], fetcher_name: str, max_searches: int) -> tuple[list[str], list[str]]:
    urls: list[str] = []
    errors: list[str] = []
    searches = 0
    for year in years:
        queries = [
            f'"{artist}" concert {year} site:bookmyshow.com/events',
            f'"{artist}" live {year} site:in.bookmyshow.com/events',
            f'"{artist}" concert {year} tickets event',
        ]
        for query in queries:
            if searches >= max_searches:
                return dedupe_strings(urls), errors
            searches += 1
            for template in SEARCH_TEMPLATES:
                search_url = template.format(query=quote_plus(query))
                try:
                    page = fetch_page(fetcher_name, search_url)
                    urls.extend(extract_urls_from_search_page(page))
                    time.sleep(0.4)
                except Exception as error:
                    errors.append(f"{search_url}: {type(error).__name__}: {error}")
    return dedupe_strings(urls), errors


def read_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def load_google_cse_credentials() -> tuple[str, str]:
    merged: dict[str, str] = {}
    for env_file in DEFAULT_ENV_FILES:
        merged.update(read_env_file(env_file))

    api_key = merged.get("GOOGLE_SEARCH_API_KEY") or ""
    cx = merged.get("GOOGLE_SEARCH_CX") or ""
    if not api_key or not cx:
        raise RuntimeError("GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX are required in backend/.env or backend/ml_engine/.env")
    return api_key, cx


def google_cse_search(api_key: str, cx: str, query: str, limit: int) -> list[dict[str, str]]:
    params = urllib.parse.urlencode({
        "key": api_key,
        "cx": cx,
        "q": query,
        "num": min(10, max(1, limit)),
    })
    request = urllib.request.Request(
        f"https://customsearch.googleapis.com/customsearch/v1?{params}",
        headers={"User-Agent": "ArtistIQ-ConcertHistory/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        try:
            payload = json.loads(detail)
            message = payload.get("error", {}).get("message") or detail[:300]
            reason = ",".join(
                item.get("reason", "")
                for item in payload.get("error", {}).get("errors", [])
                if item.get("reason")
            )
            raise RuntimeError(f"Google CSE HTTP {error.code}: {message} ({reason})") from error
        except json.JSONDecodeError:
            raise RuntimeError(f"Google CSE HTTP {error.code}: {detail[:300]}") from error
    return [
        {
            "title": clean_text(item.get("title")),
            "link": clean_text(item.get("link")),
            "snippet": clean_text(item.get("snippet")),
        }
        for item in payload.get("items", [])
        if item.get("link")
    ]


def discover_urls_google_cse(artist: str, years: list[int], max_searches: int, per_search: int) -> tuple[list[str], list[dict[str, str]], list[str]]:
    api_key, cx = load_google_cse_credentials()
    urls: list[str] = []
    items: list[dict[str, str]] = []
    errors: list[str] = []
    searches = 0

    for year in years:
        queries = [
            f'"{artist}" concert {year} site:in.bookmyshow.com/events',
            f'"{artist}" live {year} site:in.bookmyshow.com/events',
            f'"{artist}" concert {year} tickets event',
        ]
        for query in queries:
            if searches >= max_searches:
                return dedupe_strings(urls), items, errors
            searches += 1
            try:
                found = google_cse_search(api_key, cx, query, per_search)
                items.extend(found)
                urls.extend(item["link"] for item in found)
                time.sleep(0.2)
            except Exception as error:
                errors.append(f"{query}: {type(error).__name__}: {error}")
    return dedupe_strings(urls), items, errors


def parse_price_range(text: str) -> dict[str, Any] | None:
    match = re.search(r"(?:\u20b9|Rs\.?|INR)\s*(\d[\d,]*(?:\.\d+)?)", text, re.IGNORECASE)
    if not match:
        return None
    return {"min": float(match.group(1).replace(",", "")), "currency": "INR"}


def parse_bookmyshow_text(event: dict[str, Any], text: str) -> None:
    title_city_match = re.search(
        r"\b(?:music-shows|concerts|events)\s+([A-Z][A-Za-z .'-]{2,40})\s+-\s+BookMyShow\b",
        text,
        flags=re.IGNORECASE,
    )
    if title_city_match:
        event["city"] = clean_text(title_city_match.group(1))

    current_venue = clean_text(event.get("venueName"))
    if "Search for Movies" in current_venue or "BookMyShow" in current_venue or len(current_venue) > 160:
        event["venueName"] = ""

    current_event = clean_text(event.get("eventName"))
    card_location = ""
    if current_event and current_event in text:
        after_name = clean_text(text.split(current_event, 1)[1])
        card_location = re.split(
            r"\s+(?:Concerts|Music|Club Gigs|Comedy|Workshops|Activities|Performances|Free|Rs\.?|\u20b9|\$|onwards)\b",
            after_name,
            maxsplit=1,
            flags=re.IGNORECASE,
        )[0]
    if card_location and ":" in card_location and "BookMyShow" not in card_location:
        venue, city = [clean_text(part) for part in card_location.rsplit(":", 1)]
        if venue:
            event["venueName"] = venue
        if city and len(city) <= 40:
            event["city"] = city

    explicit_date = re.search(
        r"\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}\s+"
        r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+"
        r"\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))\b",
        text,
    )
    if explicit_date:
        event["eventDate"] = clean_text(explicit_date.group(1))
        return

    held_on = re.search(
        r"\b(?:held on|on)\s+(\d{1,2}(?:st|nd|rd|th)?\s+"
        r"(?:January|February|March|April|May|June|July|August|September|October|November|December)"
        r"(?:\s+\d{4})?)\s+at\s+(.{3,120}?),\s*"
        r"([A-Z][A-Za-z .'-]{2,40}),?\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))\b",
        text,
        flags=re.IGNORECASE,
    )
    if held_on:
        event["eventDate"] = clean_text(f"{held_on.group(1)} {held_on.group(4)}")
        event["venueName"] = clean_text(held_on.group(2))
        event["city"] = clean_text(held_on.group(3))
        return

    venue_city_date = re.search(
        r"\bat\s+(.{3,120}?)\s+in\s+([A-Z][A-Za-z .'-]{2,40})\s+on\s+"
        r"((?:January|February|March|April|May|June|July|August|September|October|November|December)"
        r"\s+\d{1,2},\s+\d{4})\b",
        text,
    )
    if venue_city_date:
        event["venueName"] = clean_text(venue_city_date.group(1)).removeprefix("the ").strip()
        event["city"] = clean_text(venue_city_date.group(2))
        event["eventDate"] = clean_text(venue_city_date.group(3))


def parse_generic_text(event: dict[str, Any], text: str) -> None:
    if not event.get("eventDate"):
        date_match = re.search(
            r"\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}"
            r"(?:\s*(?:at|,|-|\u2022)\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))?)\b",
            text,
        ) or re.search(
            r"\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}"
            r"(?:\s*(?:at|,|-|\u2022)\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))?)\b",
            text,
        )
        if date_match:
            event["eventDate"] = clean_text(date_match.group(1))

    if not event.get("venueName"):
        venue_match = re.search(
            r"\b(?:venue|location)\s*[:\-]\s*(.{3,120}?)(?:\s+(?:date|time|tickets|price|about)\b|$)",
            text,
            flags=re.IGNORECASE,
        )
        if venue_match:
            event["venueName"] = clean_text(venue_match.group(1))


def parse_text_event(page: Any, url: str, artist: str, country: str) -> dict[str, Any]:
    text = clean_text(page.get_all_text(" ", strip=True))
    title = first_text(page, ["h1", "title"]) or text[:120]
    title = clean_text(re.sub(r"\s+-\s+BookMyShow.*$", "", title))
    event = {
        "artistName": artist,
        "eventName": title,
        "venueName": "",
        "city": "",
        "country": country,
        "eventDate": "",
        "sourcePlatform": source_platform(url),
        "sourceUrl": getattr(page, "url", None) or url,
        "officialTicketUrl": getattr(page, "url", None) or url,
        "confidenceScore": 0.35,
        "rawPayload": {
            "extraction": "text",
            "detailTextSample": text[:1000],
        },
    }

    if event["sourcePlatform"] == "BOOKMYSHOW":
        parse_bookmyshow_text(event, text)
    parse_generic_text(event, text)

    price_range = parse_price_range(text)
    if price_range:
        event["ticketPriceRange"] = price_range

    return event


def relevant_event(event: dict[str, Any], artist: str, start_year: int, end_year: int) -> bool:
    haystack = clean_text(" ".join([
        event.get("artistName", ""),
        event.get("eventName", ""),
        clean_text((event.get("rawPayload") or {}).get("detailTextSample")),
    ])).lower()
    if artist.lower() not in haystack:
        return False
    if any(noise == clean_text(event.get("eventName")).lower() for noise in NOISE_EVENT_NAMES):
        return False
    year = event_year(clean_text(event.get("eventDate")))
    if year and not (start_year <= year <= end_year):
        return False
    return True


def event_year(value: str) -> int | None:
    match = re.search(r"\b(20\d{2})\b", value)
    return int(match.group(1)) if match else None


def completeness(event: dict[str, Any]) -> int:
    required = ["artistName", "eventName", "venueName", "city", "country", "eventDate", "sourceUrl"]
    return sum(1 for key in required if event.get(key))


def score_event(event: dict[str, Any]) -> dict[str, Any]:
    score = 0.2 + completeness(event) * 0.08
    if event.get("rawPayload", {}).get("extraction") == "jsonld":
        score += 0.18
    if event.get("ticketPriceRange"):
        score += 0.04
    event["fieldCompleteness"] = completeness(event)
    event["confidenceScore"] = min(0.95, round(score, 2))
    return event


def scrape_url(url: str, artist: str, country: str, fetcher_name: str, start_year: int, end_year: int) -> tuple[list[dict[str, Any]], str | None]:
    try:
        page = fetch_page(fetcher_name, url)
        status = getattr(page, "status", None)
        if status and int(status) >= 400:
            return [], f"{url}: status {status}"
        events = extract_jsonld(page, url, artist, country)
        if not events:
            events = [parse_text_event(page, url, artist, country)]
        return [
            score_event(event)
            for event in events
            if relevant_event(event, artist, start_year, end_year)
        ], None
    except Exception as error:
        return [], f"{url}: {type(error).__name__}: {error}"


def dedupe_strings(values: list[str]) -> list[str]:
    seen = set()
    unique = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique


def dedupe_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    unique = []
    for event in sorted(events, key=lambda item: item.get("confidenceScore", 0), reverse=True):
        key = "|".join([
            clean_text(event.get("sourceUrl")),
            clean_text(event.get("eventName")).lower(),
            clean_text(event.get("eventDate")).lower(),
            clean_text(event.get("venueName")).lower(),
        ])
        if key in seen:
            continue
        seen.add(key)
        unique.append(event)
    return unique


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artist", required=True)
    parser.add_argument("--start-year", type=int, default=2021)
    parser.add_argument("--end-year", type=int, default=datetime.now().year)
    parser.add_argument("--country", default="India")
    parser.add_argument("--fetcher", choices=FETCHERS.keys(), default="static")
    parser.add_argument("--max-searches", type=int, default=8)
    parser.add_argument("--per-search", type=int, default=5)
    parser.add_argument("--url", action="append", default=[], help="Seed event/article URL. Can be passed multiple times.")
    parser.add_argument("--discover", action="store_true", help="Discover candidate URLs through search pages.")
    parser.add_argument("--google-cse", action="store_true", help="Discover candidate URLs with Google Custom Search API.")
    args = parser.parse_args()

    started = time.time()
    years = list(range(args.start_year, args.end_year + 1))
    discovered_urls: list[str] = []
    errors: list[str] = []

    if args.discover:
        discovered_urls, discovery_errors = discover_urls(args.artist, years, args.fetcher, args.max_searches)
        errors.extend(discovery_errors)

    google_items: list[dict[str, str]] = []
    if args.google_cse:
        cse_urls, google_items, cse_errors = discover_urls_google_cse(args.artist, years, args.max_searches, args.per_search)
        discovered_urls.extend(cse_urls)
        errors.extend(cse_errors)

    candidate_urls = dedupe_strings([*args.url, *discovered_urls])
    events: list[dict[str, Any]] = []
    for url in candidate_urls:
        url_events, error = scrape_url(url, args.artist, args.country, args.fetcher, args.start_year, args.end_year)
        events.extend(url_events)
        if error:
            errors.append(error)

    result = {
        "testedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "artist": args.artist,
        "range": {"startYear": args.start_year, "endYear": args.end_year},
        "fetcher": args.fetcher,
        "elapsedMs": round((time.time() - started) * 1000),
        "candidateUrlCount": len(candidate_urls),
        "candidateUrls": candidate_urls,
        "googleCseItems": google_items,
        "eventCount": len(events),
        "events": dedupe_events(events),
        "errors": errors,
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
