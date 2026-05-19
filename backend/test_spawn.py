#!/usr/bin/env python3
"""
Test the exact way the Node.js service calls the Python script
"""

import json
import subprocess
import sys
import os

def test_spawn_call():
    # Test case based on actual data
    input_data = {
        "artist_popularity": 75,
        "artist_city_popularity": 60,
        "venue_capacity": 3500,
        "city": "Plano",
        "country": "United States"
    }

    print("Testing ML Model - Spawn Style Call")
    print("Input:", input_data)

    try:
        # Get the absolute path to processor.py
        processor_path = os.path.join(os.path.dirname(__file__), 'ml_engine', 'processor.py')
        print("Processor path:", processor_path)
        print("File exists:", os.path.exists(processor_path))

        # Convert input to JSON string (exactly like Node.js does)
        input_json = json.dumps(input_data)
        print("Input JSON:", input_json)

        # This is exactly how the Node.js service calls it
        result = subprocess.run([
            sys.executable,
            processor_path,
            input_json  # This becomes sys.argv[1]
        ],
        capture_output=True,
        text=True,
        timeout=10
        )

        print("Return code:", result.returncode)
        print("Stdout:", repr(result.stdout))
        print("Stderr:", repr(result.stderr))

        if result.returncode == 0:
            output = json.loads(result.stdout.strip())
            print("Parsed output:", output)

            revenue_inr = output.get('total_revenue', 0)
            revenue_cr = revenue_inr / 10000000  # Convert to crores

            print(f"Revenue: INR {revenue_inr:,.2f}")
            print(f"Revenue: {revenue_cr:.2f} crores")

            # Check if it's in reasonable range
            if revenue_cr >= 0.5:  # At least 0.5 crores (50 lakhs)
                print("SUCCESS: Revenue is in crores range - GOOD!")
            else:
                print("FAILURE: Revenue is still too low")
        else:
            print("ERROR running processor")
            print("Stderr:", result.stderr)

    except Exception as e:
        print(f"Exception: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_spawn_call()