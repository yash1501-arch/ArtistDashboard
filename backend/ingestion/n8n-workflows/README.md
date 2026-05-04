# n8n Ingestion Workflows

This directory contains n8n workflow templates for the MAD platform data ingestion.

## 📦 Workflows Included

### 1. YouTube Daily Sync (`youtube-sync.json`)
- **Trigger**: Cron daily at 2:00 AM
- **Action**: Calls YouTube Data API to fetch channel statistics and video metrics
- **Transformation**: Maps YouTube API response to platform_metrics table format
- **Database**: Upserts to PostgreSQL `platform_metrics` table
- **Post-processing**: Triggers RoG recalculation via MAD API webhook

### 2. Instagram Daily Sync (`instagram-sync.json`)
- **Trigger**: Cron daily at 2:30 AM
- **Action**: Calls Instagram Basic Display API or Graph API
- **Transformation**: JavaScript Function node to extract followers, likes, comments
- **Database**: UPSERT to PostgreSQL
- **Error handling**: Sends Slack/email notification on failure

### 3. Spotify Daily Sync (`spotify-sync.json`)
- **Trigger**: Cron daily at 3:00 AM
- **Action**: Spotify Web API - artist and track analytics
- **Database**: PostgreSQL upsert
- **Post-processing**: Invalidates Redis cache for affected artist

### 4. Excel Import Trigger (`excel-import.json`)
- **Trigger**: Webhook POST from MAD admin panel
- **Action**: Reads uploaded Excel file (.xlsx)
- **Transformation**: Split In Batches node (100 rows/chunk)
- **Database**: Batch insert/update platform_metrics, concerts, demographics
- **Post-processing**: Triggers RoG recalculation

### 5. Generic HTTP Sync (`generic-http-sync.json`)
- **Trigger**: Manual or scheduled
- **Action**: Generic HTTP Request node with customizable endpoint and JSON path
- **Use case**: Connectors for Reddit, Quora, Facebook, Twitter, or any custom API

---

## 🚀 Setup Instructions

### 1. Start n8n Container
```bash
cd C:\Projects\mad-backend
docker-compose up -d n8n
```

### 2. Access n8n UI
- URL: http://localhost:5678
- Username: `admin`
- Password: `n8nadmin123` (from docker-compose.yml)

### 3. Import Workflows
1. Click "Workflows" in left sidebar
2. Click "Import from file"
3. Select a `.json` workflow file from this directory
4. Click "Import"
5. Workflow will appear in workflow list

### 4. Configure PostgreSQL Connection
For each workflow:
1. Click on the "PostgreSQL" node
2. Verify connection settings:
   - Host: `postgres` (Docker service name) or `localhost` if running outside Docker
   - Port: `5432`
   - Database: `mad`
   - Username: `postgres`
   - Password: `postgres123` (from docker-compose.yml)
3. Click "Test Connection" - should succeed

### 5. Test Workflow
1. Click "Execute Workflow" button
2. Check each node's output in the visual editor
3. Verify database rows are inserted/updated
4. Check MAD API returns updated data

### 6. Activate Scheduling
For sync workflows:
1. Click the "Schedule Trigger" node (cron node)
2. Verify cron expression (e.g., `0 2 * * *` for daily 2 AM)
3. Save workflow
4. Toggle "Active" switch to enable

---

## 🔧 Customizing Workflows

### Change Schedule
Edit the Cron node:
- `0 2 * * *` = Daily at 2:00 AM
- `0 */3 * * *` = Every 3 hours
- `0 0 * * *` = Daily at midnight

### Add New Platform Connector
1. Duplicate `generic-http-sync.json`
2. Rename (e.g., `tiktok-sync.json`)
3. Modify HTTP Request node:
   - URL: TikTok API endpoint
   - Method: GET
   - Headers: Authorization, Content-Type
   - Authentication: OAuth2, Bearer Token, etc.
