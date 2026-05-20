import { JobStatus, JobType } from '@prisma/client';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { bandsintownScraper } from './bandsintown.scraper';
import { bookMyShowScraper } from './bookMyShow.scraper';
import { eventbriteScraper } from './eventbrite.scraper';
import { googleCustomSearchScraper } from './googleCustomSearch.scraper';
import { scrapingJobQueue } from './jobQueue';
import { songkickScraper } from './songkick.scraper';
import {
  ConcertSourcePlatform,
  ConcertSourceScraper,
  RawConcertEvent,
  ScrapeJobPayload,
  ScrapeQuery,
  ScrapeResult,
} from './types';

const DEFAULT_SOURCES: ConcertSourcePlatform[] = [
  'BOOKMYSHOW',
  'SONGKICK',
  'BANDSINTOWN',
  'EVENTBRITE',
];

export interface ConcertScrapeSummary {
  jobId?: string;
  sourceCount: number;
  eventCount: number;
  events: RawConcertEvent[];
  results: ScrapeResult[];
  errors: string[];
}

export class ConcertScrapingService {
  private readonly scrapers: Map<ConcertSourcePlatform, ConcertSourceScraper>;

  constructor(scrapers: ConcertSourceScraper[] = [
    bookMyShowScraper,
    songkickScraper,
    bandsintownScraper,
    eventbriteScraper,
    googleCustomSearchScraper,
  ]) {
    this.scrapers = new Map(scrapers.map((scraper) => [scraper.source, scraper]));
  }

  getAvailableSources(): ConcertSourcePlatform[] {
    return [...this.scrapers.keys()];
  }

  async enqueueScrape(query: ScrapeQuery): Promise<string> {
    const job = await prisma.ingestionJob.create({
      data: {
        jobType: JobType.CONCERT_SCRAPE,
        status: JobStatus.PENDING,
        fileName: this.describeJob(query),
      },
    });

    const payload: ScrapeJobPayload = {
      id: job.id,
      query,
      createdAt: new Date().toISOString(),
    };

    await scrapingJobQueue.enqueue(payload);
    logger.info('Concert scrape job enqueued', { jobId: job.id, query: this.describeJob(query) });

    return job.id;
  }

  async processNextQueuedJob(): Promise<ConcertScrapeSummary | null> {
    const payload = await scrapingJobQueue.dequeue();
    if (!payload) return null;

    const startedAt = Date.now();
    await prisma.ingestionJob.update({
      where: { id: payload.id },
      data: {
        status: JobStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    try {
      const summary = await this.scrapeSources({ ...payload.query, jobId: payload.id });
      await prisma.ingestionJob.update({
        where: { id: payload.id },
        data: {
          status: summary.errors.length ? JobStatus.FAILED : JobStatus.SUCCESS,
          rowCount: summary.eventCount,
          errorMessage: summary.errors.length ? summary.errors.join('; ').slice(0, 1000) : null,
          duration: Date.now() - startedAt,
          completedAt: new Date(),
        },
      });

      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.ingestionJob.update({
        where: { id: payload.id },
        data: {
          status: JobStatus.FAILED,
          errorMessage: message.slice(0, 1000),
          duration: Date.now() - startedAt,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async scrapeSources(query: ScrapeQuery): Promise<ConcertScrapeSummary> {
    const selectedSources = query.sources?.length ? query.sources : DEFAULT_SOURCES;
    const activeScrapers = selectedSources
      .map((source) => this.scrapers.get(source))
      .filter((scraper): scraper is ConcertSourceScraper => Boolean(scraper));

    const results = await Promise.all(activeScrapers.map(async (scraper) => {
      try {
        return await scraper.scrape(query);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Concert source scraper failed', { source: scraper.source, error: message });
        return {
          source: scraper.source,
          events: [],
          errors: [message],
          fetchedAt: new Date(),
        };
      }
    }));
    const events = results.flatMap((result) => result.events);
    const errors = results.flatMap((result) => result.errors.map((error) => `${result.source}: ${error}`));

    return {
      jobId: query.jobId,
      sourceCount: activeScrapers.length,
      eventCount: events.length,
      events,
      results,
      errors,
    };
  }

  private describeJob(query: ScrapeQuery): string {
    const sources = query.sources?.join(',') || DEFAULT_SOURCES.join(',');
    const artists = query.artists?.join(',') || 'all-artists';
    const cities = query.cities?.join(',') || 'all-cities';
    return `concert-scrape sources=${sources} artists=${artists} cities=${cities}`;
  }
}

export const concertScrapingService = new ConcertScrapingService();


