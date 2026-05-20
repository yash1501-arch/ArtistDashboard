import * as cheerio from 'cheerio';
import { logger } from '../../utils/logger';
import { RateLimiter } from './rateLimiter';
import { retryWithBackoff } from './retry';
import {
  ConcertSourcePlatform,
  ConcertSourceScraper,
  RawConcertEvent,
  ScrapeQuery,
  ScrapeResult,
  TicketPriceRange,
} from './types';

interface SearchTarget {
  url: string;
  artist?: string;
  city?: string;
}

interface ExtractedRawEvent {
  artistName?: string;
  eventName?: string;
  venueName?: string;
  city?: string;
  country?: string;
  eventDate?: string;
  sourceUrl?: string;
  ticketPriceRange?: TicketPriceRange;
  officialTicketUrl?: string;
  rawPayload?: Record<string, unknown>;
}

interface PlaywrightChromium {
  launch(options: Record<string, unknown>): Promise<{
    newContext(options: Record<string, unknown>): Promise<{
      newPage(): Promise<RuntimePage>;
      close(): Promise<void>;
    }>;
    close(): Promise<void>;
  }>;
}

interface RuntimePage {
  goto(url: string, options: Record<string, unknown>): Promise<unknown>;
  waitForLoadState(state: string, options: Record<string, unknown>): Promise<unknown>;
  content(): Promise<string>;
  close(): Promise<void>;
}

export abstract class BasePlaywrightScraper implements ConcertSourceScraper {
  protected readonly rateLimiter: RateLimiter;
  protected readonly requestTimeoutMs = 25_000;

  abstract readonly source: ConcertSourcePlatform;
  protected abstract readonly cardSelectors: string[];
  protected abstract buildSearchTargets(query: ScrapeQuery): SearchTarget[];

  constructor(minDelayMs = 1_500) {
    this.rateLimiter = new RateLimiter(minDelayMs);
  }

