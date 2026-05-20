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
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .utils.schemas import GrowthInput, DemandInput, RevenueInput
from .growth.rog_calculator import calculate as growth_calc
from .demand.scorer import calculate as demand_calc
from .revenue.predictor import calculate as revenue_calc

app = FastAPI(title="MAD Analytics", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "mad_analytics"}


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