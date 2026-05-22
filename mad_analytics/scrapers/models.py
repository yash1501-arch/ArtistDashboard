"""Data models for scraped concert data."""
from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import Optional


@dataclass
class ScrapedConcert:
    """A concert scraped from an external source."""
    event_name: str
    artist_name: str
    venue_name: str
    city: str
    country: str
    date: Optional[str]           # ISO format: "2026-07-15"
    time: Optional[str]           # "7:00 PM" or "19:00"
    price_min: Optional[float]    # Lowest ticket tier
    price_max: Optional[float]    # Highest ticket tier (VIP)
    currency: str = "INR"
    source_url: str = ""
    source: str = ""              # "bookmyshow" or "district"

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def avg_ticket_price(self) -> Optional[float]:
        if self.price_min and self.price_max:
            return (self.price_min + self.price_max) / 2
        return self.price_min or self.price_max
