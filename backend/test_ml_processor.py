#!/usr/bin/env python3
"""
Test script to verify ML processor outputs with real data patterns from the database
"""

import json
import subprocess
import sys

def test_ml_processor():
    # Test cases based on actual data from the database
    test_cases = [
        {
            "name": "Javed Ali - US Concert (high revenue)",
            "input": {
                "artist_popularity": 75,  # Established artist
                "artist_city_popularity": 60,  # Moderate local popularity
                "venue_capacity": 3500,  # Medium venue
                "city": "Plano",
                "country": "United States"
            }
        },
        {
            "name": "Diljit Dosanjh - US Concert (very high revenue)",
            "input": {
                "artist_popularity": 85,  # Very popular artist
                "artist_city_popularity": 70,  # Good local popularity
                "venue_capacity": 15000,  # Large venue
                "city": "Los Angeles",
                "country": "United States"
            }
        },
        {
            "name": "Shreya Ghoshal - US Concert (high revenue)",
            "input": {
                "artist_popularity": 80,  # Very popular artist
                "artist_city_popularity": 65,  # Good local popularity
                "venue_capacity": 15000,  # Large venue
                "city": "Oakland",
                "country": "United States"
            }
        },
        {
            "name": "Atif Aslam - UAE Concert (high revenue)",
            "input": {
                "artist_popularity": 75,  # Popular artist
                "artist_city_popularity": 60,  # Moderate local popularity
                "venue_capacity": 15000,  # Large venue
                "city": "Abu Dhabi",
                "country": "United Arab Emirates"
            }
        }
    ]

    print("Testing ML Processor Outputs")
    print("=" * 50)

    for test_case in test_cases:
        print(f"\n{test_case['name']}:")
        print("-" * 30)

        try:
            # Call the ML processor
            result = subprocess.run([
                sys.executable,
                '/d/Projects/Dashboard-main/backend/ml_engine/processor.py'
            ],
            input=json.dumps(test_case['input']),
            text=True,
            capture_output=True,
            timeout=10
            )

            if result.returncode == 0:
                output = json.loads(result.stdout.strip())
                print(f"Input: {test_case['input']}")
                print(f"Output: {json.dumps(output, indent=2)}")

                # Check if revenue is in expected range (crores)
                revenue = output.get('total_revenue', 0)
                if revenue >= 10000000:  # 1 crore = 10,000,000 INR
                    print(f"[PASS] Revenue: INR {revenue:,.2f} (IN CRORES - GOOD)")
                elif revenue >= 100000:  # 1 lakh = 100,000 INR
                    print(f"[FAIL] Revenue: INR {revenue:,.2f} (IN LAKHS - TOO LOW)")
                else:
                    print(f"[FAIL] Revenue: INR {revenue:,.2f} (VERY LOW)")

            else:
                print(f"[ERROR] Error: {result.stderr}")

        except Exception as e:
            print(f"[ERROR] Exception: {e}")

if __name__ == "__main__":
    test_ml_processor()