
export type ConcertSourcePlatform =
  | 'BOOKMYSHOW'
  | 'SONGKICK'
  | 'BANDSINTOWN'
  | 'EVENTBRITE'
  | 'GOOGLE_CSE'
  | 'ZOMATO';

export interface TicketPriceRange {
  min?: number;
  max?: number;
  currency?: string;
}

export interface ScrapeQuery {
  sources?: ConcertSourcePlatform[];
  artists?: string[];
  cities?: string[];
  country?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limitPerSource?: number;
  maxPages?: number;
  jobId?: string;
}

export interface RawConcertEvent {
  artistName: string;
  eventName?: string;
  venueName?: string;
  city?: string;
  country?: string;
  eventDate?: string | Date;
  sourcePlatform: ConcertSourcePlatform;
  sourceUrl?: string;
  sourceEventId?: string;
  ticketPriceRange?: TicketPriceRange;
  officialTicketUrl?: string;
  verifiedArtistAccount?: boolean;
  confidenceScore?: number;
  rawPayload?: Record<string, unknown>;
}

export interface ScrapeResult {
  source: ConcertSourcePlatform;
  events: RawConcertEvent[];
  errors: string[];
  fetchedAt: Date;
}

export interface ConcertSourceScraper {
  readonly source: ConcertSourcePlatform;
  scrape(query: ScrapeQuery): Promise<ScrapeResult>;
}

export interface ScrapeJobPayload {
  id: string;
  query: ScrapeQuery;
  createdAt: string;
}

