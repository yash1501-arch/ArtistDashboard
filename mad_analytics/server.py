"""
server.py — FastAPI bridge between Express/TypeScript and mad_analytics.

Includes a background scheduler that automatically:
- Scrapes concerts from BookMyShow + District every 12 hours
- Retrains the ML model every 24 hours
- Updates artist popularity scores every 24 hours

Run:
    uvicorn mad_analytics.server:app --port 8001
"""
from __future__ import annotations
import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("mad_analytics")

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


# ── Background Scheduler ───────────────────────────────────────────────────────

SCRAPE_INTERVAL_HOURS = int(os.environ.get("SCRAPE_INTERVAL_HOURS", "12"))
RETRAIN_INTERVAL_HOURS = int(os.environ.get("RETRAIN_INTERVAL_HOURS", "24"))
_scheduler_running = False


def _run_scraper_job():
    """Scrape concerts from BookMyShow + District and store in DB."""
    db_url = os.environ.get("DATABASE_URL")
    if not db_url or not os.environ.get("SERPAPI_KEY"):
        logger.info("[Scheduler] Skipping scrape (DATABASE_URL or SERPAPI_KEY not set)")
        return 0

    try:
        from .scrapers.bookmyshow import scrape_bookmyshow
        from .scrapers.district import scrape_district
        from .scrapers.run_scraper import store_concerts

        logger.info("[Scheduler] Running concert scraper...")
        bms = scrape_bookmyshow()
        dist = scrape_district()
        all_concerts = bms + dist
        stored = store_concerts(all_concerts, db_url)
        logger.info(f"[Scheduler] Scrape done: {stored} new concerts from {len(all_concerts)} scraped.")
        return stored
    except Exception as e:
        logger.error(f"[Scheduler] Scraper error: {e}")
        return 0


def _run_retrain_job():
    """Retrain the revenue prediction model with all available data."""
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        return

    try:
        from .training.train_revenue import load_training_data, train
        from .utils import model_store

        logger.info("[Scheduler] Retraining revenue model...")
        df = load_training_data(db_url)
        if len(df) < 10:
            logger.info(f"[Scheduler] Only {len(df)} samples, skipping retrain.")
            return

        model, preprocessor = train(df)
        model_store.save("revenue_model", model)
        model_store.save("revenue_preprocessor", preprocessor)
        logger.info(f"[Scheduler] Model retrained on {len(df)} samples.")
    except Exception as e:
        logger.error(f"[Scheduler] Retrain error: {e}")


def _run_popularity_job():
    """Update artist popularity scores in the artists table."""
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        return

    try:
        from sqlalchemy import create_engine, text as sql_text

        outputs = popularity_calc_all()
        if not outputs:
            return

        normalized_url = db_url.replace("postgres://", "postgresql://", 1) if db_url.startswith("postgres://") else db_url
        engine = create_engine(normalized_url)
        with engine.begin() as conn:
            for output in outputs:
                conn.execute(
                    sql_text('UPDATE artists SET popularity = :score WHERE id = :id'),
                    {"score": round(output.popularity_score, 2), "id": output.artist_id}
                )
        engine.dispose()
        logger.info(f"[Scheduler] Updated popularity for {len(outputs)} artists.")
    except Exception as e:
        logger.error(f"[Scheduler] Popularity update error: {e}")


def _scheduler_loop():
    """Background scheduler loop."""
    global _scheduler_running
    _scheduler_running = True

    # Wait 60 seconds after startup before first run (let server stabilize)
    time.sleep(60)
    logger.info(f"[Scheduler] Active: scrape every {SCRAPE_INTERVAL_HOURS}h, retrain every {RETRAIN_INTERVAL_HOURS}h")

    # Initial run on startup
    _run_popularity_job()
    _run_scraper_job()
    _run_retrain_job()

    # Periodic runs
    hours_since_scrape = 0
    hours_since_retrain = 0

    while _scheduler_running:
        time.sleep(3600)  # Sleep 1 hour
        hours_since_scrape += 1
        hours_since_retrain += 1

        if hours_since_scrape >= SCRAPE_INTERVAL_HOURS:
            _run_scraper_job()
            hours_since_scrape = 0

        if hours_since_retrain >= RETRAIN_INTERVAL_HOURS:
            _run_retrain_job()
            _run_popularity_job()
            hours_since_retrain = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background scheduler on server startup."""
    thread = threading.Thread(target=_scheduler_loop, daemon=True, name="mad-scheduler")
    thread.start()
    logger.info("[Server] Background scheduler thread started.")
    yield
    global _scheduler_running
    _scheduler_running = False
    logger.info("[Server] Shutting down.")


# ── FastAPI App ────────────────────────────────────────────────────────────────

app = FastAPI(title="MAD Analytics", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "mad_analytics", "scheduler": _scheduler_running}


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
    """Batch-resolve venue capacities from concert data."""
    from .training.enrich_venues import (
        load_venues_from_concerts, load_existing_venues, resolve_batch, backfill_concerts,
    )
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise HTTPException(status_code=500, detail="DATABASE_URL not configured")
    try:
        df = load_venues_from_concerts(db_url)
        existing = load_existing_venues(db_url)
        results = resolve_batch(df, db_url, existing, dry_run=dry_run)
        updated = backfill_concerts(results, db_url, dry_run=dry_run)
        return {
            "total_venues": len(results),
            "validated": sum(1 for r in results if r["status"] == "validated"),
            "estimated": sum(1 for r in results if r["status"] == "estimated"),
            "capacity_updates": sum(1 for r in results if r["action"] == "update"),
            "concerts_updated": updated,
            "dry_run": dry_run,
        }
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


# Manual trigger endpoints for the scheduler jobs
@app.post("/scheduler/scrape")
def trigger_scrape():
    """Manually trigger the concert scraper."""
    stored = _run_scraper_job()
    return {"status": "done", "new_concerts": stored}


@app.post("/scheduler/retrain")
def trigger_retrain():
    """Manually trigger model retraining."""
    _run_retrain_job()
    return {"status": "done"}


@app.post("/scheduler/popularity")
def trigger_popularity():
    """Manually trigger popularity score update."""
    _run_popularity_job()
    return {"status": "done"}
