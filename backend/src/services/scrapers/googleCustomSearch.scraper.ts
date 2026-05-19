import axios from 'axios';
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

interface GoogleSearchItem {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
  pagemap?: Record<string, unknown>;
}

interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
  searchInformation?: {
    totalResults?: string;
  };
}

interface ExtractedEvent {
  artistName?: string;
  eventName?: string;
  venueName?: string;
  city?: string;
  country?: string;
  eventDate?: string;
  ticketPriceRange?: TicketPriceRange;
  officialTicketUrl?: string;
  rawPayload?: Record<string, unknown>;
}

const EVENT_SOURCE_SITES = [
  'bookmyshow.com',
  'songkick.com',
  'bandsintown.com',
  'eventbrite.com',
  'ticketmaster.com',
  'insider.in',
];

export class GoogleCustomSearchScraper implements ConcertSourceScraper {
  readonly source: ConcertSourcePlatform = 'GOOGLE_CSE';
  private readonly rateLimiter = new RateLimiter(1_000);

  async scrape(query: ScrapeQuery): Promise<ScrapeResult> {
    const errors: string[] = [];
    const events: RawConcertEvent[] = [];
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_SEARCH_CX;

    if (!apiKey || !cx) {
      return {
        source: this.source,
        events,
        errors: ['GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX are required for Google Custom Search scraping'],
        fetchedAt: new Date(),
      };
    }

    const searches = this.buildSearchQueries(query).slice(0, query.maxPages ?? 10);

    for (const search of searches) {
      if (events.length >= (query.limitPerSource ?? 50)) break;

      try {
        await this.rateLimiter.wait();
        const items = await this.search(apiKey, cx, search);
        for (const item of items) {
          if (events.length >= (query.limitPerSource ?? 50)) break;
          const event = await this.extractEventFromSearchItem(item, query);
          if (event && this.isWithinDateRange(event, query)) events.push(event);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${search}: ${message}`);
        logger.warn('Google CSE concert scrape search failed', { query: search, error: message });
      }
    }

    return {
      source: this.source,
      events: this.dedupe(events),
      errors,
      fetchedAt: new Date(),
    };
  }

  private buildSearchQueries(query: ScrapeQuery): string[] {
    const artists = query.artists?.map((artist) => artist.trim()).filter(Boolean) ?? ['concert'];
    const cities = query.cities?.map((city) => city.trim()).filter(Boolean) ?? [''];
    const dateTerms = [
      query.dateFrom ? `after:${query.dateFrom.toISOString().slice(0, 10)}` : '',
      query.dateTo ? `before:${query.dateTo.toISOString().slice(0, 10)}` : '',
    ].filter(Boolean).join(' ');
    const siteQuery = EVENT_SOURCE_SITES.map((site) => `site:${site}`).join(' OR ');

    const searches: string[] = [];
    for (const artist of artists) {
      for (const city of cities) {
        searches.push([
          `"${artist}"`,
          city ? `"${city}"` : '',
          'concert OR live OR tickets',
          dateTerms,
          `(${siteQuery})`,
        ].filter(Boolean).join(' '));
      }
    }

    return searches;
  }

  private async search(apiKey: string, cx: string, q: string): Promise<GoogleSearchItem[]> {
    const response = await retryWithBackoff(
      () => axios.get<GoogleSearchResponse>('https://customsearch.googleapis.com/customsearch/v1', {
        timeout: 15_000,
        params: {
          key: apiKey,
          cx,
          q,
          num: 10,
        },
      }),
      { attempts: 3, baseDelayMs: 500, maxDelayMs: 3_000 }
    );

    return response.data.items ?? [];
  }

  private async extractEventFromSearchItem(
    item: GoogleSearchItem,
    query: ScrapeQuery
  ): Promise<RawConcertEvent | null> {
    if (!item.link) return null;

    const pageEvent = await this.fetchAndExtractPageEvent(item.link).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Google CSE result page extraction failed', { url: item.link, error: message });
      return null;
    });

    const extracted = pageEvent ?? this.extractFromPagemap(item);
    if (!extracted?.eventDate) return null;

    const artistName = this.resolveArtistName(extracted, item, query);
    const venueName = extracted.venueName?.trim();
    const city = extracted.city?.trim() || query.cities?.[0];
    const country = extracted.country?.trim() || query.country;

    if (!artistName || !venueName || !city || !country) return null;

    return {
      artistName,
      eventName: extracted.eventName || item.title,
      venueName,
      city,
      country,
      eventDate: extracted.eventDate,
      sourcePlatform: this.source,
      sourceUrl: item.link,
      officialTicketUrl: extracted.officialTicketUrl || item.link,
      ticketPriceRange: extracted.ticketPriceRange,
      confidenceScore: pageEvent ? 0.78 : 0.58,
      rawPayload: {
        google: {
          title: item.title,
          link: item.link,
          snippet: item.snippet,
          displayLink: item.displayLink,
        },
        extraction: extracted.rawPayload,
      },
    };
  }

  private async fetchAndExtractPageEvent(url: string): Promise<ExtractedEvent | null> {
    const response = await retryWithBackoff(
      () => axios.get<string>(url, {
        timeout: 18_000,
        headers: {
          'User-Agent': process.env.SCRAPER_USER_AGENT || 'ArtistIQ-ConcertIntelligence/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
        maxRedirects: 5,
      }),
      { attempts: 2, baseDelayMs: 600, maxDelayMs: 2_000 }
    );

    const $ = cheerio.load(response.data);
    const jsonLdEvents = $('script[type="application/ld+json"]')
      .toArray()
      .flatMap((script) => this.parseJsonLd($(script).text()))
      .filter((node) => this.isEventNode(node));

    for (const node of jsonLdEvents) {
      const event = this.fromJsonLd(node, url);
      if (event?.eventDate && event.venueName) return event;
    }

    return null;
  }

  private extractFromPagemap(item: GoogleSearchItem): ExtractedEvent | null {
    const pagemap = item.pagemap ?? {};
    const metatags = this.firstArrayObject(pagemap.metatags);
    const event = this.firstArrayObject(pagemap.event) || this.firstArrayObject(pagemap.musicevent);

    const eventDate = this.pickString(
      event?.startdate,
      event?.startDate,
      metatags?.['event:start_time'],
      metatags?.['music:event_start_time']
    );

    if (!eventDate) return null;

    return {
      eventName: this.pickString(event?.name, item.title),
      artistName: this.pickString(event?.performer, item.title),
      venueName: this.pickString(event?.location, metatags?.['place:location:latitude'] ? item.displayLink : undefined),
      eventDate,
      officialTicketUrl: item.link,
      rawPayload: {
        source: 'google-pagemap',
        pagemap,
      },
    };
  }

  private fromJsonLd(node: Record<string, unknown>, fallbackUrl: string): ExtractedEvent | null {
    const location = this.asRecord(node.location);
    const address = this.asRecord(location?.address);
    const offers = this.asArray(node.offers).map((offer) => this.asRecord(offer)).filter(Boolean);
    const firstOffer = offers[0];
    const performer = this.readName(node.performer);
    const organizer = this.readName(node.organizer);
    const price = this.toNumber(firstOffer?.lowPrice ?? firstOffer?.price ?? firstOffer?.highPrice);

    return {
      artistName: performer || organizer || this.pickString(node.name),
      eventName: this.pickString(node.name),
      venueName: this.readName(location),
      city: this.pickString(address?.addressLocality),
      country: this.readCountry(address?.addressCountry),
      eventDate: this.pickString(node.startDate),
      officialTicketUrl: this.pickString(firstOffer?.url, node.url, fallbackUrl),
      ticketPriceRange: price
        ? {
            min: price,
            max: this.toNumber(firstOffer?.highPrice) || price,
            currency: this.pickString(firstOffer?.priceCurrency),
          }
        : undefined,
      rawPayload: {
        source: 'json-ld',
        node,
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

  private resolveArtistName(
    event: ExtractedEvent,
    item: GoogleSearchItem,
    query: ScrapeQuery
  ): string | undefined {
    if (event.artistName) return event.artistName.trim();
    const requestedArtist = query.artists?.find((artist) =>
      `${item.title || ''} ${item.snippet || ''}`.toLowerCase().includes(artist.toLowerCase())
    );
    return requestedArtist;
  }

  private isWithinDateRange(event: RawConcertEvent, query: ScrapeQuery): boolean {
    const eventDate = new Date(event.eventDate || '');
    if (Number.isNaN(eventDate.getTime())) return false;
    if (query.dateFrom && eventDate < query.dateFrom) return false;
    if (query.dateTo && eventDate > query.dateTo) return false;
    return true;
  }

  private dedupe(events: RawConcertEvent[]): RawConcertEvent[] {
    const seen = new Set<string>();
    return events.filter((event) => {
      const key = [
        event.sourceUrl,
        event.artistName.toLowerCase(),
        event.venueName?.toLowerCase(),
        String(event.eventDate).slice(0, 10),
      ].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private readName(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return value.map((item) => this.readName(item)).find(Boolean);
    }
    const record = this.asRecord(value);
    return this.pickString(record?.name);
  }

  private readCountry(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    const record = this.asRecord(value);
    return this.pickString(record?.name, record?.addressCountry);
  }

  private firstArrayObject(value: unknown): Record<string, unknown> | undefined {
    const first = Array.isArray(value) ? value[0] : value;
    return this.asRecord(first);
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
}

export const googleCustomSearchScraper = new GoogleCustomSearchScraper();