4. Update "Function" node to transform TikTok response → platform_metrics format
5. Update PostgreSQL node with correct table/field mappings
6. Test and activate

### Add Recipients for Error Notifications
In workflow settings, add a "Webhook" or "Email" node connected to error branch:
- Send to admin email
- Slack webhook
- Discord/Telegram

---

## 🔐 API Credentials

Store credentials in n8n credentials:
1. Go to "Credentials" in left sidebar
2. Click "+ New"
3. Select credential type (e.g., "HTTP Request", "Google API", "Instagram")
4. Enter API key/secret/access token
5. Name it (e.g., "YouTube API Key")
6. Save

Then in nodes, select the credential from dropdown.

**Required API keys** (client must provide):
- YouTube Data API v3 (with quota)
- Instagram Basic Display / Graph API
- Spotify Web API (client credentials flow)
- Optional: Twitter/X API v2, Reddit API, Quora API

---

## 🧪 Testing Workflows

### Manual Execution
1. Open workflow
2. Click "Execute Workflow" (play button)
3. Each node shows:
   - ✅ Green check: success
   - 🔴 Red X: failure - click to see error
   - ⏳ In progress

### Check Database
```sql
-- After a YouTube sync runs:
SELECT * FROM platform_metrics
WHERE platform = 'YOUTUBE'
ORDER BY metric_date DESC
LIMIT 10;
```

### Check Execution History
- Click "Executions" in left nav
- See all workflow runs with timestamps, status, duration
- Click any execution to debug

---

## 🐛 Troubleshooting

### n8n can't connect to PostgreSQL
- Check `docker-compose.yml` - n8n service should depend on postgres
- Verify credentials in PostgreSQL node
- In n8n container, can `ping postgres`
- Use `postgres` as hostname (Docker network), not `localhost`

### API rate limits exceeded
- Add "Wait" node between API calls if rate-limited
- Reduce batch size
- Increase quota/apply for higher tier

### Missing data after import
- Check Function node transformation logic
- Verify column names match `platform_metrics` schema
- Check logs for JSON parsing errors

### Webhook not triggering
- In n8n, webhook URL is: `http://localhost:5678/webhook/your-webhook-id`
- In MAD backend, POST to that URL with Excel file
- Check "Webhook" node in n8n to see received payload

---

## 📊 Database Schema Reference

### platform_metrics table
```sql
id (UUID)
artist_id (UUID) - must reference existing artist
platform (ENUM: FACEBOOK, INSTAGRAM, TWITTER, YOUTUBE, SPOTIFY, APPLE_MUSIC, REDDIT, QUORA)
metric_date (DATE)
followers (BIGINT)
likes (BIGINT)
shares (BIGINT)
comments (BIGINT)
streams (BIGINT)
rog_daily, rog_weekly, rog_monthly (DECIMAL)
source = 'API'
raw_snapshot (JSONB)
```

### Required Pre-conditions
Before running workflows:
1. Artists must exist in database with `id`
2. Platform enum values must match exactly (uppercase)
3. Date format: YYYY-MM-DD

---

## 🎯 Production Deployment

When moving to production:

1. **Secure n8n**:
   - Change default password
   - Enable HTTPS (use n8n's built-in SSL or reverse proxy)
   - Restrict access with VPN or IP allowlist

2. **Use real API credentials** (not sandbox/test)

3. **Schedule during off-peak**:
   - Social APIs: 2-4 AM IST
   - Music APIs: 3-5 AM IST

4. **Monitor**:
   - n8n execution history
   - Database growth
   - API quota usage

5. **Backup n8n workflows**:
   - Export all workflows regularly
   - Store in git repository

---

## 📚 Resources

- n8n Docs: https://docs.n8n.io/
- YouTube API: https://developers.google.com/youtube/v3
- Instagram Graph API: https://developers.facebook.com/docs/instagram-api/
- Spotify Web API: https://developer.spotify.com/documentation/web-api/

---

**Next**: Import these workflows into your n8n instance and start testing!
