import argparse
import json
import re
import sys
import time
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urljoin

from scrapling import DynamicFetcher, Fetcher, StealthyFetcher


TARGETS = {
    "bookmyshow": {
        "platform": "BOOKMYSHOW",
        "url": "https://in.bookmyshow.com/explore/music-shows-mumbai",
        "country": "India",
        "city": "Mumbai",
        "card_selectors": [
            '[data-testid*="event"]',
            '[class*="event-card"]',
            '[class*="EventCard"]',
            'a[href*="/events/"]',
        ],
    },
    "eventbrite": {
        "platform": "EVENTBRITE",
        "url": "https://www.eventbrite.com/d/mumbai/music--events/?q=concerts",
        "country": "India",
        "city": "Mumbai",
        "card_selectors": [
            '[data-testid="event-card"]',
            ".event-card",
            '[class*="event-card"]',
            'a[href*="/e/"]',
        ],
    },
}

FETCHERS = {
    "static": Fetcher,
    "dynamic": DynamicFetcher,
    "stealth": StealthyFetcher,
}


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


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


def first_attr(root: Any, selectors: list[str], attr: str) -> str:
    for selector in selectors:
        try:
            matches = root.css(selector)
        except Exception:
            continue
        for match in matches:
            value = clean_text(match.attrib.get(attr))
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
    if isinstance(node_type, list):
        return any(str(item).lower() == "event" for item in node_type)
    return str(node_type).lower() == "event"


def value_name(value: Any) -> str:
    if isinstance(value, dict):
        return clean_text(value.get("name"))
    if isinstance(value, list):
        names = [value_name(item) for item in value]
        return clean_text(", ".join(name for name in names if name))
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


def location_fields(location: Any, fallback_city: str, fallback_country: str) -> tuple[str, str, str]:
    if not isinstance(location, dict):
        return clean_text(location), fallback_city, fallback_country

    venue = clean_text(location.get("name"))
    address = location.get("address")
    city = fallback_city
    country = fallback_country

    if isinstance(address, dict):
        city = clean_text(address.get("addressLocality")) or city
        country_value = address.get("addressCountry")
        if isinstance(country_value, dict):
            country = clean_text(country_value.get("name")) or country
        else:
            country = clean_text(country_value) or country
    elif isinstance(address, str):
        venue = venue or address

    return venue, city, country


def normalize_event(raw: dict[str, Any], target: dict[str, Any], extraction: str, fallback_url: str) -> dict[str, Any]:
    venue, city, country = location_fields(raw.get("location"), target["city"], target["country"])
    offers = raw.get("offers")
    price = offers[0] if isinstance(offers, list) and offers else offers if isinstance(offers, dict) else {}

    performer = raw.get("performer") or raw.get("performers") or raw.get("organizer")
    name = clean_text(raw.get("name"))

    return {
        "artistName": value_name(performer) or name,
        "eventName": name,
        "venueName": venue,
        "city": city,
        "country": country,
        "eventDate": clean_text(raw.get("startDate") or raw.get("doorTime")),
        "sourcePlatform": target["platform"],
        "sourceUrl": value_url(raw.get("url")) or fallback_url,
        "officialTicketUrl": value_url(price.get("url")) if isinstance(price, dict) else "",
        "ticketPriceRange": {
            "min": price.get("lowPrice") if isinstance(price, dict) else None,
            "max": price.get("highPrice") if isinstance(price, dict) else None,
            "currency": price.get("priceCurrency") if isinstance(price, dict) else None,
        },
        "confidenceScore": 0.88 if extraction == "jsonld" else 0.55,
        "rawPayload": {
            "extraction": extraction,
        },
    }


def extract_jsonld(page: Any, target: dict[str, Any]) -> list[dict[str, Any]]:
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
            if is_event_node(node):
                events.append(normalize_event(node, target, "jsonld", page.url))
    return events


