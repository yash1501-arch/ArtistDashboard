# Analysis Page — Complete Documentation

## What It Does

The Analysis page predicts **how much revenue a concert will generate** for a specific artist in a specific city. It combines 6 ML models to give a comprehensive prediction.

---

## How To Use

1. Select an **Artist** from the dropdown
2. Select a **City** from the dropdown
3. The system automatically calculates and displays:
   - Predicted Revenue (with confidence range)
   - Estimated Tickets Sold
   - Average Ticket Price
   - Growth Score
   - Demand Score
   - Popularity Score
   - LLM Revenue Estimate
   - Venue Capacity

---

## Architecture

```
User selects Artist + City
        ↓
Frontend fires 6 parallel API calls
        ↓
Backend (Express) resolves artist data from DB
        ↓
Python ML Service (FastAPI) computes predictions
        ↓
Results returned with local currency
        ↓
Frontend displays KPI cards
```

---

## The 6 Models

### 1. Revenue Prediction (Main Model)

#### Simple Explanation
"Based on the venue size, ticket price, artist popularity, and city demand — how much total money will this concert make?"

The ML model learned patterns from 165 real concerts. It knows that bigger venues with popular artists in high-demand cities make more money.

#### Advanced Explanation

**Model:** GradientBoostingRegressor (scikit-learn, 300 estimators)

**Final prediction formula:**
```
predicted_revenue = model_output × 0.55 + heuristic_output × 0.45
```

The blend ensures stability — if the ML model gives a weird answer, the heuristic keeps it grounded.

**Features (model inputs):**

| Feature | Type | How it's calculated |
|---------|------|-------------------|
| `venue_capacity` | Numeric | From known venues DB → SerpAPI web search → heuristic |
| `avg_ticket_price` | Numeric | `price_min + (price_max - price_min) × 0.235` |
| `price_range` | Numeric | `price_max - price_min` |
| `max_revenue_naive` | Numeric | `venue_capacity × avg_ticket_price` (theoretical max) |
| `is_weekend` | Binary | 1 if Fri/Sat/Sun, else 0 |
| `month` | Numeric | 1-12 |
| `season` | Categorical | winter/spring/summer/autumn |
| `city` | Categorical | One-hot encoded |
| `country` | Categorical | One-hot encoded |
| `artist_tier` | Categorical | micro/rising/mid/major/superstar |
| `demand_score` | Numeric | 0-100 from Demand model |
| `best_rog_30d` | Numeric | Best platform's 30-day growth rate |
| `cross_platform_score` | Numeric | 0-100 weighted growth across platforms |

**Preprocessing:**
- Numeric features: StandardScaler (zero mean, unit variance)
- Categorical features: OneHotEncoder (handle_unknown="ignore")

**Heuristic fallback:**
```
heuristic_revenue = venue_capacity × avg_ticket_price × sell_through_rate

sell_through_rate = clamp((0.25 + demand_factor × 0.5) × venue_factor, 0.15, 0.90)
demand_factor = (demand_score - 10) / 85
venue_factor = 1.3 (small) | 1.1 (medium) | 1.0 (large) | 0.8 (huge)
```

**Confidence interval:**
```
confidence = min(0.95, max(0.1, 1 - (upper - lower) / (2 × predicted)))
```
Where upper/lower come from the 90th/10th percentile of staged GradientBoosting predictions.

**Currency handling:**
- Model predicts in training currency (local prices × capacity)
- Response includes: `predicted_revenue` (local), `predicted_revenue_usd`, `currency`, `exchange_rate`

---

### 2. Growth Forecast

#### Simple Explanation
"Is this artist getting more or less popular right now? How fast are they growing on Spotify, YouTube, Instagram?"

A rising artist will sell more tickets than a declining one, even if they have the same follower count today.

#### Advanced Explanation

**Rate of Growth (RoG):**
```
rog = (current_value - value_N_days_ago) / value_N_days_ago × 100%
```
Calculated at 7-day, 30-day, and 90-day windows.

**Exponential Smoothing (noise reduction):**
```
smoothed[t] = α × value[t] + (1-α) × smoothed[t-1]
α = 0.3
```

**Holt Linear Trend Forecast (30/90/180 days ahead):**
```
level[t] = α × value[t] + (1-α) × (level[t-1] + trend[t-1])
trend[t] = β × (level[t] - level[t-1]) + (1-β) × trend[t-1]
forecast[t+h] = level[t] + h × trend[t]
```

