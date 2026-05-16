const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD
});

async function clearCache() {
  await redis.del('dashboard:kpis');
  console.log('Cache cleared for dashboard:kpis');
  process.exit(0);
}

clearCache().catch(console.error);
