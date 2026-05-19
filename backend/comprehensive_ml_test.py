#!/usr/bin/env python3
"""
Comprehensive test of the improved ML model for concert revenue prediction
"""

import json
import subprocess
import sys
import os

def test_concert(name, artist_pop, city_pop, capacity, city, country, venue_type="", expected_min_cr=None):
    """Test a concert scenario"""
    print(f"\n{name}:")
    print("-" * 50)

    input_data = {
        "artist_popularity": artist_pop,
        "artist_city_popularity": city_pop,
        "venue_capacity": capacity,
        "city": city,
        "country": country
    }

    if venue_type:
        input_data["venue_type"] = venue_type

    try:
        # Get the absolute path to processor.py
        processor_path = os.path.join(os.path.dirname(__file__), 'ml_engine', 'processor.py')

        result = subprocess.run([
            sys.executable,
            processor_path
        ],
        input=json.dumps(input_data),
        text=True,
        capture_output=True,
        timeout=10
        )

        if result.returncode == 0:
            output = json.loads(result.stdout.strip())
            revenue_inr = output.get('total_revenue', 0)
            revenue_cr = revenue_inr / 10000000  # Convert to crores

            print(f"Input: {input_data}")
            print(f"Output Revenue: INR {revenue_inr:,.2f} ({revenue_cr:.2f} crores)")
            print(f"Avg Ticket Price: INR {output.get('avg_ticket_price', 0):,.2f}")
            print(f"Tickets Sold: {output.get('tickets_sold', 0):,}")
            print(f"Demand Score: {output.get('demand_score', 0)}")

            if expected_min_cr is not None:
                if revenue_cr >= expected_min_cr:
                    print(f"[PASS] Meets minimum expectation of {expected_min_cr} crores")
                else:
                    print(f"[FAIL] Below minimum expectation of {expected_min_cr} crores")

            return revenue_cr
        else:
            print(f"[ERROR] {result.stderr}")
            return 0

    except Exception as e:
        print(f"[ERROR] Exception: {e}")
        return 0

def main():
    print("Comprehensive ML Model Testing for Concert Revenue Prediction")
    print("=" * 60)

    test_cases = [
        # Based on actual database observations
        ("Javed Ali - US Concert (from DB)", 75, 60, 3500, "Plano", "United States", "", 0.5),
        ("Diljit Dosanjh - US Concert (from DB)", 85, 70, 15000, "Los Angeles", "United States", "", 3.0),
        ("Shreya Ghoshal - US Concert (from DB)", 80, 65, 15000, "Oakland", "United States", "", 3.0),
        ("Atif Aslam - UAE Concert (from DB)", 75, 60, 15000, "Abu Dhabi", "United Arab Emirates", "", 3.0),

        # Major international artists in major venues (should be in crores)
        ("Ed Sheeran - Wembley Stadium", 95, 90, 90000, "London", "United Kingdom", "stadium", 15.0),
        ("BTS - SoFi Stadium", 98, 85, 70000, "Los Angeles", "United States", "stadium", 20.0),
        ("Coldplay - Mumbai", 90, 85, 80000, "Mumbai", "India", "stadium", 12.0),
        ("Taylor Swift - Singapore", 95, 80, 55000, "Singapore", "Singapore", "stadium", 10.0),

        # Medium scale events
        ("Arijit Singh - Bangalore Arena", 85, 75, 15000, "Bangalore", "India", "arena", 2.5),
        ("Shreya Ghoshal - Dubai Arena", 80, 70, 12000, "Dubai", "United Arab Emirates", "arena", 2.0),
        ("Badshah - Delhi Show", 70, 65, 8000, "Delhi", "India", "arena", 1.0),

        # Smaller events (may be in lakhs)
        ("Local Artist - Small Venue", 40, 30, 500, "Pune", "India", "club", 0.05),
        ("Emerging Artist - Medium Venue", 55, 45, 2000, "Hyderabad", "India", "theater", 0.3),
    ]

    results = []
    for test_case in test_cases:
        revenue_cr = test_concert(*test_case)
        results.append({
            "name": test_case[0],
            "revenue_cr": revenue_cr,
            "expected_min": test_case[6] if len(test_case) > 6 else None
        })

    print("\n" + "=" * 60)
    print("SUMMARY:")
    print("=" * 60)

    passed = 0
    total = len([tc for tc in results if tc["expected_min"] is not None])

    for result in results:
        status = "[PASS]" if (result["expected_min"] is None or result["revenue_cr"] >= result["expected_min"]) else "[FAIL]"
        if result["expected_min"] is not None and result["revenue_cr"] >= result["expected_min"]:
            passed += 1

        print(f"{status} {result['name']}: {result['revenue_cr']:.2f} crores" +
              (f" (expected ≥{result['expected_min']} cr)" if result["expected_min"] else ""))

    if total > 0:
        print(f"\nPassed: {passed}/{total} tests")
        if passed == total:
            print("✅ All tests met expectations!")
        else:
            print("⚠️  Some tests below expectations - consider tuning parameters")
    else:
        print("ℹ️  No minimum expectations set for comparison")

if __name__ == "__main__":
    main()