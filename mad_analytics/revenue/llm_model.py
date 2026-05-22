"""
revenue/llm_model.py
Heuristic model port of the 'LLM-type' logic.
Since public APIs for exact tickets sold and revenue aren't available,
this model relies on popularity, capacity, and city boosts to deterministically
predict sales and dynamic pricing tiers.
"""
from __future__ import annotations
from typing import Tuple

from ..utils.schemas import LlmPredictorInput, LlmPredictorOutput
from ..utils.feature_engineering import artist_city_popularity, resolve_venue_capacity

MODEL_VERSION = "heuristic-demand-v4-improved-analytics"

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

def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))

def convert_to_inr(amount: float, currency: str) -> float:
    rate = CURRENCY_TO_INR.get(currency.upper(), 1.0)
    return amount * rate

def city_market_boost(city: str) -> float:
    major_markets = {
        "mumbai": 40, "delhi": 38, "new delhi": 38, "bangalore": 35, "bengaluru": 35, "hyderabad": 30, "pune": 28, "chennai": 25, "kolkata": 25,
        "ahmedabad": 20, "chandigarh": 20, "jaipur": 15,
        "new york": 50, "los angeles": 45, "london": 45, "paris": 40, "tokyo": 40, "singapore": 35, "dubai": 40, "abu dhabi": 35,
        "chicago": 30, "washington": 30, "boston": 28, "san francisco": 35, "las vegas": 30, "miami": 28, "toronto": 30,
        "vancouver": 25, "montreal": 25, "sydney": 30, "melbourne": 28, "bisbane": 25, "perth": 20,
        "berlin": 25, "frankfurt": 22, "amsterdam": 25, "madrid": 22, "barcelona": 25, "rome": 22, "milano": 25, "zurich": 25, "stockholm": 22,
    }
    return major_markets.get(str(city or "").lower(), 0)

def venue_type_multiplier(venue_type: str = "") -> float:
    vt = venue_type.lower().strip()
    multipliers = {
        'stadium': 1.4, 'arena': 1.2, 'amphitheatre': 1.1, 'theater': 0.9,
        'club': 0.7, 'hall': 0.8, 'festival': 1.6, 'grounds': 1.5, 'park': 1.3,
    }
    for key, mult in multipliers.items():
        if key in vt:
            return mult
    return 1.0

def weighted_average_ticket_price(tiers: dict[str, float]) -> float:
    return (
        tiers["vip"] * 0.10 +
        tiers["tier1"] * 0.20 +
        tiers["tier2"] * 0.40 +
        tiers["tier3"] * 0.30
    )

def calculate_pricing_tiers(artist_popularity: float, city_popularity: float, venue_capacity: int, city: str, venue_type: str = "") -> Tuple[dict[str, float], float]:
    market_multiplier = 1 + city_market_boost(city) / 100
    venue_mult = venue_type_multiplier(venue_type)

    if venue_capacity < 500: scarcity_multiplier = 1.3
    elif venue_capacity < 2000: scarcity_multiplier = 1.1
    elif venue_capacity < 10000: scarcity_multiplier = 1.0
    elif venue_capacity < 30000: scarcity_multiplier = 0.9
    else: scarcity_multiplier = 0.75

    base_price = max(
        500,
        (800 + artist_popularity * 12 + city_popularity * 8) * market_multiplier * scarcity_multiplier * venue_mult,
    )

    tiers = {
        "vip": round(base_price * 4.5),
        "tier1": round(base_price * 2.2),
        "tier2": round(base_price),
        "tier3": round(base_price * 0.5),
    }

    avg_price = weighted_average_ticket_price(tiers)
    return tiers, avg_price

def predict_sales(artist_popularity: float, city_popularity: float, venue_capacity: int, city: str, venue_type: str = "") -> Tuple[int, float]:
    demand_score = clamp(
        city_popularity * 0.65 + artist_popularity * 0.25 + city_market_boost(city) * 0.3,
        10, 95,
    )

    base_sell_through = 0.25
    demand_factor = (demand_score - 10) / 85

    if venue_capacity < 1000: venue_factor = 1.3
    elif venue_capacity < 5000: venue_factor = 1.1
    elif venue_capacity < 20000: venue_factor = 1.0
    else: venue_factor = 0.8

    sell_through = clamp(base_sell_through + demand_factor * 0.5, 0.15, 0.85) * venue_factor
    sell_through = clamp(sell_through, 0.15, 0.90)

    tickets_sold = min(int(round(venue_capacity * sell_through)), int(venue_capacity))
    return tickets_sold, demand_score

def _estimate_tier_from_popularity(pop: float) -> str:
    if pop >= 80: return "superstar"
    elif pop >= 60: return "major"
    elif pop >= 40: return "mid"
    elif pop >= 20: return "rising"
    return "micro"

def calculate(payload: LlmPredictorInput) -> LlmPredictorOutput:
    artist_pop = payload.artist_popularity
    
    # Calculate city_pop explicitly using our new Indian market function if not provided
    if payload.artist_city_popularity is not None:
        city_pop = payload.artist_city_popularity
    else:
        city_pop = artist_city_popularity(artist_pop, payload.city)
        
    inferred_tier = _estimate_tier_from_popularity(artist_pop)
    capacity_result = resolve_venue_capacity(
        payload.venue_name or payload.venue_type or "venue",
        payload.city,
        venue_type=payload.venue_type,
        artist_tier=inferred_tier,
        supplied_capacity=None if payload.venue_capacity == 5000 else payload.venue_capacity,
    )
    capacity = max(10, capacity_result.capacity)

    tiers, avg_price = calculate_pricing_tiers(
        artist_pop, city_pop, capacity, payload.city, payload.venue_type
    )

    # Resolve the target currency from the payload or infer from city context
    from ..utils.currency import resolve_currency, local_to_usd, get_exchange_rate, USD_RATES

    target_currency = payload.currency.upper() if payload.currency else "INR"
    
    # The pricing model produces prices in INR base.
    # Convert from INR to target currency for display.
    if target_currency == "INR":
        avg_price_local = avg_price
    else:
        # Convert INR → target currency
        # INR → USD → target, or directly using cross rate
        inr_to_usd = 1.0 / USD_RATES.get("INR", 84.0)
        usd_to_target = USD_RATES.get(target_currency, 1.0)
        inr_to_target = inr_to_usd * usd_to_target
        avg_price_local = avg_price * inr_to_target

    tickets_sold, demand_score = predict_sales(
        artist_pop, city_pop, capacity, payload.city, payload.venue_type
    )

    revenue_local = tickets_sold * avg_price_local
    exchange_rate = get_exchange_rate(target_currency)
    revenue_usd = local_to_usd(revenue_local, target_currency)
    avg_price_usd = local_to_usd(avg_price_local, target_currency)

    return LlmPredictorOutput(
        pricing_tiers=tiers,
        avg_ticket_price=round(avg_price_local, 2),
        tickets_sold=tickets_sold,
        total_revenue=round(revenue_local, 2),
        demand_score=round(demand_score, 2),
        model_version=MODEL_VERSION,
        status="processed",
        currency=target_currency,
        total_revenue_usd=round(revenue_usd, 2),
        avg_ticket_price_usd=round(avg_price_usd, 2),
        exchange_rate=exchange_rate,
    )
