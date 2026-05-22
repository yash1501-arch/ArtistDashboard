"""
Currency utilities for MAD Analytics.

The ML model trains and predicts in USD (stable base currency).
This module handles conversion to/from local currencies for display.
"""
from __future__ import annotations

# Exchange rates: 1 USD = X local currency
# These are approximate rates; the backend CurrencyConversionService
# has more precise rates that can override via environment variable.
USD_RATES = {
    "USD": 1.0,
    "INR": 84.0,
    "EUR": 0.92,
    "GBP": 0.79,
    "AUD": 1.53,
    "CAD": 1.37,
    "AED": 3.67,
    "SGD": 1.34,
    "NZD": 1.67,
    "JPY": 155.0,
    "KRW": 1350.0,
    "THB": 35.0,
    "MYR": 4.7,
    "ZAR": 18.5,
    "BRL": 5.0,
    "MXN": 17.0,
}

# Country → Currency mapping
COUNTRY_CURRENCY = {
    "india": "INR",
    "united states": "USD",
    "usa": "USD",
    "us": "USD",
    "united kingdom": "GBP",
    "uk": "GBP",
    "australia": "AUD",
    "canada": "CAD",
    "united arab emirates": "AED",
    "uae": "AED",
    "singapore": "SGD",
    "new zealand": "NZD",
    "japan": "JPY",
    "south korea": "KRW",
    "thailand": "THB",
    "malaysia": "MYR",
    "south africa": "ZAR",
    "brazil": "BRL",
    "mexico": "MXN",
    # European countries → EUR
    "germany": "EUR",
    "france": "EUR",
    "italy": "EUR",
    "spain": "EUR",
    "netherlands": "EUR",
    "belgium": "EUR",
    "austria": "EUR",
    "portugal": "EUR",
    "ireland": "EUR",
    "finland": "EUR",
    "greece": "EUR",
    # Fallback for unrecognized
}


def resolve_currency(country: str, explicit_currency: str | None = None) -> str:
    """Resolve the local currency for a given country."""
    if explicit_currency and explicit_currency.upper() in USD_RATES:
        return explicit_currency.upper()

    country_lower = country.lower().strip()
    for key, currency in COUNTRY_CURRENCY.items():
        if key in country_lower:
            return currency

    # Default to USD for unrecognized countries
    return "USD"


def usd_to_local(amount_usd: float, currency: str) -> float:
    """Convert USD amount to local currency."""
    rate = USD_RATES.get(currency.upper(), 1.0)
    return round(amount_usd * rate, 2)


def local_to_usd(amount_local: float, currency: str) -> float:
    """Convert local currency amount to USD."""
    rate = USD_RATES.get(currency.upper(), 1.0)
    if rate == 0:
        return 0.0
    return round(amount_local / rate, 2)


def get_exchange_rate(currency: str) -> float:
    """Get the USD → local currency exchange rate."""
    return USD_RATES.get(currency.upper(), 1.0)
