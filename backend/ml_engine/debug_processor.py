#!/usr/bin/env python3
"""
Debug version of the processor to see what's happening with sys.argv
"""

import json
import sys
import os

print("Debug Processor Starting")
print("sys.argv:", sys.argv)
print("len(sys.argv):", len(sys.argv))
print("Current working directory:", os.getcwd())

if len(sys.argv) < 2:
    print("Error: No input data provided (sys.argv length < 2)")
    result = {"error": "No input data provided"}
    print(json.dumps(result))
    sys.exit(1)

try:
    print("Attempting to parse sys.argv[1]:")
    print("sys.argv[1] =", repr(sys.argv[1]))
    input_data = json.loads(sys.argv[1])
    print("Successfully parsed input:", input_data)

    # Simple test calculation
    artist_pop = input_data.get("artist_popularity", 0)
    revenue = artist_pop * 100000  # Simple calculation for testing

    result = {
        "test": "success",
        "artist_popularity": artist_pop,
        "calculated_revenue": revenue,
        "model_version": "debug-v1"
    }
    print(json.dumps(result))

except json.JSONDecodeError as e:
    print("JSON Decode Error:", e)
    result = {"error": f"Invalid JSON: {e}"}
    print(json.dumps(result))
    sys.exit(1)
except Exception as e:
    print("General Error:", e)
    result = {"error": f"Error: {e}"}
    print(json.dumps(result))
    sys.exit(1)