**Cross-Platform Score (0-100):**
```
For each platform:
    score = 50 + 50 × tanh(rog_30d / 20)

cross_platform = Σ(score × platform_weight) / Σ(weights)
```

Platform weights: Spotify 25%, YouTube 20%, Instagram 20%, Apple Music 15%, Twitter 10%, Facebook 10%

**Trend classification:**
- rog_30d > 5% OR rog_90d > 10% → "Rising"
- rog_30d < -5% OR rog_90d < -10% → "Declining"
- Otherwise → "Stable"

**Anomaly detection:**
```
z_score = |last_residual| / std(residuals)
anomaly = z_score > 3.0
```

---

### 3. Demand Score

#### Simple Explanation
"How badly do people want to see this artist in this city right now?"

It looks at 4 things: Is the artist trending? Did their recent shows sell well? Is it a good time of year? Have they played here recently?

#### Advanced Explanation

**Composite formula:**
```
demand_score = (SV×0.40 + TV×0.30 + SF×0.20 + RV×0.10) × 100
```
Clamped to [0, 100].

**Social Velocity (SV) — 40% weight:**
```
total_growth = Σ(latest - earliest) for each platform over last 14 days
SV = min(1.0, log(1 + total_growth) / log(1 + 1,000,000))
```
Measures how fast followers/streams are growing right now.

**Ticket Velocity (TV) — 30% weight:**
```
TV = mean(tickets_sold / venue_capacity) for concerts in last 90 days
```
If recent shows sold 90% → TV = 0.9. If they sold 50% → TV = 0.5.

**Seasonality Factor (SF) — 20% weight:**
```
SF = month_weight + weekend_bonus
weekend_bonus = 0.1 if Fri/Sat/Sun else 0
```
Month weights: Aug=1.0 (peak), Feb=0.5 (lowest), Jun-Jul=0.9-0.95

**Recency (RV) — 10% weight:**
```
if never played in city → 0.7 (novelty)
if played < 30 days ago → 0.2 (fatigue)
if played 30-90 days ago → 0.5
if played 90-180 days ago → 0.8
if played > 180 days ago → 0.9 (anticipation)
```

---

### 4. Artist Popularity

#### Simple Explanation
"How popular is this artist compared to all other artists in our database?"

It looks at Spotify, YouTube, Instagram, Facebook, and Twitter — and figures out which platforms matter most for differentiating popular vs. unpopular artists.

#### Advanced Explanation

**Entropy-weighted scoring across 5 platforms.**

**Step 1 — Log transform:** `log(1 + raw_value)` compresses scale

**Step 2 — Normalize:** Divide by max across all artists (0-1 scale)

**Step 3 — Entropy weights:**
```
For each platform column:
    probabilities = normalized_column / column_sum
    entropy = -(1/log(N)) × Σ(p × log(p))
    diversification = max(0, 1 - entropy)

weight[platform] = diversification / Σ(all diversifications)
```
Platforms with more variance between artists get higher weight.

**Step 4 — Final score:**
```
score = 5 + 95 × Σ(normalized_value × weight)
```

---

### 5. LLM Pricing Predictor

#### Simple Explanation
"What should tickets cost, and how many will sell?"

Uses the artist's popularity, city market size, and venue type to estimate dynamic pricing tiers (VIP, Premium, Standard, Economy) and predict ticket sales.

#### Advanced Explanation

**Dynamic pricing tiers:**
```
base_price = max(500, (800 + popularity×12 + city_pop×8) × market_mult × scarcity_mult × venue_mult)

VIP     = base × 4.5  (10% of audience)
Tier 1  = base × 2.2  (20% of audience)
Tier 2  = base × 1.0  (40% of audience)
Tier 3  = base × 0.5  (30% of audience)

weighted_avg = VIP×0.10 + T1×0.20 + T2×0.40 + T3×0.30
```

**Market multiplier:** City-specific boost (Mumbai +40%, NYC +50%, London +45%)

**Scarcity multiplier:** Small venues (<500) = 1.3×, Large (>30K) = 0.75×

**Venue type multiplier:** Festival 1.6×, Stadium 1.4×, Arena 1.2×, Club 0.7×

