# 🚀 Getting Started - MAD Backend

**Status**: Backend scaffolding COMPLETE ✅ | Docker: Pending installation

---

## 📋 Quick Checklist

### Before You Begin
- [ ] Docker Desktop installed and running
- [ ] Docker Desktop → Settings → Resources → CPU: 4+, Memory: 8GB+ recommended

---

## Step-by-Step Setup

### 1️⃣ Verify Docker Installation
```bash
docker --version
docker compose version
docker run hello-world  # Should download and print hello message
```

---

### 2️⃣ Start All Services
```bash
cd C:\Projects\mad-backend
docker-compose up -d
```

**Watch the logs:**
```bash
docker-compose logs -f
```

Wait until all services show "healthy" or "running":
- ✅ `mad-postgres` (PostgreSQL 16)
- ✅ `mad-redis` (Redis 7)
- ✅ `mad-n8n` (Workflow automation)
- ✅ `mad-api` (Node.js backend)

---

### 3️⃣ Initialize Database
```bash
# Run Prisma migrations (creates all tables)
docker-compose exec api npx prisma migrate dev --name init

# You should see:
# ✅ Migration `init` applied successfully
# ✅ Prisma Client generated
```

If you get an error about database not ready, wait 10 seconds and retry.

---

### 4️⃣ Seed Sample Data
```bash
docker-compose exec api npm run db:seed
```

**Expected output:**
```
🌱 Starting database seed...
✅ Admin user created: admin@mad.com
✅ Viewer user created: viewer@mad.com
✅ Sample genres created
✅ Sample artists created: Arijit Singh, The Local Train
✅ Sample concert created
🎉 Database seeded successfully!
```

---

### 5️⃣ Test API Health
```bash
curl http://localhost:3001/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-27T...",
  "uptime": 12.45,
  "environment": "development"
}
```

If this works, your API is running! 🎉

---

### 6️⃣ Test Authentication
```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mad.com","password":"admin123"}'
```

**Expected response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "user": {
      "id": "cl...",
      "email": "admin@mad.com",
      "role": "ADMIN"
    }
  }
}
```

✅ **Copy the `accessToken`** - you'll need it for authenticated requests.

---

### 7️⃣ Test an Authenticated Endpoint
```bash
# Replace YOUR_ACCESS_TOKEN with the token from step 6
curl http://localhost:3001/api/v1/artists \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected:** JSON with artists list (initially just sample artists, later will be populated by n8n)

---

### 8️⃣ Setup n8n Workflows
1. Open browser → **http://localhost:5678**
2. Login:
   - Username: `admin`
   - Password: `n8nadmin123`
3. Click **"Workflows"** in left sidebar
4. Click **"Import from file"**
5. Navigate to: `C:\Projects\mad-backend\ingestion\n8n-workflows\`
6. Import each `.json` file (YouTube, Instagram, Spotify, Excel, Generic)
7. For each workflow:
   - Click **PostgreSQL node** → Verify connection settings:
     ```
     Host: postgres
     Port: 5432
     Database: mad
     User: postgres
     Password: postgres123
     ```
   - Click **"Test Connection"** → Should succeed ✅
   - Click **Save**
8. Test YouTube workflow:
   - Click **"Execute Workflow"** (play button)
   - Each node should show green checkmark ✅
   - Check database: should see new platform_metrics records
9. Activate scheduled workflows:
   - Click on Schedule Trigger node
   - Verify cron expression (e.g., `0 2 * * *` = daily 2 AM)
   - Toggle **"Active"** switch ON

---

## 🎯 API Reference (Most Used)

### Authentication
```
POST /api/v1/auth/login          # Login
POST /api/v1/auth/refresh        # Refresh token (cookie-based)
POST /api/v1/auth/logout         # Logout (clears cookie)
GET  /api/v1/auth/me             # Get current user
```

### Artists
```
GET    /api/v1/artists                     # List (query: page, limit, search, genre)
GET    /api/v1/artists/:id                 # Details
GET    /api/v1/artists/:id/metrics        # Platform metrics
GET    /api/v1/artists/:id/concerts       # Concerts
GET    /api/v1/artists/:id/demographics  # Demographics
POST   /api/v1/artists                     # Create (admin)
PUT    /api/v1/artists/:id                 # Update (admin)
DELETE /api/v1/artists/:id                 # Delete (admin)
```

### Concerts
```
GET    /api/v1/concerts                    # List (filters: artistId, city, date range)
GET    /api/v1/concerts/:id                # Details
GET    /api/v1/concerts/cities             # City aggregations
GET    /api/v1/concerts/venues             # Venue aggregations
POST   /api/v1/concerts                    # Create (admin)
PUT    /api/v1/concerts/:id                # Update (admin)
```

### Dashboard
```
GET /api/v1/dashboard/kpis           # KPI summary (total artists, concerts, revenue, avg RoG, top artist)
GET /api/v1/dashboard/top-artists   # Top artists by followers
```

### Analytics
```
GET /api/v1/analytics/rog                    # Rate of Growth (query: artistId, platform, period)
GET /api/v1/analytics/trends                 # Time-series data (metric: followers/streams/likes)
GET /api/v1/analytics/demographics/age      # Age breakdown
GET /api/v1/analytics/demographics/gender   # Gender breakdown
GET /api/v1/analytics/demographics/geo      # Geo data for map
GET /api/v1/analytics/genres                # Genre popularity
```

### Ingestion (Admin)
```
POST /api/v1/ingestion/sync/:platform     # Trigger manual sync (youtube, instagram, etc.)
POST /api/v1/ingestion/rog/recalculate    # Recalculate RoG
```

---

## 🔐 Default Credentials

### MAD API Users
| Role | Email | Password | Access |
|------|-------|----------|--------|
| Admin | admin@mad.com | admin123 | Full CRUD + ingestion |
| Viewer | viewer@mad.com | viewer123 | Read-only |

**JWT**: 15-minute access token + 7-day refresh token (HTTP-only cookie)

### n8n UI
- Username: `admin`
- Password: `n8nadmin123`
- URL: http://localhost:5678

### PostgreSQL
- Host: localhost:5432
- Database: `mad`
- Username: `postgres`
- Password: `postgres123`

### Redis
- Host: localhost:6379
- No auth (development only)

---

## 🛠️ Useful Docker Commands

```bash
# View logs for all services
docker-compose logs -f

