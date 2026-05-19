import json
import math
import sys
from typing import Dict, Any, Tuple


MODEL_VERSION = "heuristic-demand-v4-improved"


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def to_number(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        number = float(value)
        if math.isnan(number) or math.isinf(number):
            return default
        return number
    except (TypeError, ValueError):
        return default


# Currency exchange rates to INR (more accurate rates)
CURRENCY_TO_INR = {
    'INR': 1.0,
    'USD': 83.0,    # 1 USD = 83 INR
    'EUR': 90.0,    # 1 EUR = 90 INR
    'GBP': 105.0,   # 1 GBP = 105 INR
    'CAD': 61.0,    # 1 CAD = 61 INR
    'AUD': 55.0,    # 1 AUD = 55 INR
    'SGD': 62.0,    # 1 SGD = 62 INR
    'AED': 22.6,    # 1 AED = 22.6 INR (UAE Dirham)
}

def convert_to_inr(amount: float, currency: str) -> float:
    """Convert amount from given currency to INR"""
    rate = CURRENCY_TO_INR.get(currency.upper(), 1.0)
    return amount * rate


def city_market_boost(city: str) -> float:
    """Enhanced city market boost with better values for major entertainment hubs"""
    major_markets = {
        # Tier 1 Global Cities (30-40 boost)
        "mumbai": 35,
        "delhi": 35,
        "new delhi": 35,
        "bangalore": 30,
        "bengaluru": 30,
        "hyderabad": 25,
        "chennai": 25,

        # International Tier 1 (40-50 boost)
        "new york": 50,
        "los angeles": 45,
        "london": 45,
        "paris": 40,
        "tokyo": 40,
        "singapore": 35,
        "dubai": 40,
        "abu dhabi": 35,

        # International Tier 2 (25-35 boost)
        "chicago": 30,
        "washington": 30,
        "boston": 28,
        "san francisco": 35,
        "las vegas": 30,
        "miami": 28,
        "toronto": 30,
        "vancouver": 25,
        "montreal": 25,
        "sydney": 30,
        "melbourne": 28,
        "bisbane": 25,
        "perth": 20,

        # European cities (20-30 boost)
        "berlin": 25,
        "frankfurt": 22,
        "amsterdam": 25,
        "madrid": 22,
        "barcelona": 25,
        "rome": 22,
        "milano": 25,
        "zurich": 25,
        "stockholm": 22,
    }
    return major_markets.get(str(city or "").lower(), 0)


def venue_type_multiplier(venue_type: str = "") -> float:
    """Multiplier based on venue type"""
    venue_type = venue_type.lower().strip()
    multipliers = {
        'stadium': 1.4,      # Large stadiums
        'arena': 1.2,        # Indoor arenas
        'amphitheatre': 1.1, # Outdoor venues
        'theater': 0.9,      # Traditional theaters
        'club': 0.7,         # Small clubs
        'hall': 0.8,         # Concert halls
        'festival': 1.6,     # Festival grounds
        'grounds': 1.5,      # Sports grounds
        'park': 1.3,         # Parks
    }

    for key, mult in multipliers.items():
        if key in venue_type:
            return mult
    return 1.0  # Default


def weighted_average_ticket_price(tiers: Dict[str, float]) -> float:
    """Calculate weighted average ticket price"""
    return (
        tiers["vip"] * 0.10 +     # VIP: 10%
        tiers["tier1"] * 0.20 +   # Premium: 20%
        tiers["tier2"] * 0.40 +   # Standard: 40%
        tiers["tier3"] * 0.30     # Economy: 30%
    )


def calculate_pricing_tiers(artist_popularity: float, city_popularity: float,
                          venue_capacity: int, city: str, venue_type: str = "") -> Tuple[Dict[str, float], float]:
    """
    Improved pricing estimator.
    Returns: (tiers_dict, average_price_in_inr)
    """
    market_multiplier = 1 + city_market_boost(city) / 100
    venue_mult = venue_type_multiplier(venue_type)

    # Capacity/scarcity multiplier - more nuanced
    if venue_capacity < 500:
        scarcity_multiplier = 1.3   # Very exclusive, high demand
    elif venue_capacity < 2000:
        scarcity_multiplier = 1.1   # Small venues
    elif venue_capacity < 10000:
        scarcity_multiplier = 1.0   # Medium venues (baseline)
    elif venue_capacity < 30000:
        scarcity_multiplier = 0.9   # Large venues, slightly easier to fill
    else:
        scarcity_multiplier = 0.75  # Very large stadiums, harder to fill completely

    # Base price calculation with better scaling
    # Artist popularity: 0-100 scale, significant impact
    # City popularity: 0-100 scale, moderate impact
    base_price = max(
        500,  # Increased minimum ticket price
        (800 + artist_popularity * 12 + city_popularity * 8)
        * market_multiplier
        * scarcity_multiplier
        * venue_mult,
    )

    # More realistic tier distribution
    tiers = {
        "vip": round(base_price * 4.5),      # VIP: 4.5x base
        "tier1": round(base_price * 2.2),    # Premium: 2.2x base
        "tier2": round(base_price),          # Standard: 1x base
        "tier3": round(base_price * 0.5),    # Economy: 0.5x base
    }

    avg_price = weighted_average_ticket_price(tiers)
    return tiers, avg_price


def predict_sales(artist_popularity: float, city_popularity: float,
                venue_capacity: int, city: str, venue_type: str = "") -> Tuple[int, float]:
    """
    Improved ticket sales prediction.
    Returns: (tickets_sold, demand_score)
    """
    demand_score = clamp(
        city_popularity * 0.65
        + artist_popularity * 0.25
        + city_market_boost(city) * 0.3,  # Reduced impact of city boost on demand
        10,  # Minimum demand score increased
        95,  # Maximum demand score decreased slightly
    )

    # Enhanced sell-through calculation
    # Base sell-through depends on venue size and demand
    base_sell_through = 0.25  # Base 25% sell-through

    # Demand factor (0-1 scale)
    demand_factor = (demand_score - 10) / 85  # Normalize demand_score 10-95 to 0-1

    # Venue size factor - smaller venues tend to have higher % sell-through
    if venue_capacity < 1000:
        venue_factor = 1.3
    elif venue_capacity < 5000:
        venue_factor = 1.1
    elif venue_capacity < 20000:
        venue_factor = 1.0
    else:
        venue_factor = 0.8  # Very large venues harder to fill

    sell_through = clamp(base_sell_through + demand_factor * 0.5, 0.15, 0.85)
    sell_through *= venue_factor
    sell_through = clamp(sell_through, 0.15, 0.90)  # Final bounds

    tickets_sold = min(int(round(venue_capacity * sell_through)), int(venue_capacity))

    return tickets_sold, demand_score


def process_concert(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main processing function.
    Expects: artist_popularity, artist_city_popularity, venue_capacity, city, currency, venue_type (optional)
    """
    artist_popularity = clamp(to_number(data.get("artist_popularity"), 50), 0, 100)
    city_popularity = clamp(
        to_number(data.get("artist_city_popularity"), artist_popularity),
        0,
        100,
    )
    venue_capacity = max(100, int(round(to_number(data.get("venue_capacity"), 5000))))
    city = data.get("city", "")
    currency = data.get("currency", "INR").upper()
    venue_type = data.get("venue_type", "")

    tiers, avg_price = calculate_pricing_tiers(
        artist_popularity,
        city_popularity,
        venue_capacity,
        city,
        venue_type,
    )

    # Convert average price to INR if needed
    avg_price_inr = convert_to_inr(avg_price, currency)

    tickets_sold, demand_score = predict_sales(
        artist_popularity,
        city_popularity,
        venue_capacity,
        city,
        venue_type,
    )

    revenue_inr = tickets_sold * avg_price_inr

    return {
        "pricing_tiers": tiers,
        "avg_ticket_price": round(avg_price_inr, 2),
        "tickets_sold": tickets_sold,
        "total_revenue": round(revenue_inr, 2),
        "demand_score": round(demand_score, 2),
        "model_version": MODEL_VERSION,
        "status": "processed",
        "currency": "INR"  # Always output in INR now
    }


def process_concert_batch(concerts_data: list) -> list:
    """Process multiple concerts"""
    results = []
    for concert_data in concerts_data:
        try:
            result = process_concert(concert_data)
            results.append(result)
        except Exception as e:
            results.append({
                "error": str(e),
                "input": concert_data,
                "status": "failed"
            })
    return results


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input data provided"}))
        sys.exit(1)

    try:
        input_data = json.loads(sys.argv[1])

        if isinstance(input_data, list):
            results = process_concert_batch(input_data)
        else:
            results = process_concert(input_data)

        print(json.dumps(results))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)