def extract_cards(page: Any, target: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    seen = set()

    for selector in target["card_selectors"]:
        try:
            cards = page.css(selector)
        except Exception:
            continue

        for card in cards:
            if len(events) >= limit:
                return events

            text = clean_text(card.get_all_text(" ", strip=True))
            link = first_attr(card, ["a[href]"], "href") or card.attrib.get("href", "")
            source_url = urljoin(page.url, clean_text(link)) if link else page.url
            key = (source_url, text[:160])
            if not text or key in seen:
                continue
            seen.add(key)

            event_name = first_text(card, [
                '[data-testid*="event-title"]',
                '[class*="title"]',
                '[class*="eventName"]',
                "h1",
                "h2",
                "h3",
            ]) or text[:120]
            date_value = first_attr(card, ["time[datetime]", "[datetime]"], "datetime") or first_text(card, [
                "time",
                '[class*="date"]',
                '[data-testid*="date"]',
            ])
            venue = first_text(card, [
                '[class*="venue"]',
                '[data-testid*="venue"]',
                '[class*="location"]',
            ])

            events.append({
                "artistName": event_name,
                "eventName": event_name,
                "venueName": venue,
                "city": target["city"],
                "country": target["country"],
                "eventDate": date_value,
                "sourcePlatform": target["platform"],
                "sourceUrl": source_url,
                "officialTicketUrl": source_url,
                "confidenceScore": 0.55,
                "rawPayload": {
                    "extraction": "card",
                    "selector": selector,
                    "textSample": text[:500],
                },
            })

    return events


def unique_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique = []
    seen = set()
    for event in events:
        key = event.get("sourceUrl") or (event.get("eventName"), event.get("eventDate"))
        if key in seen:
            continue
        seen.add(key)
        unique.append(event)
    return unique


def completeness(event: dict[str, Any]) -> int:
    required = ["artistName", "eventName", "venueName", "city", "country", "eventDate", "sourceUrl"]
    return sum(1 for key in required if event.get(key))


def strip_repeated_name(text: str, event_name: str) -> str:
    if not event_name:
        return text

    value = text
    for _ in range(2):
        if value.lower().startswith(event_name.lower()):
            value = value[len(event_name):].strip(" -:|")
        if value.lower().endswith(event_name.lower()):
            value = value[:-len(event_name)].strip(" -:|")
    return clean_text(value)


def parse_price_range(text: str) -> dict[str, Any] | None:
    match = re.search(r"(?:\u20b9|Rs\.?\s*)(\d[\d,]*(?:\.\d+)?)", text, re.IGNORECASE)
    if not match:
        return None

    return {
        "min": float(match.group(1).replace(",", "")),
        "currency": "INR",
    }


def parse_bookmyshow_location(event: dict[str, Any], text: str) -> None:
    current_venue = clean_text(event.get("venueName"))
    if (
        "Search for Movies" in current_venue
        or "Privacy Note" in current_venue
        or len(current_venue) > 160
    ):
        event["venueName"] = ""

    body = strip_repeated_name(text, clean_text(event.get("eventName")))
    body = re.sub(r"^Just added\s+", "", body, flags=re.IGNORECASE).strip()
    location_part = re.split(
        r"\s+(?:Concerts|Music|Club Gigs|Comedy|Workshops|Activities|Performances|Free|"
        r"Rs\.?|\u20b9|\$|onwards)\b",
        body,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]
    location_part = clean_text(location_part)

    if not location_part or len(location_part) < 4:
        return
    title_city_match = re.search(
        r"\b(?:music-shows|concerts|events)\s+([A-Z][A-Za-z .'-]{2,40})\s+-\s+BookMyShow\b",
        location_part,
        flags=re.IGNORECASE,
    )
    if title_city_match:
        event["city"] = clean_text(title_city_match.group(1))
        return
    if "BookMyShow Search" in location_part or "Search for Movies" in location_part:
        return

    if ":" in location_part:
        venue, city = [clean_text(part) for part in location_part.rsplit(":", 1)]
        if venue and not event.get("venueName"):
            event["venueName"] = venue
        if city and len(city) <= 40:
            event["city"] = city
        return

    if not event.get("venueName") and len(location_part) <= 120:
        event["venueName"] = location_part


def parse_bookmyshow_datetime(event: dict[str, Any], text: str) -> None:
    date_match = re.search(
        r"\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}\s+"
        r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+"
        r"\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))\b",
        text,
    )
    if date_match:
        event["eventDate"] = clean_text(date_match.group(1))
        return

    past_prose_match = re.search(
        r"\b(?:held on|on)\s+(\d{1,2}(?:st|nd|rd|th)?\s+"
        r"(?:January|February|March|April|May|June|July|August|September|October|November|December)"
        r"(?:\s+\d{4})?)\s+at\s+(.{3,120}?),\s*"
        r"([A-Z][A-Za-z .'-]{2,40}),?\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))\b",
        text,
        flags=re.IGNORECASE,
    )
    if past_prose_match:
        event["eventDate"] = clean_text(f"{past_prose_match.group(1)} {past_prose_match.group(4)}")
        event["venueName"] = clean_text(past_prose_match.group(2))
        event["city"] = clean_text(past_prose_match.group(3))
        return

    venue_city_date_match = re.search(
        r"\bat\s+(.{3,120}?)\s+in\s+([A-Z][A-Za-z .'-]{2,40})\s+on\s+"
        r"((?:January|February|March|April|May|June|July|August|September|October|November|December)"
        r"\s+\d{1,2},\s+\d{4})\b",
        text,
    )
    if venue_city_date_match:
        event["venueName"] = clean_text(venue_city_date_match.group(1))
        event["city"] = clean_text(venue_city_date_match.group(2))
        event["eventDate"] = clean_text(venue_city_date_match.group(3))


def normalize_eventbrite_location(value: str, event: dict[str, Any]) -> str:
    location = clean_text(value.replace("\u2022", " ").replace("\u00b7", " "))
    location = re.sub(r"\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)\b", "", location).strip()
    location = clean_text(location)
    if not location:
        return ""
    if (
        location.startswith(("-", "|"))
        or "Eventbrite" in location
        or "Search events" in location
        or "Find my tickets" in location
    ):
        return ""

    repeated_city = re.fullmatch(r"([A-Za-z][A-Za-z .'-]{1,40})\s+\1", location, re.IGNORECASE)
    if repeated_city:
        event["city"] = clean_text(repeated_city.group(1))
        return ""

    current_city = clean_text(event.get("city")).lower()
    if current_city and location.lower() == current_city:
        return ""

    city_only_match = re.fullmatch(r"[A-Za-z][A-Za-z .'-]{1,40}", location)
    if city_only_match and location.lower() in {"mumbai", "pune", "nashik", "thane", "kalyan"}:
        event["city"] = location
        return ""

    return location


def parse_eventbrite_text(event: dict[str, Any], text: str) -> None:
    current_venue = clean_text(event.get("venueName"))
    event_name = clean_text(event.get("eventName"))
    if (
        len(current_venue) > 160
        or "Save this event" in current_venue
        or "Share this event" in current_venue
        or re.search(r"\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+", current_venue)
        or (event_name and event_name in current_venue)
    ):
        event["venueName"] = ""

    date_match = re.search(
        r"\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+"
        r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+"
        r"\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))\b",
        text,
    ) or re.search(
        r"\b((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+"
        r"(?:January|February|March|April|May|June|July|August|September|October|November|December)"
        r"\s+\d{1,2}\s*(?:\u2022|-|,)\s*[^$|]{0,45}?(?:AM|PM|am|pm|IST))",
        text,
    )
    if date_match:
        candidate = clean_text(date_match.group(1)).rstrip(",")
        current_date = clean_text(event.get("eventDate"))
        if not current_date or len(candidate) > len(current_date) or ":" not in current_date:
            event["eventDate"] = candidate

    location_match = re.search(
        r"\bLocation\s+(.+?)(?:\s+(?:Refund Policy|About this event|Agenda|Tags|Organized by|Share this event|"
        r"Follow|Sales Ended|Date and time)\b|$)",
        text,
        flags=re.IGNORECASE,
    )
    if location_match and not event.get("venueName"):
        location = normalize_eventbrite_location(location_match.group(1), event)
        location = re.sub(r"\s+Show map\b.*$", "", location, flags=re.IGNORECASE).strip()
        if location and len(location) <= 160:
            event["venueName"] = location

    if event.get("venueName"):
        return

    date_value = clean_text(event.get("eventDate"))
    if not date_value or date_value not in text:
        return

    after_date = clean_text(text.split(date_value, 1)[1])
    location_part = re.split(
        r"\s+(?:Free|Starts at|From|Tickets|Sales|Just added|Save this event|Share this event)\b",
        after_date,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]
    location_part = normalize_eventbrite_location(location_part, event)
    if location_part and len(location_part) <= 120:
        event["venueName"] = location_part


def parse_text_fallback(event: dict[str, Any]) -> dict[str, Any]:
    raw_payload = event.get("rawPayload") or {}
    text = clean_text(" ".join(
        clean_text(raw_payload.get(key))
        for key in ["textSample", "text", "detailTextSample", "_detailTextForParsing"]
        if raw_payload.get(key)
    ))
    if not text:
        return event

    platform = clean_text(event.get("sourcePlatform"))
    if platform == "BOOKMYSHOW":
        parse_bookmyshow_location(event, text)
        parse_bookmyshow_datetime(event, text)
    elif platform == "EVENTBRITE":
        parse_eventbrite_text(event, text)

    if not event.get("venueName") and platform not in {"BOOKMYSHOW", "EVENTBRITE"}:
        venue_match = re.search(
            r"^(?:Just added\s+)?(.+?)\s+([A-Z][^:]{2,80}:\s*[^₹$€£]+?)\s+(?:Concerts|Music|Club Gigs|Free|\u20b9|\$|€|£)",
            text,
        )
        if venue_match:
            event["venueName"] = clean_text(venue_match.group(2))

    if not event.get("eventDate") and platform != "BOOKMYSHOW":
        date_match = re.search(
            r"\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Thursday|Friday|Saturday|Sunday|Today|Tomorrow)[^·₹$€£]{0,40}(?:AM|PM)?)\b",
            text,
        )
        if date_match:
            event["eventDate"] = clean_text(date_match.group(1))

    price_match = re.search(r"(?:₹|Rs\.?\s*)(\d[\d,]*(?:\.\d+)?)", text)
    if price_match and not event.get("ticketPriceRange"):
        event["ticketPriceRange"] = {
            "min": float(price_match.group(1).replace(",", "")),
            "currency": "INR",
        }

    price_range = parse_price_range(text)
    if price_range and not event.get("ticketPriceRange"):
        event["ticketPriceRange"] = price_range

    event["fieldCompleteness"] = completeness(event)

    return event


def fetch_page(fetcher_name: str, url: str) -> Any:
    fetcher = FETCHERS[fetcher_name]
    kwargs = {
        "timeout": 45_000,
        "headers": {
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent": "ArtistIQ-ConcertIntelligence/1.0",
        },
    }
    if fetcher_name == "static":
        return fetcher.get(url, **kwargs)

    kwargs.pop("headers")
    kwargs.update({
        "useragent": "ArtistIQ-ConcertIntelligence/1.0",
        "extra_headers": {"Accept-Language": "en-US,en;q=0.9"},
        "headless": True,
        "wait": 4_000,
        "network_idle": True,
        "disable_resources": False,
    })
    return fetcher.fetch(url, **kwargs)


def enrich_from_details(events: list[dict[str, Any]], target: dict[str, Any], fetcher: str, limit: int) -> list[dict[str, Any]]:
    enriched = []
    for event in events[:limit]:
        event = parse_text_fallback(dict(event))
        url = event.get("sourceUrl")
        if not url:
            enriched.append(event)
            continue

        try:
            detail_page = fetch_page(fetcher, url)
            detail_events = extract_jsonld(detail_page, target)
            if detail_events:
                merged = {**event, **detail_events[0]}
                merged["rawPayload"] = {
                    **(event.get("rawPayload") or {}),
                    "detailExtraction": "jsonld",
                }
                enriched.append(parse_text_fallback(merged))
            else:
                detail_text = clean_text(detail_page.get_all_text(" ", strip=True))
                event["rawPayload"] = {
                    **(event.get("rawPayload") or {}),
                    "detailHtmlLength": len(getattr(detail_page, "body", b"") or b""),
                    "detailTextSample": detail_text[:800],
                    "_detailTextForParsing": detail_text[:5_000],
                }
                parsed = parse_text_fallback(event)
                (parsed.get("rawPayload") or {}).pop("_detailTextForParsing", None)
                enriched.append(parsed)
        except Exception as error:
            event["rawPayload"] = {
                **(event.get("rawPayload") or {}),
                "detailError": f"{type(error).__name__}: {error}",
            }
            enriched.append(event)

    return enriched


def test_target(platform: str, fetcher: str, limit: int) -> dict[str, Any]:
    target = TARGETS[platform]
    started = time.time()
    try:
        page = fetch_page(fetcher, target["url"])
        jsonld_events = extract_jsonld(page, target)
        card_events = extract_cards(page, target, limit)
        events = unique_events(jsonld_events + card_events)[:limit]
        enriched_events = enrich_from_details(events, target, fetcher, limit)

        return {
            "platform": platform,
            "fetcher": fetcher,
            "targetUrl": target["url"],
            "status": getattr(page, "status", None),
            "pageUrl": getattr(page, "url", None),
            "htmlLength": len(getattr(page, "body", b"") or b""),
            "elapsedMs": round((time.time() - started) * 1000),
            "jsonLdCount": len(jsonld_events),
            "cardCount": len(card_events),
            "events": enriched_events,
            "usableEvents": [
                event for event in enriched_events
                if completeness(event) >= 7
            ],
        }
    except Exception as error:
        return {
            "platform": platform,
            "fetcher": fetcher,
            "targetUrl": target["url"],
            "elapsedMs": round((time.time() - started) * 1000),
            "error": f"{type(error).__name__}: {error}",
        }


def test_detail_url(url: str, platform: str, fetcher: str) -> dict[str, Any]:
    target = {
        **TARGETS[platform],
        "url": url,
    }
    started = time.time()
    try:
        page = fetch_page(fetcher, url)
        jsonld_events = extract_jsonld(page, target)
        card_events = extract_cards(page, target, 1)
        text = clean_text(page.get_all_text(" ", strip=True))
        detail_event = {
            "artistName": first_text(page, ["h1"]) or text[:120],
            "eventName": first_text(page, ["h1"]) or text[:120],
            "venueName": "",
            "city": target["city"],
            "country": target["country"],
            "eventDate": "",
            "sourcePlatform": target["platform"],
            "sourceUrl": getattr(page, "url", None) or url,
            "officialTicketUrl": getattr(page, "url", None) or url,
            "confidenceScore": 0.35,
            "rawPayload": {
                "extraction": "detail-text",
                "detailHtmlLength": len(getattr(page, "body", b"") or b""),
                "detailTextSample": text[:800],
                "_detailTextForParsing": text[:5_000],
            },
        }
        events = unique_events(jsonld_events + [detail_event] + card_events)

        enriched = [parse_text_fallback(event) for event in events]
        for event in enriched:
            (event.get("rawPayload") or {}).pop("_detailTextForParsing", None)

        return {
            "platform": platform,
            "fetcher": fetcher,
            "targetUrl": url,
            "status": getattr(page, "status", None),
            "pageUrl": getattr(page, "url", None),
            "htmlLength": len(getattr(page, "body", b"") or b""),
            "elapsedMs": round((time.time() - started) * 1000),
            "jsonLdCount": len(jsonld_events),
            "cardCount": len(card_events),
            "events": enriched,
            "usableEvents": [
                event for event in enriched
                if completeness(event) >= 7
            ],
        }
    except Exception as error:
        return {
            "platform": platform,
            "fetcher": fetcher,
            "targetUrl": url,
            "elapsedMs": round((time.time() - started) * 1000),
            "error": f"{type(error).__name__}: {error}",
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--platform", choices=[*TARGETS.keys(), "all"], default="all")
    parser.add_argument("--fetcher", choices=[*FETCHERS.keys(), "all"], default="static")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--url", help="Direct event detail URL to test")
    args = parser.parse_args()

    platforms = TARGETS.keys() if args.platform == "all" else [args.platform]
    fetchers = FETCHERS.keys() if args.fetcher == "all" else [args.fetcher]

    result = {
        "testedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "scrapling": "0.4.8",
        "results": [
            (
                test_detail_url(args.url, platform, fetcher)
                if args.url else
                test_target(platform, fetcher, args.limit)
            )
            for platform in platforms
            for fetcher in fetchers
        ],
    }

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
