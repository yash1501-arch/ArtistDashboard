# How to Run — MAD (Music Artist Dashboard)

## Prerequisites

- **Node.js** v18+ (with npm)
- **Python** 3.11+ (with pip)
- **Redis** (optional — app works without it, caching disabled)
- **PostgreSQL** database (already configured via Prisma)

## Quick Start

### 1. Install Dependencies

```bash
# Frontend + root dependencies
npm install

# Backend dependencies
cd backend && npm install && cd ..

# Python ML dependencies
pip install -r mad_analytics/requirements.txt
```

### 2. Environment Setup

The backend `.env` file is already configured. If starting fresh, copy from template:

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your DATABASE_URL, JWT secrets, Redis config
```

### 3. Google Search API (Optional — for venue capacity web search)

The venue capacity resolver can use Google Custom Search to find real venue capacities from the web.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Custom Search API**
3. Create an API key
4. Go to [Programmable Search Engine](https://programmablesearchengine.google.com/) and create a search engine (search the entire web)
5. Set these environment variables before starting the Python analytics server:

```bash
set GOOGLE_SEARCH_API_KEY=your-api-key-here
set GOOGLE_SEARCH_CX=your-search-engine-id-here
```

Without these keys, the system falls back to heuristic estimation (still works, just less accurate for unknown venues).

### 4. Database Setup

```bash
cd backend
npx prisma generate    # Generate Prisma client
npx prisma db push     # Sync schema to database
cd ..
```

### 4. Train the ML Model

```bash
# Set your database URL
set DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Train revenue prediction model
python -m mad_analytics.training.train_revenue --db %DATABASE_URL%

# Compute and store artist popularity scores
python -m mad_analytics.training.update_artist_popularity --db %DATABASE_URL%

# Enrich venue capacities (optional)
python -m mad_analytics.training.enrich_venues --db %DATABASE_URL%
```

### 5. Start All Services

Open **3 terminals**:

**Terminal 1 — Python ML Analytics Server (port 8001):**
```bash
python -m uvicorn mad_analytics.server:app --port 8001
```

**Terminal 2 — Full Stack (Frontend + Backend):**
```bash
npm run dev
```

This starts:
- Frontend (Vite) → http://localhost:5173
- Backend (Express) → http://localhost:3001

**Or start individually:**
```bash
# Frontend only
npm run dev:frontend

# Backend only
cd backend && npm run dev
```

### 6. Access the App

- **URL**: http://localhost:5173
- **Login**: `admin@mad.com` / `admin123`
- **Viewer**: `viewer@mad.com` / `viewer123`

---

## Services Overview

| Service | Port | Tech | Purpose |
|---------|------|------|---------|
| Frontend | 5173 | React + Vite | Dashboard UI |
| Backend API | 3001 | Express + TypeScript | REST API, auth, data |
| ML Analytics | 8001 | FastAPI + Python | ML predictions |
| PostgreSQL | 5432 | Prisma-hosted | Database |
| Redis | 14147 | Redis Cloud | Caching (optional) |

---

## ML Model Training Commands

```bash
# Revenue prediction model (GradientBoosting)
python -m mad_analytics.training.train_revenue --db $DATABASE_URL

# Artist popularity scores (entropy-weighted)
python -m mad_analytics.training.update_artist_popularity --db $DATABASE_URL

# Venue capacity enrichment
python -m mad_analytics.training.enrich_venues --db $DATABASE_URL

# Dry run venue enrichment (preview only)
python -m mad_analytics.training.enrich_venues --db $DATABASE_URL --dry-run
```

---

## API Endpoints (ML Analytics)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/analytics/ml/revenue` | POST | Revenue prediction |
| `/api/v1/analytics/ml/llm-predict` | POST | Heuristic pricing/sales |
| `/api/v1/analytics/ml/growth` | POST | Growth forecast |
| `/api/v1/analytics/ml/demand` | POST | Demand scoring |
| `/api/v1/analytics/ml/popularity` | POST | Popularity score |
| `/api/v1/analytics/ml/venue-capacity` | POST | Venue capacity resolution |

---

## Running Tests

```bash
# Python ML tests (40 tests)
python -m pytest mad_analytics/tests/ -v

# Backend TypeScript tests
cd backend && npm test
```

---

## Project Structure

```
ArtistDashboard/
├── src/                    # React frontend
├── backend/                # Express + TypeScript API
│   ├── src/               # Backend source
│   ├── prisma/            # Database schema
│   └── ml_engine/         # Legacy heuristic model
├── mad_analytics/          # Python ML engine
│   ├── demand/            # Demand scoring
│   ├── growth/            # Growth forecasting
│   ├── popularity/        # Popularity calculator
│   ├── revenue/           # Revenue prediction
│   ├── venue_capacity/    # Venue capacity resolver
│   ├── training/          # Model training scripts
│   ├── models/            # Trained model artifacts
│   └── server.py          # FastAPI server
└── HOW_TO_RUN.md          # This file
```

---

## Troubleshooting

**"Can't reach database server"**
- Ensure `DATABASE_URL` in `backend/.env` uses `postgresql://` (not `postgres://`)

**Frontend parse errors**
- Run `npm run dev:frontend` and check for syntax errors in the console
- Ensure no git merge conflict markers (`<<<<<<<`) remain in source files

**ML Analytics not responding**
- Ensure the Python server is running on port 8001
- Check: `curl http://localhost:8001/health`

**Port already in use**
- Kill existing processes: `Get-Process -Name "node","python" | Stop-Process -Force`
- Or find what's using the port: `netstat -ano | findstr :8001`