  async scrape(query: ScrapeQuery): Promise<ScrapeResult> {
    const errors: string[] = [];
    const events: RawConcertEvent[] = [];
    const targets = this.buildSearchTargets(query).slice(0, query.maxPages ?? 12);

    if (targets.length === 0) {
      return {
        source: this.source,
        events,
        errors: ['No search targets generated for query'],
        fetchedAt: new Date(),
      };
    }

    let browser: Awaited<ReturnType<PlaywrightChromium['launch']>> | null = null;
    let context: Awaited<ReturnType<Awaited<ReturnType<PlaywrightChromium['launch']>>['newContext']>> | null = null;

    try {
      const chromium = this.loadChromium();
      browser = await chromium.launch({
        headless: true,
        args: ['--disable-dev-shm-usage', '--no-sandbox'],
      });
      context = await browser.newContext({
        userAgent: process.env.SCRAPER_USER_AGENT || 'ArtistIQ-ConcertIntelligence/1.0',
        viewport: { width: 1366, height: 900 },
      });

      for (const target of targets) {
        if ((query.limitPerSource ?? 100) <= events.length) break;

        try {
          await this.rateLimiter.wait();
          const page = await context.newPage();

          const pageEvents = await retryWithBackoff(
            async () => this.scrapeTarget(page, target, query),
            { attempts: 3, baseDelayMs: 600, maxDelayMs: 4_000 }
          );

          events.push(...pageEvents);
          await page.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${target.url}: ${message}`);
          logger.warn('Concert scraper target failed', {
            source: this.source,
            url: target.url,
            error: message,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      logger.error('Concert scraper failed', { source: this.source, error: message });
    } finally {
      if (context) await context.close();
      if (browser) await browser.close();
    }

    return {
      source: this.source,
      events: this.limitAndDedupe(events, query.limitPerSource ?? 100),
      errors,
      fetchedAt: new Date(),
    };
  }

  protected toSearchTerms(values?: string[]): string[] {
    const normalized = values?.map((value) => value.trim()).filter(Boolean) ?? [];
    return normalized.length ? normalized : ['music concerts'];
  }

  protected slug(value: string): string {
    return value
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async scrapeTarget(
    page: RuntimePage,
    target: SearchTarget,
    query: ScrapeQuery
  ): Promise<RawConcertEvent[]> {
    await page.goto(target.url, {
      waitUntil: 'domcontentloaded',
      timeout: this.requestTimeoutMs,
    });

    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);

    const extracted = this.extractEventsFromHtml(await page.content(), target.url);

    return extracted
      .map((event) => this.normalizeRawEvent(event, target, query))
      .filter((event): event is RawConcertEvent => Boolean(event))
      .filter((event) => this.isWithinDateRange(event, query));
  }

  private extractEventsFromHtml(html: string, fallbackUrl: string): ExtractedRawEvent[] {
    const $ = cheerio.load(html);
    const jsonLdEvents = $('script[type="application/ld+json"]')
      .toArray()
      .flatMap((script) => this.parseJsonLd($(script).text()))
      .filter((node) => this.isEventNode(node))
      .map((node) => this.eventFromJsonLd(node, fallbackUrl));

    const cardEvents = this.cardSelectors.flatMap((selector) =>
      $(selector).toArray().map((card) => {
        const root = $(card);
        const link = this.attrFrom(root, ['a[href]'], 'href');
        const eventName = this.textFrom(root, [
          '[data-testid*="event-title"]',
          '[class*="title"]',
          '[class*="eventName"]',
          'h1',
          'h2',
          'h3',
        ]);
        const dateText = this.textFrom(root, [
          'time',
          '[datetime]',
          '[class*="date"]',
          '[data-testid*="date"]',
        ]);
        const dateAttr = this.attrFrom(root, ['time[datetime]', '[datetime]'], 'datetime');
        const venueText = this.textFrom(root, [
          '[class*="venue"]',
          '[data-testid*="venue"]',
          '[class*="location"]',
        ]);
        const priceText = this.textFrom(root, [
          '[class*="price"]',
          '[data-testid*="price"]',
        ]);

        return {
          eventName,
          artistName: eventName,
          venueName: venueText,
          eventDate: dateAttr || dateText,
          sourceUrl: this.toAbsoluteUrl(link, fallbackUrl) || fallbackUrl,
          rawPayload: {
            sourcePlatform: this.source,
            extraction: 'card',
            text: root.text().replace(/\s+/g, ' ').trim(),
            priceText,
          },
        };
      })
    );

    return [...jsonLdEvents, ...cardEvents];
  }

  private eventFromJsonLd(node: Record<string, unknown>, fallbackUrl: string): ExtractedRawEvent {
    const location = this.asRecord(node.location) ?? {};
    const address = this.asRecord(location.address) ?? {};
    const offer = this.readOffer(node.offers, fallbackUrl);
    const eventUrl = this.toAbsoluteUrl(this.pickString(node.url), fallbackUrl) || offer.url || fallbackUrl;

    return {
      artistName: this.readName(node.performer) || this.pickString(node.name),
      eventName: this.pickString(node.name),
      venueName: this.readName(location),
      city: this.pickString(address.addressLocality),
      country: this.readCountry(address.addressCountry),
      eventDate: this.pickString(node.startDate),
      sourceUrl: eventUrl,
      officialTicketUrl: offer.url,
      ticketPriceRange: offer.price
        ? { min: offer.price, max: offer.price, currency: offer.currency }
        : undefined,
      rawPayload: {
        sourcePlatform: this.source,
        extraction: 'json-ld',
        payload: node,
      },
    };
  }

  private parseJsonLd(value: string): Record<string, unknown>[] {
    try {
      return this.flattenJsonLd(JSON.parse(value));
    } catch {
      return [];
    }
  }

  private flattenJsonLd(value: unknown): Record<string, unknown>[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap((item) => this.flattenJsonLd(item));
    if (typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    const graph = Array.isArray(record['@graph']) ? this.flattenJsonLd(record['@graph']) : [];
    return [record, ...graph];
  }

  private isEventNode(node: Record<string, unknown>): boolean {
    const types = this.asArray(node['@type']).map((type) => String(type).toLowerCase());
    return types.includes('event') || types.includes('musicevent');
  }

  private readOffer(offers: unknown, fallbackUrl: string): { price?: number; currency?: string; url?: string } {
    const offer = this.asRecord(this.asArray(offers)[0]);
    const price = this.toNumber(offer?.lowPrice ?? offer?.highPrice ?? offer?.price);
    return {
      price,
      currency: this.pickString(offer?.priceCurrency),
      url: this.toAbsoluteUrl(this.pickString(offer?.url), fallbackUrl),
    };
  }

  private readName(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map((item) => this.readName(item)).find(Boolean);
    const record = this.asRecord(value);
    return this.pickString(record?.name);
  }

  private readCountry(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    const record = this.asRecord(value);
    return this.pickString(record?.name, record?.addressCountry);
  }

  private textFrom(root: cheerio.Cheerio<cheerio.Element>, selectors: string[]): string | undefined {
    for (const selector of selectors) {
      const text = root.find(selector).first().text().replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    return undefined;
  }

  private attrFrom(root: cheerio.Cheerio<cheerio.Element>, selectors: string[], attribute: string): string | undefined {
    for (const selector of selectors) {
      const value = root.find(selector).first().attr(attribute);
      if (value) return value;
    }
    return undefined;
  }

  private toAbsoluteUrl(value: string | undefined, fallbackUrl: string): string | undefined {
    if (!value) return undefined;
    try {
      return new URL(value, fallbackUrl).toString();
    } catch {
      return value;
    }
  }

  private asArray(value: unknown): unknown[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  }

  private pickString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number') return String(value);
    }
    return undefined;
  }

  private toNumber(value: unknown): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : undefined;
  }

  private normalizeRawEvent(
    event: ExtractedRawEvent,
    target: SearchTarget,
    query: ScrapeQuery
  ): RawConcertEvent | null {
    const extractedArtistName = this.clean(event.artistName);
    const targetArtist = this.clean(target.artist);

    if (!extractedArtistName && targetArtist && !this.isRelevantToTargetArtist(event, targetArtist)) {
      return null;
    }

    const artistName = extractedArtistName || targetArtist;
    const eventName = this.clean(event.eventName);
    const venueName = this.clean(event.venueName);
    const eventDate = event.eventDate;

    if (!artistName || !eventDate || (!eventName && !venueName)) return null;

    return {
      artistName,
      eventName,
      venueName,
      city: this.clean(event.city) || target.city,
      country: this.clean(event.country) || query.country,
      eventDate,
      sourcePlatform: this.source,
      sourceUrl: event.sourceUrl,
      ticketPriceRange: event.ticketPriceRange,
      officialTicketUrl: event.officialTicketUrl || event.sourceUrl,
      confidenceScore: this.scoreExtraction(event),
      rawPayload: event.rawPayload,
    };
  }

  private isRelevantToTargetArtist(event: ExtractedRawEvent, targetArtist: string): boolean {
    const target = this.comparable(targetArtist);
    if (!target) return true;

    const sourceUrl = event.sourceUrl || event.officialTicketUrl;
    const performerFromUrl = sourceUrl ? this.performerFromConcertUrl(sourceUrl) : undefined;
    if (performerFromUrl) {
      return this.isSameArtistText(performerFromUrl, target);
    }

    const evidence = [
      event.eventName,
      sourceUrl && !sourceUrl.includes('/concerts/') ? sourceUrl : undefined,
      typeof event.rawPayload?.text === 'string' ? event.rawPayload.text : undefined,
    ]
      .filter(Boolean)
      .map((value) => this.comparable(String(value)))
      .join(' ');

    return evidence.includes(target);
  }

  private performerFromConcertUrl(value: string): string | undefined {
    try {
      const url = new URL(value);
      const concertSegment = url.pathname.split('/').find((segment) => /^concerts$/i.test(segment));
      if (!concertSegment) return undefined;
    } catch {
      // Fall through to regex parsing; some scrapers can pass already-relative URLs.
    }

    const match = value.match(/\/concerts\/\d+-([^/?#]+?)-at-/i);
    if (!match?.[1]) return undefined;
    return this.comparable(match[1].replace(/-/g, ' '));
  }

  private comparable(value: string): string {
    return value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isSameArtistText(left: string, right: string): boolean {
    if (left === right || left.includes(right) || right.includes(left)) return true;
    const compactLeft = left.replace(/\s+/g, '');
    const compactRight = right.replace(/\s+/g, '');
    return Boolean(compactLeft && compactRight) &&
      (compactLeft === compactRight || compactLeft.includes(compactRight) || compactRight.includes(compactLeft));
  }

  private scoreExtraction(event: ExtractedRawEvent): number {
    let score = event.rawPayload?.extraction === 'json-ld' ? 0.7 : 0.45;
    if (event.venueName) score += 0.08;
    if (event.sourceUrl) score += 0.07;
    if (event.ticketPriceRange) score += 0.05;
    if (event.officialTicketUrl) score += 0.05;
    return Math.min(0.95, Number(score.toFixed(2)));
  }

  private isWithinDateRange(event: RawConcertEvent, query: ScrapeQuery): boolean {
    if (!query.dateFrom && !query.dateTo) return true;
    const eventDate = new Date(event.eventDate || '');
    if (Number.isNaN(eventDate.getTime())) return false;
    if (query.dateFrom && eventDate < query.dateFrom) return false;
    if (query.dateTo && eventDate > query.dateTo) return false;
    return true;
  }

  private limitAndDedupe(events: RawConcertEvent[], limit: number): RawConcertEvent[] {
    const seen = new Set<string>();
    const unique: RawConcertEvent[] = [];

    for (const event of events) {
      const key = [
        event.sourcePlatform,
        event.sourceUrl,
        event.artistName.toLowerCase(),
        event.venueName?.toLowerCase(),
        String(event.eventDate).slice(0, 10),
      ].join('|');

      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(event);
      if (unique.length >= limit) break;
    }

    return unique;
  }

  private clean(value?: string): string | undefined {
    const cleaned = value?.replace(/\s+/g, ' ').trim();
    return cleaned || undefined;
  }

  private loadChromium(): PlaywrightChromium {
    try {
      const runtimeRequire = eval('require') as NodeRequire;
      const playwright = runtimeRequire('playwright') as { chromium?: PlaywrightChromium };
      if (!playwright.chromium) throw new Error('Playwright chromium launcher not found');
      return playwright.chromium;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Playwright is required for concert scraping. Install backend dependency "playwright". ${detail}`);
    }
  }
}
