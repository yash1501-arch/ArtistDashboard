# Music Artist Dashboard (MAD) - Repository Context

Here is a comprehensive overview of the **Music Artist Dashboard (MAD)** repository, detailing its project structure, technology stack, and core architecture.

## 🏢 System Architecture Overview

The application is a full-stack dashboard designed for tracking artist performance, concert analytics, and platform metrics. It operates on a client-server architecture:
- **Frontend (Client):** A Single Page Application (SPA) built with React and Vite.
- **Backend (API):** A RESTful Node.js/Express service.
- **Database:** PostgreSQL managed via Prisma ORM.
- **Caching & Async:** Redis is used for caching, and n8n handles background data ingestion workflows.

## 🛠️ Technology Stack

**Frontend:**
- **Framework:** React 19 (Vite tooling)
- **State Management:** Zustand (Global State), React Query (Data Fetching/Caching)
- **Routing:** React Router DOM v7
- **Styling:** Tailwind CSS, clsx, tailwind-merge
- **Data Visualization:** Recharts, D3
- **Mapping:** Leaflet, React Leaflet

**Backend:**
- **Runtime & Framework:** Node.js 20, Express 5, TypeScript
- **Database & ORM:** PostgreSQL 16+, Prisma ORM
- **Caching:** Redis (ioredis)
- **Authentication:** JWT (JSON Web Tokens), bcryptjs
- **Data Ingestion/Automation:** n8n (workflows included via JSON templates)
- **Validation:** Zod
- **Testing:** Jest, Supertest

## 📂 Repository Structure

The project is structured as a monorepo with the backend nested inside the main directory. 

```text
d:\Projects\Dashboard-main\
├── .gitignore
├── package.json              # Root package (manages frontend + concurrent dev scripts)
├── vite.config.js            # Vite configuration for React
├── tailwind.config.js        # Tailwind styling configuration
├── src/                      # ➡️ FRONTEND SOURCE
│   ├── api/                  # API client configuration (Axios)
│   ├── components/           # Reusable UI components
│   │   ├── charts/           # Recharts wrappers (BarChart, LineChart, etc.)
│   │   ├── layout/           # AppShell, Sidebar, Topbar
│   │   └── ui/               # Cards, Modals, Badges
│   ├── hooks/                # Custom React hooks (useArtists, useConcerts, etc.)
│   ├── pages/                # Route views (Dashboard, Artists, ConcertDetail, etc.)
│   ├── store/                # Zustand stores (useAuthStore, useFilterStore)
│   └── utils/                # Formatters, mock data, CSV export
│
└── backend/                  # ➡️ BACKEND SOURCE
    ├── package.json          # Backend dependencies and scripts
    ├── prisma/               # Database definitions
    │   ├── schema.prisma     # Core database models and relationships
    │   └── seed.ts           # Initial database seeding script
    ├── src/
    │   ├── controllers/      # Route handlers (Auth, Artist, Concert, Analytics)
    │   ├── middleware/       # Express middlewares (Auth, Error handling, Validation)
    │   ├── routes/           # Express router definitions
    │   ├── services/         # Business logic (ArtistEnrichment, ConcertPipeline)
    │   ├── utils/            # DB utilities
    │   ├── validations/      # Zod validation schemas
    │   └── server.ts         # Backend entry point
    ├── ingestion/
    │   └── n8n-workflows/    # n8n background jobs (YouTube, Spotify, Excel imports)
    ├── docker-compose.yml    # Docker setup for Postgres, Redis, n8n, and API
    └── Dockerfile            # API container image definition
```

## 🗄️ Database Data Model (Prisma)

The PostgreSQL database relies heavily on relational and timeseries concepts:
- **`Artist` & `Genre`**: Core entity storing artist metadata, socials, and linked genres.
- **`PlatformMetric`**: Time-series table tracking daily followers, streams, and engagements across various platforms (Spotify, YouTube, Instagram, etc.). Includes Rate of Growth (RoG) metrics.
- **`Concert` & `Venue`**: Tracks past and upcoming events, ticket pricing, capacities, and revenue.
- **`AudienceDemographic`**: Granular breakdowns of audiences by Age, Gender, Geography, and Genre.
- **`User` & `RefreshToken`**: Handles dashboard authentication and Role-Based Access Control (RBAC) separating `ADMIN` and `VIEWER` roles.
- **`PredictionModel` & `PredictionTrainingData`**: Infrastructure for future ML-based revenue and demand predictions.
- **`IngestionJob`**: Tracks the status of background sync tasks handled by n8n.

## ⚙️ Workflows & Operations

1. **Development Mode:** Running `npm run dev` in the root uses `concurrently` to spin up both the Vite frontend server and the `tsx`-based backend server simultaneously.
2. **Data Ingestion Pipeline:** Uses **n8n** (run via Docker). It executes periodic JSON workflows stored in `backend/ingestion/n8n-workflows/` to sync external data from social and streaming APIs directly into the PostgreSQL database.
3. **Security:** The backend enforces JWT validation on private routes, restricts CORS, utilizes `helmet` for security headers, and applies rate-limiting. Users receive 15-minute access tokens and HTTP-only refresh cookies.
