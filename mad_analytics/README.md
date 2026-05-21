# mad_analytics

Python ML calculation layer for the MAD (Music Artist Dashboard) platform.

## Modules

| Module | Input | Output |
|--------|-------|--------|
| `growth.rog_calculator` | Artist platform metrics (60–90d) | Per-platform RoG, 30/90/180d forecasts, cross-platform score |
| `demand.scorer` | Platform metrics + past concerts + target city/date | Composite 0–100 demand score |
| `revenue.predictor` | Concert details + platform metrics (+ optional demand score) | Predicted revenue with confidence interval + SHAP importances |
| `popularity.calculator` | Platform history across social/video channels or backend artist snapshot | Entropy-weighted artist popularity score + platform weights |

## Setup

```bash
pip install -r mad_analytics/requirements.txt
```

## Running the FastAPI server

```bash
uvicorn mad_analytics.server:app --port 8001 --reload
```

API docs available at `http://localhost:8001/docs`

If you call `POST /popularity` with just `artist_id` and no `platform_metrics`, the service will fetch current snapshot data from the backend `artists` table using the `DATABASE_URL` environment variable.

You can also compute popularity for all active artists with:

```http
GET /popularity/all
```

This returns a list of popularity scores generated from the backend artist snapshots.

To persist the latest batch into the analytics database and make it available for later reads, call:

```http
POST /popularity/all/save
```

You can then retrieve the saved scores with:

```http
GET /popularity/saved
```

## Express integration

```typescript
// services/analytics.ts
const ANALYTICS_URL = process.env.ANALYTICS_URL ?? 'http://localhost:8001';

export async function getRevenuePrediction(payload: RevenuePayload) {
  const res = await fetch(`${ANALYTICS_URL}/revenue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Analytics error: ${res.status}`);
  return res.json();
}

export async function getGrowthForecast(artistId: string, metrics: MetricRow[]) {
  const res = await fetch(`${ANALYTICS_URL}/growth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artist_id: artistId, metrics }),
  });
  return res.json();
}

export async function getDemandScore(payload: DemandPayload) {
  const res = await fetch(`${ANALYTICS_URL}/demand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}
```

## Training the revenue model

Once you have 6+ months of concert data:

```bash
python -m mad_analytics.training.train_revenue \
  --db postgresql://user:pass@localhost/mad_db
```

Or using a CSV export:

```bash
python -m mad_analytics.training.train_revenue --csv exports/concerts.csv
```

Artifacts are saved to `mad_analytics/models/`.

## Running tests

```bash
pytest mad_analytics/tests/ -v
```

## Revenue model — cold start behaviour

If `models/revenue_model.joblib` does not exist (e.g. in development),
the predictor falls back to a rule-based heuristic:

```
predicted = venue_capacity × avg_ticket_price × sell_through_rate
sell_through_rate = 0.50 + (demand_score / 100) × 0.40   # 50–90%
```

This produces reasonable ballpark figures until the ML model is trained.

## Data flow

```
PostgreSQL
  └── PlatformMetrics ──→ growth.rog_calculator ──→ GrowthOutput
  └── PlatformMetrics ──→ demand.scorer ──────────→ DemandOutput
  └── Concerts + above ─→ revenue.predictor ──────→ RevenueOutput
                                                        ↑
                                              demand score auto-fed
                                              from demand.scorer if
                                              not pre-computed
```

## Adding docker-compose service

```yaml
# Add to your existing docker-compose.yml
analytics:
  build:
    context: .
    dockerfile: Dockerfile.analytics
  command: uvicorn mad_analytics.server:app --host 0.0.0.0 --port 8001
  ports:
    - "8001:8001"
  environment:
    - DATABASE_URL=postgresql://postgres:password@db:5432/mad_db
    - MAD_MODELS_DIR=/app/models
  volumes:
    - ./mad_analytics/models:/app/models
  depends_on:
    - db
```