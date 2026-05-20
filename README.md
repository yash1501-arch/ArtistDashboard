# Music Artist Dashboard (MAD)

This repository contains the **Music Artist Dashboard (MAD)**, a full-stack analytics platform built for tracking music artist performance, social/streaming platform metrics, concert analytics, and predicting revenues using a Python-based Machine Learning (ML) engine.

## 🛠️ Technology Stack
*   **Frontend**: React 19, Vite, Zustand, React Query, Tailwind CSS, Recharts
*   **Backend**: Node.js 20, Express 5, TypeScript, Prisma ORM, Jest
*   **Database & Caching**: PostgreSQL 16, Redis 7
*   **Data Ingestion**: n8n Workflow Automation
*   **ML Engine**: Python, sentence-transformers, Custom Predictive Heuristics

---

## 🚀 Quick Start
To set up the project on your local system, please refer to our step-by-step setup guide:

👉 **[Local Setup & Onboarding Guide (SETUP_GUIDE.md)](./SETUP_GUIDE.md)**

### Short Summary of Commands
1.  **Install dependencies**:
    ```bash
    npm run install:all
    ```
2.  **Configure Environment**:
    Create `backend/.env` from `backend/.env.example` and set your credentials.
3.  **Start Services**:
    ```bash
    cd backend
    docker-compose up -d postgres redis n8n
    ```
4.  **Initialize Database**:
    ```bash
    cd backend
    npx prisma migrate dev --name init
    npm run db:seed
    ```
5.  **Setup ML Engine**:
    Create a Python virtual environment in `backend/ml_engine/`, activate it, run `pip install -r requirements.txt`, and update `PYTHON_PATH` in `backend/.env`.
6.  **Run Development Servers**:
    ```bash
    # From the project root
    npm run dev
    ```

---

## 🔐 Default Credentials & Port Mappings
For default account logins (Admin/Viewer), database configurations, and port mappings, please refer to the **[Default Credentials Section in the Setup Guide](./SETUP_GUIDE.md#default-credentials--port-mappings)**.

## 🧪 Running Tests
To run the 80+ test cases covering authorization, user management, and calculations:
```bash
cd backend
npm run test
```

For detailed details about the testing suite, check the **[Testing Guide (TESTING_GUIDE.md)](./TESTING_GUIDE.md)**.
