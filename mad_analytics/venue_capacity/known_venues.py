"""
Known venue capacities — curated database of verified venue sizes.
This is the most reliable source (higher priority than web search or heuristic).
Add venues here as you verify them manually.
"""

# Format: (venue_name_lowercase, city_lowercase): capacity
KNOWN_VENUES: dict[tuple[str, str], int] = {
    # USA
    ("madison square garden", "new york"): 20000,
    ("madison square garden", "new york (nyc)"): 20000,
    ("crypto.com arena", "los angeles"): 20000,
    ("crypto.com arena", "los angeles (la)"): 20000,
    ("state farm arena", "atlanta"): 17000,
    ("bridgestone arena", "nashville"): 20000,
    ("kia center", "orlando"): 17000,
    ("hard rock live", "hollywood"): 7000,
    ("hard rock live at etess arena", "atlantic city"): 7000,
    ("hard rock stadium", "miami gardens"): 65000,
    ("chase center", "san francisco"): 18064,
    ("american airlines center", "dallas"): 20000,
    ("allstate arena", "rosemont"): 18500,
    ("prudential center", "newark"): 18000,
    ("barclays center", "brooklyn"): 19000,
    ("td garden", "boston"): 19580,
    ("united center", "chicago"): 20917,
    ("caesars superdome", "new orleans"): 73000,
    ("lucas oil stadium", "indianapolis"): 67000,
    ("shoreline amphitheatre", "mountain view"): 22500,
    ("oakland arena", "oakland"): 19596,
    ("sap center", "san jose"): 17496,
    ("smart financial centre", "sugar land"): 6400,
    ("arena theatre", "houston"): 2850,
    ("the grand center", "plano"): 3500,
    ("9:30 club", "washington"): 1200,
    ("bowery ballroom", "new york"): 575,
    ("masonic auditorium", "san francisco"): 3300,
    ("shrine auditorium", "los angeles"): 6300,
    ("shrine auditorium", "los angeles (la)"): 6300,
    ("clowes memorial hall", "indianapolis"): 2148,

    # Canada
    ("scotiabank arena", "toronto"): 19800,
    ("rogers centre", "toronto"): 49000,
    ("rogers place", "edmonton"): 18347,
    ("scotiabank saddledome", "calgary"): 19289,
    ("air canada centre", "toronto"): 19800,
    ("canada life centre", "winnipeg"): 15321,
    ("meridian hall", "toronto"): 3191,
    ("rebel", "toronto"): 2500,
    ("danforth music hall", "toronto"): 1500,
    ("td coliseum", "hamilton"): 17383,
    ("rose theatre", "brampton"): 868,

    # UK
    ("the o2 arena", "london"): 20000,
    ("the o2", "london"): 20000,
    ("the o2", "greenwich"): 20000,
    ("wembley stadium", "london"): 90000,
    ("co-op live", "manchester"): 23500,
    ("ao arena", "manchester"): 21000,
    ("ovo hydro", "glasgow"): 14300,
    ("the ovo hydro", "glasgow"): 14300,
    ("utilita arena", "birmingham"): 15800,
    ("utilita arena birmingham", "birmingham"): 15800,
    ("o2 forum kentish town", "london"): 2300,

    # Europe
    ("accor arena", "paris"): 20300,
    ("lanxess arena", "cologne"): 18500,
    ("uber arena", "berlin"): 17000,
    ("barclays arena", "hamburg"): 16000,
    ("olympiahalle", "munich"): 15500,
    ("unipol forum", "assago"): 12700,
    ("royal arena", "copenhagen"): 16000,
    ("avicii arena", "stockholm"): 16000,
    ("ahoy", "rotterdam"): 15818,
    ("ziggo dome", "amsterdam"): 17000,

    # Australia
    ("rod laver arena", "melbourne"): 15000,
    ("qudos bank arena", "sydney"): 21000,
    ("commbank stadium", "sydney"): 30000,
    ("aami park", "melbourne"): 30050,
    ("rac arena", "perth"): 15500,
    ("tiktok entertainment centre", "sydney"): 9000,
    ("hordern pavilion", "sydney"): 5500,

    # New Zealand
    ("spark arena", "auckland"): 12000,
    ("the trusts arena", "auckland"): 5100,

    # India
    ("jawaharlal nehru stadium", "delhi"): 60000,
    ("jawaharlal nehru stadium", "shillong"): 40000,
    ("mahalaxmi race course", "mumbai"): 30000,
    ("shanmukhananda auditorium", "mumbai"): 2500,

    # UAE
    ("expo city dubai", "dubai"): 4000,
    ("coca-cola arena", "dubai"): 17000,
    ("dubai duty free tennis stadium", "dubai"): 5000,
    ("dubai tennis stadium", "dubai"): 5000,

    # Singapore
    ("singapore indoor stadium", "singapore"): 12000,
}


def lookup_known_capacity(venue_name: str, city: str) -> int | None:
    """Look up a venue in the known venues database. Returns capacity or None."""
    if not venue_name:
        return None

    key = (venue_name.lower().strip(), city.lower().strip())
    capacity = KNOWN_VENUES.get(key)
    if capacity:
        return capacity

    # Try partial match (venue name contains known venue)
    venue_lower = venue_name.lower().strip()
    city_lower = city.lower().strip()
    for (known_venue, known_city), cap in KNOWN_VENUES.items():
        if known_venue in venue_lower and known_city in city_lower:
            return cap
        if venue_lower in known_venue and city_lower in known_city:
            return cap

    return None
