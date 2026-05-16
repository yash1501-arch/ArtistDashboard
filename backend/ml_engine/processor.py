import json
import math
import sys


MODEL_VERSION = "heuristic-demand-v2"


def clamp(value, minimum, maximum):
    return min(maximum, max(minimum, value))


def to_number(value, default=0):
    try:
        if value is None:
            return default
        number = float(value)
        if math.isnan(number) or math.isinf(number):
            return default
        return number
    except (TypeError, ValueError):
        return default


def city_market_boost(city):
    major_markets = {
        "mumbai",
        "delhi",
        "new delhi",
        "bangalore",
        "bengaluru",
        "hyderabad",
        "chennai",
        "pune",
        "kolkata",
        "new york",
        "los angeles",
        "london",
        "paris",
        "tokyo",
        "singapore",
        "dubai",
    }
    return 8 if str(city or "").lower() in major_markets else 0


def weighted_average_ticket_price(tiers):
    return (
        tiers["vip"] * 0.08
        + tiers["tier1"] * 0.22
        + tiers["tier2"] * 0.38
        + tiers["tier3"] * 0.32
    )


def calculate_pricing_tiers(artist_popularity, city_popularity, venue_capacity, city):
    """
    Deterministic pricing estimator.
    Popularity inputs are normalized to 0-100.
    """
    market_multiplier = 1 + city_market_boost(city) / 100

    if venue_capacity < 1000:
        scarcity_multiplier = 1.18
    elif venue_capacity > 20000:
        scarcity_multiplier = 0.88
    else:
        scarcity_multiplier = 1

    base_price = max(
        250,
        (350 + artist_popularity * 14 + city_popularity * 9)
        * market_multiplier
        * scarcity_multiplier,
    )

    tiers = {
        "vip": round(base_price * 3.1),
        "tier1": round(base_price * 1.55),
        "tier2": round(base_price),
        "tier3": round(base_price * 0.62),
    }

    return tiers, weighted_average_ticket_price(tiers)


def predict_sales(artist_popularity, city_popularity, venue_capacity, city):
    """
    Estimate sold tickets from local demand and venue capacity.
    The function is intentionally deterministic so reruns are stable.
    """
    demand_score = clamp(
        city_popularity * 0.72
        + artist_popularity * 0.18
        + city_market_boost(city),
        5,
        100,
    )

    sell_through = clamp(0.22 + demand_score / 125, 0.15, 0.97)
    tickets_sold = min(int(round(venue_capacity * sell_through)), int(venue_capacity))

    return tickets_sold, demand_score


def process_concert(data):
    """
    Expects:
    artist_popularity, artist_city_popularity, venue_capacity, city.
    """
    artist_popularity = clamp(to_number(data.get("artist_popularity"), 45), 0, 100)
    city_popularity = clamp(
        to_number(data.get("artist_city_popularity"), artist_popularity),
        0,
        100,
    )
    venue_capacity = max(100, int(round(to_number(data.get("venue_capacity"), 5000))))
    city = data.get("city", "")

    tiers, avg_price = calculate_pricing_tiers(
        artist_popularity,
        city_popularity,
        venue_capacity,
        city,
    )

    tickets_sold, demand_score = predict_sales(
        artist_popularity,
        city_popularity,
        venue_capacity,
        city,
    )

    revenue = tickets_sold * avg_price

    return {
        "pricing_tiers": tiers,
        "avg_ticket_price": round(avg_price, 2),
        "tickets_sold": tickets_sold,
        "total_revenue": round(revenue, 2),
        "demand_score": round(demand_score, 2),
        "model_version": MODEL_VERSION,
        "status": "processed",
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input data provided"}))
        sys.exit(1)

    try:
        input_data = json.loads(sys.argv[1])

        if isinstance(input_data, list):
            results = [process_concert(item) for item in input_data]
        else:
            results = process_concert(input_data)

        print(json.dumps(results))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)
