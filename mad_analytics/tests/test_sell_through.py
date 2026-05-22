from __future__ import annotations

from datetime import date, timedelta

from mad_analytics.utils.feature_engineering import (
    sell_through_percentage,
    sell_through_rate,
    ticket_velocity,
)
from mad_analytics.utils.schemas import ConcertRow


def make_concert(
    concert_id: str,
    *,
    days_ago: int,
    tickets_sold: int | None,
    venue_capacity: int,
) -> ConcertRow:
    return ConcertRow(
        concert_id=concert_id,
        artist_id="artist_001",
        city="Mumbai",
        country="India",
        venue_capacity=venue_capacity,
        ticket_price_min=500,
        ticket_price_max=2000,
        date=date.today() - timedelta(days=days_ago),
        tickets_sold=tickets_sold,
    )


class TestSellThroughPercentage:
    def test_sell_through_rate(self):
        assert sell_through_rate(4800, 5000) == 0.96

    def test_sell_through_percentage(self):
        assert sell_through_percentage(4800, 5000) == 96.0

    def test_zero_capacity_returns_zero(self):
        assert sell_through_percentage(4800, 0) == 0.0

    def test_missing_or_negative_tickets_return_zero(self):
        assert sell_through_percentage(None, 5000) == 0.0
        assert sell_through_percentage(-10, 5000) == 0.0

    def test_oversold_events_are_capped_by_default(self):
        assert sell_through_rate(5500, 5000) == 1.0
        assert sell_through_percentage(5500, 5000) == 100.0

    def test_oversold_events_can_be_uncapped(self):
        assert sell_through_rate(5500, 5000, cap_at_one=False) == 1.1
        assert sell_through_percentage(5500, 5000, cap_at_100=False) == 110.0

    def test_ticket_velocity_uses_recent_past_sell_through(self):
        concerts = [
            make_concert("recent_a", days_ago=10, tickets_sold=2500, venue_capacity=5000),
            make_concert("recent_b", days_ago=20, tickets_sold=5500, venue_capacity=5000),
            make_concert("old", days_ago=120, tickets_sold=5000, venue_capacity=5000),
        ]

        assert ticket_velocity(concerts, days_back=90) == 0.75

