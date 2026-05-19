import { RawConcertEvent } from '../scrapers/types';
import { NormalizedConcertEvent } from './types';

const COUNTRY_ALIASES = new Map<string, string>([
  ['in', 'India'],
  ['india', 'India'],
  ['usa', 'United States'],
  ['us', 'United States'],
  ['united states of america', 'United States'],
  ['uk', 'United Kingdom'],
  ['uae', 'United Arab Emirates'],
]);

const CITY_ALIASES = new Map<string, string>([
  ['bombay', 'Mumbai'],
  ['mumbai', 'Mumbai'],
  ['bangalore', 'Bengaluru'],
  ['bengaluru', 'Bengaluru'],
  ['new delhi', 'New Delhi'],
  ['delhi', 'Delhi'],
]);

const SUBDIVISION_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'IA', 'ID', 'IL',
  'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND',
  'NE', 'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN',
  'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY', 'DC',
  'ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA',
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
]);

export class EventNormalizationService {
  normalizeBatch(events: RawConcertEvent[]): NormalizedConcertEvent[] {
    return events.flatMap((event) => {
      const normalized = this.normalize(event);
      return normalized ? [normalized] : [];
    });
  }

  normalize(event: RawConcertEvent): NormalizedConcertEvent | null {
    const location = this.resolveLocation(event);
    const artistName = this.toTitleName(this.cleanDisplayName(event.artistName));
    const venueName = this.toTitleName(this.cleanVenueName(location.venueName));
    const city = this.normalizeCity(location.city);
    const country = this.normalizeCountry(location.country);
    const eventDate = this.normalizeDate(event.eventDate);

    if (!artistName || !venueName || !city || !country || !eventDate) return null;

    const normalizedArtistName = this.normalizeComparableName(artistName);
    const normalizedVenueName = this.normalizeComparableName(venueName);
    const normalizedCity = this.normalizeComparableName(city);

    return {
      artist_name: artistName,
      event_name: this.cleanDisplayName(event.eventName),
      venue_name: venueName,
      city,
      country,
      event_date: eventDate,
      source_platform: event.sourcePlatform,
      source_url: event.sourceUrl,
      ticket_price_range: event.ticketPriceRange,
      confidence_score: this.round(this.clamp(event.confidenceScore ?? 0.5, 0, 1), 4),
      normalized_artist_name: normalizedArtistName,
      normalized_venue_name: normalizedVenueName,
      normalized_city: normalizedCity,
      canonical_key: this.buildCanonicalKey(
        normalizedArtistName,
        normalizedVenueName,
        normalizedCity,
        country,
        eventDate
      ),
      source_event_id: event.sourceEventId,
      official_ticket_url: event.officialTicketUrl,
      verified_artist_account: event.verifiedArtistAccount,
      raw_event: event,
    };
  }

  normalizeComparableName(value: string): string {
    return value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\b(the|official|live|concert|tour|show|band|presents)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  normalizeDate(value?: string | Date): Date | null {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;

    return new Date(Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate()
    ));
  }

  normalizeCity(value: string): string {
    const cleaned = this.toTitleName(this.cleanDisplayName(value));
    const alias = CITY_ALIASES.get(cleaned.toLowerCase());
    return alias ?? cleaned;
  }

  normalizeCountry(value: string): string {
    const cleaned = this.cleanDisplayName(value);
    const alias = COUNTRY_ALIASES.get(cleaned.toLowerCase());
    return alias ?? this.toTitleName(cleaned);
  }

  private cleanDisplayName(value?: string): string {
    return (value || '')
      .replace(/\s+/g, ' ')
      .replace(/[|]+/g, ' ')
      .trim();
  }

  private cleanVenueName(value: string): string {
    return this.cleanDisplayName(value)
      .replace(/\b(ltd|llc|pvt|private limited)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private resolveLocation(event: RawConcertEvent): { venueName: string; city: string; country: string } {
    const venueName = this.cleanDisplayName(event.venueName || '');
    const city = this.cleanDisplayName(event.city || '');
    const country = this.cleanDisplayName(event.country || '');

    if (venueName && city && country) {
      return { venueName, city, country };
    }

    const parts = venueName.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const resolvedCountry = this.resolveCountryFromLocationPart(parts[parts.length - 1], country);
      const candidateCityParts = parts.slice(1, -1);
      const resolvedCity = city || this.resolveCityFromLocationParts(candidateCityParts);
      const resolvedVenueName = parts[0];

      return {
        venueName: resolvedVenueName,
        city: resolvedCity,
        country: resolvedCountry,
      };
    }

    if (parts.length === 2 && country) {
      return {
        venueName: parts[0],
        city: city || parts[1],
        country,
      };
    }

    return { venueName, city, country };
  }

  private resolveCityFromLocationParts(parts: string[]): string {
    const nonSubdivision = [...parts].reverse().find((part) => !this.isSubdivisionCode(part));
    return nonSubdivision || parts[0] || '';
  }

  private resolveCountryFromLocationPart(locationCountry: string, fallbackCountry: string): string {
    if (!fallbackCountry) return locationCountry;
    if (this.isSubdivisionCode(locationCountry)) return fallbackCountry;

    const normalizedLocation = this.normalizeComparableName(this.normalizeCountry(locationCountry));
    const normalizedFallback = this.normalizeComparableName(this.normalizeCountry(fallbackCountry));
    return normalizedLocation === normalizedFallback ? fallbackCountry : locationCountry;
  }

  private isSubdivisionCode(value: string): boolean {
    return SUBDIVISION_CODES.has(value.trim().toUpperCase());
  }

  private toTitleName(value: string): string {
    return value
      .split(' ')
      .filter(Boolean)
      .map((part) => {
        const lower = part.toLowerCase();
        if (['dj', 'edm', 'usa', 'uk', 'uae'].includes(lower)) return lower.toUpperCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(' ');
  }

  private buildCanonicalKey(
    artist: string,
    venue: string,
    city: string,
    country: string,
    date: Date
  ): string {
    return [
      artist,
      venue,
      city,
      this.normalizeComparableName(country),
      date.toISOString().slice(0, 10),
    ].join('|');
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}

export const eventNormalizationService = new EventNormalizationService();
