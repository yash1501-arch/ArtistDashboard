#!/usr/bin/env python3
"""
Debug test of the ML model subprocess call
"""

import json
import subprocess
import sys
import os

def test_ml_debug():
    # Test case based on actual data
    input_data = {
        "artist_popularity": 75,
        "artist_city_popularity": 60,
        "venue_capacity": 3500,
        "city": "Plano",
        "country": "United States"
    }

    print("Testing ML Model - Debug Version")
    print("Input:", input_data)

    try:
        # Get the absolute path to processor.py
        processor_path = os.path.join(os.path.dirname(__file__), 'ml_engine', 'processor.py')
        print("Processor path:", processor_path)
        print("File exists:", os.path.exists(processor_path))

        # Convert input to JSON string
        input_json = json.dumps(input_data)
        print("Input JSON:", input_json)
        print("Input JSON length:", len(input_json))

        # Try different ways of passing input
        print("\n--- Testing subprocess call ---")

        # Method 1: Using input parameter
        result1 = subprocess.run([
            sys.executable,
            processor_path
        ],
        input=input_json,
        text=True,
        capture_output=True,
        timeout=10
        )

        print("Method 1 (input param):")
        print("  Return code:", result1.returncode)
        print("  Stdout:", repr(result1.stdout))
        print("  Stderr:", repr(result1.stderr))

        # Method 2: Using echo and pipe (simulate)
        print("\n--- Manual verification ---")
        manual_cmd = f'echo \'{input_json}\' | {sys.executable} {processor_path}'
        print("Manual command would be:", manual_cmd)

        # Let's test direct execution
        print("\n--- Direct execution test ---")
        with open('temp_input.json', 'w') as f:
            f.write(input_json)

        result2 = subprocess.run([
            sys.executable,
            processor_path
        ],
        stdin=open('temp_input.json', 'r'),
        text=True,
        capture_output=True,
        timeout=10
        )

        print("Method 2 (stdin file):")
        print("  Return code:", result2.returncode)
        print("  Stdout:", repr(result2.stdout))
        print("  Stderr:", repr(result2.stderr))

        # Clean up
        os.remove('temp_input.json')

        if result2.returncode == 0:
            output = json.loads(result2.stdout.strip())
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
            print("Stderr:", result2.stderr)

    except Exception as e:
        print(f"Exception: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_ml_debug()