# View logs for specific service
docker-compose logs -f api
docker-compose logs -f postgres
docker-compose logs -f n8n

# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes all data!)
docker-compose down -v

# Restart a single service
docker-compose restart api

# Execute command in API container
docker-compose exec api npm run build

# View running containers
docker ps

# View all containers (including stopped)
docker ps -a

# Backup database
docker-compose exec postgres pg_dump -U postgres mad > backup.sql

# Restore database
docker-compose exec -T postgres psql -U postgres mad < backup.sql
```

---

## 🧪 Testing the Data Flow

### Complete Flow Test:

1. **Create an artist** (admin):
```bash
curl -X POST http://localhost:3001/api/v1/artists \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Artist",
    "nationality": "India",
    "bio": "Test bio",
    "genreIds": [1]
  }'
```
Copy the `id` from response.

2. **Manually add a metric** (admin - Excel upload later in n8n):
```bash
curl -X POST http://localhost:3001/api/v1/ingestion/sync/youtube \
  -H "Authorization: Bearer YOUR_TOKEN"
```
*(This would trigger n8n - for now you can add directly via Prisma Studio)*

3. **View Prisma Studio** (database GUI):
```bash
docker-compose exec api npx prisma studio
```
Open http://localhost:5555 in browser to see and edit data.

4. **Check artist metrics**:
```bash
curl http://localhost:3001/api/v1/artists/ARTIST_ID/metrics \
  -H "Authorization: Bearer YOUR_TOKEN"
```

5. **View dashboard KPIs**:
```bash
curl http://localhost:3001/api/v1/dashboard/kpis \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🐛 Troubleshooting

### Port already in use
```bash
# PostgreSQL port 5432 conflict
netstat -ano | findstr :5432
# Kill process or change docker-compose.yml port mapping

# Same for Redis (6379), n8n (5678), API (3001)
```

### Database connection refused
```bash
# Check if postgres container is healthy
docker-compose ps
# Wait 10-20 seconds after "up" for postgres to be ready
docker-compose logs postgres

# Restart if needed
docker-compose restart postgres
```

### n8n can't connect to PostgreSQL
- Verify `postgres` hostname (not `localhost`) in n8n PostgreSQL node
- Check credentials: `postgres` / `postgres123`
- Test connection from inside n8n container:
  ```bash
  docker-compose exec n8n ping postgres
  ```

### Prisma migrate fails
```bash
# Reset everything (WARNING: deletes data)
docker-compose down -v
docker-compose up -d postgres
# Wait 10 seconds
docker-compose exec api npx prisma migrate dev --name init
docker-compose exec api npm run db:seed
```

### Token expired
- Login again to get fresh token
- Or use refresh endpoint: `POST /api/v1/auth/refresh` (cookie-based)

---

## 📚 Documentation

- **Backend README**: `C:\Projects\mad-backend\README.md`
- **n8n Workflows Guide**: `C:\Projects\mad-backend\ingestion\n8n-workflows\README.md`
- **System Design**: `C:\Projects\madDetails\SYSTEM_DESIGN_AND_ARCHITECTURE.md`
- **Project Memory**: `C:\Projects\madDetails\PROJECT_MEMORY.md`
- **Prisma Docs**: https://www.prisma.io/docs
- **n8n Docs**: https://docs.n8n.io/

---

## ✅ Success Checklist

After completing all steps above, you should have:

- [x] Docker Desktop running
- [x] All 4 containers up and healthy (`docker-compose ps`)
- [x] Database migrated (`artists`, `concerts`, `platform_metrics`, etc. tables exist)
- [x] Sample data seeded (admin user, sample artists)
- [x] Health endpoint returns `{"status":"healthy"}`
- [x] Login successful with admin@mad.com / admin123
- [x] Authenticated API calls work (GET /artists returns data)
- [x] n8n accessible at http://localhost:5678
- [x] n8n workflows imported and tested
- [x] PostgreSQL node in n8n connected successfully
- [x] n8n workflow can insert data into database

---

## 🎊 You're Ready!

Once all ✅ above are checked, your backend is fully operational and ready to connect to the React frontend at `C:\Projects\mad\`.

**Next**: Update frontend `.env` to point to `http://localhost:3001/api/v1` and start developing!

---

**Need help?** Check the logs first:
```bash
docker-compose logs -f [service-name]
```

Good luck! 🚀
