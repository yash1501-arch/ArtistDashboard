import { ConcertSourcePlatform, RawConcertEvent, TicketPriceRange } from '../scrapers/types';

export interface CanonicalConcertEvent {
  artist_name: string;
  event_name?: string;
  venue_name: string;
  city: string;
  country: string;
  event_date: Date;
  source_platform: ConcertSourcePlatform | string;
  source_url?: string;
  ticket_price_range?: TicketPriceRange;
  confidence_score: number;
}

export interface NormalizedConcertEvent extends CanonicalConcertEvent {
  normalized_artist_name: string;
  normalized_venue_name: string;
  normalized_city: string;
  canonical_key: string;
  source_event_id?: string;
  official_ticket_url?: string;
  verified_artist_account?: boolean;
  raw_event?: RawConcertEvent;
}
