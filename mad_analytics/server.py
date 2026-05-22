"""
server.py — FastAPI bridge between Express/TypeScript and mad_analytics.

Endpoints
---------
POST /growth      → GrowthOutput
POST /demand      → DemandOutput
POST /revenue     → RevenueOutput
GET  /health      → { status: "ok" }

Run
---
    uvicorn mad_analytics.server:app --port 8001 --workers 2

Express integration
-------------------
    // In your Express route:
    const res = await fetch("http://localhost:8001/revenue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
"""
from __future__ import annotations
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables from backend/.env if available
_env_path = Path(__file__).parent.parent / "backend" / ".env"
if _env_path.exists():
    with open(_env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                # Only set if not already in environment (don't override explicit env vars)
                if key and not os.environ.get(key):
                    os.environ[key] = value

from .utils.schemas import (
    GrowthInput,
    DemandInput,
    RevenueInput,
    PopularityInput,
    LlmPredictorInput,
    VenueCapacityInput,
)
from .growth.rog_calculator import calculate as growth_calc
from .demand.scorer import calculate as demand_calc
from .revenue.predictor import calculate as revenue_calc
from .revenue.llm_model import calculate as llm_calc
from .popularity import calculate as popularity_calc, calculate_all as popularity_calc_all
from .utils.db import persist_popularity_scores, fetch_saved_popularity
from .venue_capacity import calculate as venue_capacity_calc
from .venue_capacity.resolver import fetch_saved_capacity_resolutions

app = FastAPI(title="MAD Analytics", version="1.0.0")

# Internal API token for service-to-service auth (optional but recommended)
INTERNAL_API_TOKEN = os.environ.get("MAD_ANALYTICS_TOKEN")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "mad_analytics"}

@app.post("/llm-predict")
def llm_predict(payload: LlmPredictorInput):
    try:
        return llm_calc(payload)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/venue-capacity")
def venue_capacity(payload: VenueCapacityInput):
    try:
        return venue_capacity_calc(payload)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.get("/venue-capacity/saved")
def venue_capacity_saved(db_url: str | None = Query(default=None)):
    try:
        return fetch_saved_capacity_resolutions(db_url)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/venue-capacity/enrich")
def venue_capacity_enrich(dry_run: bool = Query(default=False)):
    """Batch-resolve venue capacities from concert data and persist results."""
    import os
    from .training.enrich_venues import (
        load_venues_from_concerts,
        load_existing_venues,
        resolve_batch,
        backfill_concerts,
    )
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise HTTPException(status_code=500, detail="DATABASE_URL not configured")
    try:
        df = load_venues_from_concerts(db_url)
        existing = load_existing_venues(db_url)
        results = resolve_batch(df, db_url, existing, dry_run=dry_run)
        updated = backfill_concerts(results, db_url, dry_run=dry_run)
        summary = {
            "total_venues": len(results),
            "validated": sum(1 for r in results if r["status"] == "validated"),
            "estimated": sum(1 for r in results if r["status"] == "estimated"),
            "review_required": sum(1 for r in results if r["status"] == "review_required"),
            "already_verified": sum(1 for r in results if r["status"] == "already_verified"),
            "capacity_updates": sum(1 for r in results if r["action"] == "update"),
            "concerts_updated": updated,
            "dry_run": dry_run,
            "changes": [r for r in results if r["action"] == "update"],
        }
        return summary
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/growth")
def growth(payload: GrowthInput):
    try:
        return growth_calc(payload)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/demand")
def demand(payload: DemandInput):
    try:
        return demand_calc(payload)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/revenue")
def revenue(payload: RevenueInput):
    try:
        return revenue_calc(payload)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/popularity")
def popularity(payload: PopularityInput):
    try:
        return popularity_calc(payload)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/popularity/all/save")
def popularity_all_save():
    try:
        outputs = popularity_calc_all()
        saved = persist_popularity_scores(outputs)
        return {"saved_artists": saved, "saved_at": outputs[0].computed_at if outputs else None}
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.get("/popularity/saved")
def popularity_saved():
    try:
        return fetch_saved_popularity()
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.get("/popularity/all")
def popularity_all():
    try:
        return popularity_calc_all()
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
