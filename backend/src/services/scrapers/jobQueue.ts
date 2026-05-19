import { getRedis, redis } from '../../utils/database';
import { logger } from '../../utils/logger';
import { ScrapeJobPayload } from './types';

const QUEUE_KEY = 'concert:scrape:queue';
const PAYLOAD_TTL_SECONDS = 60 * 60 * 24;

export class ScrapingJobQueue {
  private readonly memoryQueue: ScrapeJobPayload[] = [];

  async enqueue(payload: ScrapeJobPayload): Promise<void> {
    const client = getRedis();

    if (!client) {
      this.memoryQueue.push(payload);
      return;
    }

    const payloadKey = this.payloadKey(payload.id);
    await redis.setex(payloadKey, PAYLOAD_TTL_SECONDS, JSON.stringify(payload));
    await client.lpush(QUEUE_KEY, payload.id);
  }

  async dequeue(): Promise<ScrapeJobPayload | null> {
    const client = getRedis();

    if (!client) {
      return this.memoryQueue.shift() ?? null;
    }

    const id = await client.rpop(QUEUE_KEY);
    if (!id) return null;

    const payload = await redis.get(this.payloadKey(id));
    if (!payload) {
      logger.warn('Scrape queue payload missing', { id });
      return null;
    }

    return JSON.parse(payload) as ScrapeJobPayload;
  }

  private payloadKey(id: string): string {
    return `concert:scrape:job:${id}`;
  }
}

export const scrapingJobQueue = new ScrapingJobQueue();