**Sales prediction:**
```
demand_score = clamp(city_pop×0.65 + artist_pop×0.25 + city_boost×0.3, 10, 95)
sell_through = clamp((0.25 + (demand-10)/85 × 0.5) × venue_factor, 0.15, 0.90)
tickets_sold = min(capacity × sell_through, capacity)
revenue = tickets_sold × weighted_avg_price
```

---

### 6. Venue Capacity Resolver

#### Simple Explanation
"How many people does this venue hold?"

Checks our curated database of 120+ verified venues first. If not found, searches Google. If that fails, estimates from the venue name (stadium = ~40K, arena = ~15K, club = ~700).

#### Advanced Explanation

**Resolution priority chain:**
```
1. Known Venues DB (curated, 120+ venues)     → confidence 0.98
2. Supplied capacity (user input)              → confidence 0.95
3. Source text extraction (regex)              → confidence 0.70-0.90
4. Venue DB table (previously stored)          → confidence 0.84-0.96
5. SerpAPI web search (Google)                 → confidence 0.78-0.92
6. Heuristic estimate (venue type + city tier) → confidence 0.35-0.82
```

**Heuristic formula:**
```
capacity = venue_type_base × city_tier_multiplier × artist_tier_multiplier

city_tier: Tier 1 = 1.0, Tier 2 = 0.72, Tier 3 = 0.45
artist_tier: superstar = 1.45, major = 1.15, mid = 0.9, rising = 0.72, micro = 0.45
```

**Validation rules:**
- If tickets_sold > capacity → capacity is wrong, fix it
- If sell-through < 20% on predicted data → recalculate using popularity
- Known venues DB always wins over web search or heuristic

---

## Sell-Through Prediction (used for empty concerts)

#### Simple Explanation
"What percentage of seats will be filled?"

More popular artists fill more seats. Taylor Swift fills 95%, a mid-tier artist fills 65%, a small artist fills 35%.

#### Advanced Explanation
```
sell_through = min(0.95, max(0.30, 0.30 + (popularity / 100) × 0.65))
```

| Popularity | Sell-Through | Example |
|:---:|:---:|---|
| 100 | 95% | Taylor Swift |
| 90 | 89% | Drake, A.R. Rahman |
| 80 | 82% | Diljit Dosanjh |
| 60 | 69% | Anuv Jain, Javed Ali |
| 40 | 56% | Mid-tier artist |
| 20 | 43% | Rising artist |
| 0 | 30% | Unknown artist |

---

## Currency Handling

#### Simple Explanation
Revenue is shown in the concert's local currency. Indian concerts show ₹, US concerts show $, UK shows £.

#### Advanced Explanation
```
Country → Currency resolution:
  India → INR, USA → USD, UK → GBP, Australia → AUD,
  Canada → CAD, UAE → AED, Germany/France → EUR

Response includes:
  predicted_revenue      → local currency amount
  predicted_revenue_usd  → USD equivalent (for comparison)
  currency               → "INR" / "USD" / "GBP" etc.
  exchange_rate          → USD → local rate
```

---

## Self-Learning Pipeline

The model improves automatically every 24 hours:

```
New concerts scraped (every 12h)
    ↓
Venues validated (known DB → web search)
    ↓
Tickets/revenue predicted for empty concerts
    ↓
Data validated (no oversold, revenue consistent)
    ↓
Model retrained on ALL data (every 24h)
    ↓
Better predictions next time
```

**Training data growth:**
- Started with 49 concerts
- Now has 165 concerts
- Grows by ~10-20 concerts per scrape cycle
- More data = better model = more accurate predictions

---

## API Endpoints

| Endpoint | Method | Input | Output |
|----------|--------|-------|--------|
| `/analytics/ml/revenue` | POST | artist_name, city, country | predicted_revenue, confidence, bounds, currency |
| `/analytics/ml/growth` | POST | artist_id | cross_platform_score, per-platform RoG, forecasts |
| `/analytics/ml/demand` | POST | artist_id, city, country, target_date | score (0-100), components breakdown |
| `/analytics/ml/popularity` | POST | artist_id | popularity_score, platform_weights |
| `/analytics/ml/llm-predict` | POST | artist_name, city, venue_capacity | pricing_tiers, tickets_sold, revenue |
| `/analytics/ml/venue-capacity` | POST | venue_name, city, country | capacity, confidence, source |
