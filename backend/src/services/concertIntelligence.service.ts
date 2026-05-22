import { Concert, ConcertVerificationStatus, EventValidationStatus, Prisma } from '@prisma/client';
import { prisma } from '../utils/database';
import { duplicateDetectionService } from './deduplication/duplicateDetection.service';
import { duplicateMergeService } from './deduplication/duplicateMerge.service';
import { eventNormalizationService } from './normalization/eventNormalization.service';
import { NormalizedConcertEvent } from './normalization/types';
import { revenuePredictionService } from './predictions/revenuePrediction.service';
import { RevenuePredictionResult } from './predictions/types';
import { RawConcertEvent, ScrapeQuery } from './scrapers/types';
import { hybridValidationService } from './validation/hybridValidation.service';
import { HybridValidationResult } from './validation/types';

export interface ConcertIntelligenceOptions extends ScrapeQuery {
  artistIds?: string[];
  dryRun?: boolean;
  runPredictions?: boolean;
  persistConcerts?: boolean;
  artistLimit?: number;
}

export interface ConcertIntelligenceEventResult {
  canonicalEventId?: string;
  action: 'created' | 'updated' | 'merged' | 'dry_run' | 'skipped';
  event: NormalizedConcertEvent;
  duplicateCount: number;
  duplicateGroupId?: string;
  validation?: HybridValidationResult;
  prediction?: RevenuePredictionResult;
  concert?: Concert;
  reason?: string;
}

export interface ConcertIntelligenceSummary {
  jobId?: string;
  scrapedCount: number;
  normalizedCount: number;
  persistedCount: number;
  duplicateCount: number;
  validatedCount: number;
  predictedCount: number;
  storedConcertCount: number;
  results: ConcertIntelligenceEventResult[];
  errors: string[];
}

interface IntelligenceArtist {
  id: string;
  artistName: string;
}

interface PredictionInputs {
  venueCapacity: number;
  venueCapacitySource: string;
  avgTicketPrice: number;
  avgTicketPriceSource: string;
}

export class ConcertIntelligenceService {
  async runDiscoveryPipeline(options: ConcertIntelligenceOptions): Promise<ConcertIntelligenceSummary> {
    const artists = await this.resolveArtists(options);
    // Concert scraping is now handled by the Python mad_analytics scheduler.
    // This pipeline processes any events passed directly or from the DB.
    const normalizedEvents = eventNormalizationService.normalizeBatch([] as RawConcertEvent[]);
    const results: ConcertIntelligenceEventResult[] = [];
    const shouldRunPredictions = options.runPredictions !== false;
    const shouldPersistConcerts = options.persistConcerts !== false && shouldRunPredictions;

    for (const event of normalizedEvents) {
      try {
        const deduplication = await duplicateDetectionService.detect(event);
        const artist = this.matchArtist(event, artists);

        if (options.dryRun) {
          results.push({
            action: 'dry_run',
            event,
            duplicateCount: deduplication.duplicates.length,
          });
          continue;
        }

        const persistence = await duplicateMergeService.persistNormalizedEvent(event, deduplication);
        const validation = await hybridValidationService.validate(event, {
          canonicalEventId: persistence.canonicalEventId,
          duplicateDetected: persistence.action === 'merged' || deduplication.duplicates.length > 0,
        });

        const prediction = shouldRunPredictions
          ? await this.predictForEvent(event, persistence.canonicalEventId, validation, artist?.id)
          : undefined;
        const concert = prediction && shouldPersistConcerts
          ? await this.persistPredictedConcert(event, persistence.canonicalEventId, validation, prediction, artist)
          : undefined;

        results.push({
          canonicalEventId: persistence.canonicalEventId,
          action: persistence.action,
          event,
          duplicateCount: deduplication.duplicates.length,
          duplicateGroupId: persistence.duplicateGroupId,
          validation,
          prediction,
          concert,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          action: 'skipped',
          event,
          duplicateCount: 0,
          reason: message,
        });
      }
    }

    return {
      jobId: 'python-scheduler',
      scrapedCount: 0,
      normalizedCount: normalizedEvents.length,
      persistedCount: results.filter((result) => ['created', 'updated', 'merged'].includes(result.action)).length,
      duplicateCount: results.filter((result) => result.action === 'merged').length,
      validatedCount: results.filter((result) => result.validation).length,
      predictedCount: results.filter((result) => result.prediction).length,
      storedConcertCount: results.filter((result) => result.concert).length,
      results,
      errors: [],
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async enqueueDiscoveryPipeline(_options: ConcertIntelligenceOptions): Promise<string> {
    // Scraping is now handled by the Python mad_analytics background scheduler.
    return 'scraping-handled-by-python-scheduler';
  }

  async ingestRawEvents(
    rawEvents: RawConcertEvent[],
    options: Omit<ConcertIntelligenceOptions, 'sources'> = {}
  ): Promise<ConcertIntelligenceSummary> {
    const normalizedEvents = eventNormalizationService.normalizeBatch(rawEvents);
    const artists = await this.resolveArtists({
      ...options,
      artists: options.artists ?? [...new Set(rawEvents.map((event) => event.artistName).filter(Boolean))],
    });
    const results = await this.processNormalizedEvents(normalizedEvents, options, artists);

    return {
      scrapedCount: rawEvents.length,
      normalizedCount: normalizedEvents.length,
      persistedCount: results.filter((result) => ['created', 'updated', 'merged'].includes(result.action)).length,
      duplicateCount: results.filter((result) => result.action === 'merged').length,
      validatedCount: results.filter((result) => result.validation).length,
      predictedCount: results.filter((result) => result.prediction).length,
      storedConcertCount: results.filter((result) => result.concert).length,
      results,
      errors: [],
    };
  }

  private async processNormalizedEvents(
    normalizedEvents: NormalizedConcertEvent[],
    options: ConcertIntelligenceOptions,
    artists: IntelligenceArtist[]
  ): Promise<ConcertIntelligenceEventResult[]> {
    const results: ConcertIntelligenceEventResult[] = [];
    const shouldRunPredictions = options.runPredictions !== false;
    const shouldPersistConcerts = options.persistConcerts !== false && shouldRunPredictions;

    for (const event of normalizedEvents) {
      try {
        const deduplication = await duplicateDetectionService.detect(event);
        const artist = this.matchArtist(event, artists);

        if (options.dryRun) {
          results.push({
            action: 'dry_run',
            event,
            duplicateCount: deduplication.duplicates.length,
          });
          continue;
        }

        const persistence = await duplicateMergeService.persistNormalizedEvent(event, deduplication);
        const validation = await hybridValidationService.validate(event, {
          canonicalEventId: persistence.canonicalEventId,
          duplicateDetected: persistence.action === 'merged' || deduplication.duplicates.length > 0,
        });

        const prediction = shouldRunPredictions
          ? await this.predictForEvent(event, persistence.canonicalEventId, validation, artist?.id)
          : undefined;
        const concert = prediction && shouldPersistConcerts
          ? await this.persistPredictedConcert(event, persistence.canonicalEventId, validation, prediction, artist)
          : undefined;

        results.push({
          canonicalEventId: persistence.canonicalEventId,
          action: persistence.action,
          event,
          duplicateCount: deduplication.duplicates.length,
          duplicateGroupId: persistence.duplicateGroupId,
          validation,
          prediction,
          concert,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          action: 'skipped',
          event,
          duplicateCount: 0,
          reason: message,
        });
      }
    }

    return results;
  }

  private async predictForEvent(
    event: NormalizedConcertEvent,
    canonicalEventId: string,
    validation: HybridValidationResult,
    artistId?: string
  ): Promise<RevenuePredictionResult | undefined> {
    if (
      validation.validation_status !== EventValidationStatus.VALIDATED &&
      validation.validation_status !== EventValidationStatus.REVIEW_REQUIRED
    ) {
      return undefined;
    }

    const predictionInputs = await this.resolvePredictionInputs(event);

    return revenuePredictionService.predict({
      artist: event.artist_name,
      artistId,
      city: event.city,
      country: event.country,
      venueName: event.venue_name,
      venue_capacity: predictionInputs.venueCapacity,
      avg_ticket_price: predictionInputs.avgTicketPrice,
      event_date: event.event_date,
      canonicalEventId,
    });
  }

  private async resolveArtists(options: ConcertIntelligenceOptions): Promise<IntelligenceArtist[]> {
    const where: Prisma.ArtistWhereInput = { active: true };

    if (options.artistIds?.length) {
      where.id = { in: options.artistIds };
    } else if (options.artists?.length) {
      where.OR = options.artists.map((artist) => ({
        artistName: { equals: artist, mode: 'insensitive' },
      }));
    }

    return prisma.artist.findMany({
      where,
      select: {
        id: true,
        artistName: true,
      },
      orderBy: { artistName: 'asc' },
      take: options.artistLimit ?? (options.artistIds?.length || options.artists?.length ? 100 : 25),
    });
  }

  private matchArtist(event: NormalizedConcertEvent, artists: IntelligenceArtist[]): IntelligenceArtist | undefined {
    if (artists.length === 0) return undefined;
    const eventName = event.normalized_artist_name;

    const matched = artists.find((artist) => {
      const normalized = eventNormalizationService.normalizeComparableName(artist.artistName);
      return this.isSameArtistName(eventName, normalized);
    });

    return matched;
  }

  private isSameArtistName(left: string, right: string): boolean {
    if (left === right || left.includes(right) || right.includes(left)) return true;
    const compactLeft = left.replace(/\s+/g, '');
    const compactRight = right.replace(/\s+/g, '');
    return Boolean(compactLeft && compactRight) &&
      (compactLeft === compactRight || compactLeft.includes(compactRight) || compactRight.includes(compactLeft));
  }

  private async resolvePredictionInputs(event: NormalizedConcertEvent): Promise<PredictionInputs> {
    const [venueCapacity, avgTicketPrice] = await Promise.all([
      this.resolveVenueCapacity(event),
      this.resolveAverageTicketPrice(event),
    ]);

    return {
      venueCapacity: venueCapacity.value,
      venueCapacitySource: venueCapacity.source,
      avgTicketPrice: avgTicketPrice.value,
      avgTicketPriceSource: avgTicketPrice.source,
    };
  }

  private async resolveVenueCapacity(event: NormalizedConcertEvent): Promise<{ value: number; source: string }> {
    const venue = await prisma.venue.findFirst({
      where: {
        name: { equals: event.venue_name, mode: 'insensitive' },
        city: { equals: event.city, mode: 'insensitive' },
        country: { equals: event.country, mode: 'insensitive' },
      },
    });
    const capacity = venue?.avgCapacity || venue?.capacityMax || venue?.capacityMin;

    if (capacity) return { value: capacity, source: 'venue_db' };

    return {
      value: this.estimateVenueCapacity(event.venue_name),
      source: 'venue_name_estimate',
    };
  }

  private async resolveAverageTicketPrice(
    event: NormalizedConcertEvent
  ): Promise<{ value: number; source: string }> {
    const range = event.ticket_price_range;
    if (range?.min && range.max) return { value: (range.min + range.max) / 2, source: 'scraped_ticket_range' };
    if (range?.min) return { value: range.min, source: 'scraped_ticket_range' };
    if (range?.max) return { value: range.max, source: 'scraped_ticket_range' };

    const venue = await prisma.venue.findFirst({
      where: {
        name: { equals: event.venue_name, mode: 'insensitive' },
        city: { equals: event.city, mode: 'insensitive' },
        country: { equals: event.country, mode: 'insensitive' },
      },
    });
    if (venue?.avgTicketPrice) return { value: Number(venue.avgTicketPrice), source: 'venue_db' };

    const historical = await prisma.concert.findMany({
      where: {
        avgTicketPrice: { not: null },
        city: { equals: event.city, mode: 'insensitive' },
        country: { equals: event.country, mode: 'insensitive' },
      },
      select: { avgTicketPrice: true },
      take: 50,
    });

    const historicalPrices = historical
      .map((concert) => Number(concert.avgTicketPrice))
      .filter((price) => Number.isFinite(price) && price > 0);

    if (historicalPrices.length) {
      return {
        value: historicalPrices.reduce((sum, value) => sum + value, 0) / historicalPrices.length,
        source: 'city_history',
      };
    }

    return {
      value: this.defaultTicketPrice(event.country),
      source: 'country_default',
    };
  }

  private async persistPredictedConcert(
    event: NormalizedConcertEvent,
    canonicalEventId: string,
    validation: HybridValidationResult,
    prediction: RevenuePredictionResult,
    artist?: IntelligenceArtist
  ): Promise<Concert | undefined> {
    const resolvedArtist = artist ?? await this.resolveArtistForEvent(event);
    if (!resolvedArtist) return undefined;

    const existing = await this.findExistingConcert(event, resolvedArtist.id);
    const tiers = this.ticketTiers(prediction.features.avg_ticket_price);
    const verificationStatus = validation.validation_status === EventValidationStatus.VALIDATED
      ? ConcertVerificationStatus.VERIFIED
      : ConcertVerificationStatus.RESEARCHING;
    const predictionInputs = await this.resolvePredictionInputs(event);

    const data: Prisma.ConcertUncheckedUpdateInput = {
      artistName: resolvedArtist.artistName,
      concertDate: event.event_date,
      city: event.city,
      country: event.country,
      venueName: event.venue_name,
      capacity: prediction.features.venue_capacity,
      ticketsSold: prediction.expected_attendance,
      avgTicketPrice: prediction.features.avg_ticket_price,
      totalRevenue: prediction.expected_revenue,
      currency: this.resolveCurrency(event.country, event.ticket_price_range?.currency),
      source: String(event.source_platform),
      sourceUrl: event.source_url,
      verificationStatus,
      verifiedAt: verificationStatus === ConcertVerificationStatus.VERIFIED ? new Date() : undefined,
      researchNotes: validation.validation_reasons.join('; '),
      notes: JSON.stringify({
        canonical_event_id: canonicalEventId,
        source_event_id: event.source_event_id,
        official_ticket_url: event.official_ticket_url,
        validation_status: validation.validation_status,
        validation_confidence: validation.confidence_score,
        fraud_risk_score: validation.fraud_risk_score,
        prediction_model: prediction.model_version,
        prediction_inputs: predictionInputs,
        expected_revenue: prediction.expected_revenue,
        expected_attendance: prediction.expected_attendance,
        sellout_probability: prediction.sellout_probability,
      }),
      ticketPriceVip: tiers.vip,
      ticketPriceTier1: tiers.tier1,
      ticketPriceTier2: tiers.tier2,
      ticketPriceTier3: tiers.tier3,
      artistCityPopularity: prediction.features.local_popularity,
      demandScore: prediction.demand_score,
    };

    const concert = existing
      ? await prisma.concert.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.concert.create({
          data: {
            artistId: resolvedArtist.id,
            ...data,
          } as Prisma.ConcertUncheckedCreateInput,
        });

    await Promise.all([
      prisma.canonicalEvent.update({
        where: { id: canonicalEventId },
        data: { concertId: concert.id },
      }),
      prisma.validationLog.updateMany({
        where: { canonicalEventId, concertId: null },
        data: { concertId: concert.id },
      }),
      prisma.predictionOutput.updateMany({
        where: { canonicalEventId, concertId: null },
        data: { concertId: concert.id },
      }),
      prisma.featureSnapshot.updateMany({
        where: { canonicalEventId, concertId: null },
        data: { concertId: concert.id, artistId: resolvedArtist.id },
      }),
    ]);

    return concert;
  }

  private async resolveArtistForEvent(event: NormalizedConcertEvent): Promise<IntelligenceArtist | null> {
    return prisma.artist.findFirst({
      where: {
        active: true,
        artistName: { equals: event.artist_name, mode: 'insensitive' },
      },
      select: {
        id: true,
        artistName: true,
      },
    });
  }

  private async findExistingConcert(event: NormalizedConcertEvent, artistId: string): Promise<Concert | null> {
    const matchers: Prisma.ConcertWhereInput[] = [
      {
        concertDate: event.event_date,
        city: { equals: event.city, mode: 'insensitive' },
        venueName: { equals: event.venue_name, mode: 'insensitive' },
      },
    ];

    if (event.source_url) matchers.unshift({ sourceUrl: event.source_url });
    if (event.source_event_id) matchers.unshift({ notes: { contains: `"source_event_id":"${event.source_event_id}"` } });

    return prisma.concert.findFirst({
      where: {
        artistId,
        OR: matchers,
      },
      orderBy: { created_at: 'asc' },
    });
  }

  private estimateVenueCapacity(venueName: string): number {
    const normalized = venueName.toLowerCase();
    if (/\bstadium\b/.test(normalized)) return 45_000;
    if (/\barena\b/.test(normalized)) return 15_000;
    if (/\bamphitheatre\b|\bamphitheater\b/.test(normalized)) return 8_000;
    if (/\btheatre\b|\btheater\b|\bauditorium\b/.test(normalized)) return 2_500;
    if (/\bclub\b|\blounge\b|\bbar\b/.test(normalized)) return 700;
    if (/\bfestival\b|\bfairground\b/.test(normalized)) return 25_000;
    if (/\bhall\b|\bcentre\b|\bcenter\b/.test(normalized)) return 3_500;
    return 5_000;
  }

  private defaultTicketPrice(country: string): number {
    const normalized = country.toLowerCase();
    if (normalized.includes('india')) return 1_250;
    if (normalized.includes('united states') || normalized === 'usa') return 65;
    if (normalized.includes('united kingdom')) return 50;
    if (normalized.includes('australia')) return 75;
    if (normalized.includes('canada')) return 70;
    if (this.isEuroCountry(normalized)) return 55;
    return 45;
  }

  private ticketTiers(avgTicketPrice: number): { vip: number; tier1: number; tier2: number; tier3: number } {
    return {
      vip: Math.round(avgTicketPrice * 2.5),
      tier1: Math.round(avgTicketPrice * 1.35),
      tier2: Math.round(avgTicketPrice),
      tier3: Math.round(avgTicketPrice * 0.65),
    };
  }

  private resolveCurrency(country: string, scrapedCurrency?: string): string {
    if (scrapedCurrency && /^[A-Z]{3}$/.test(scrapedCurrency)) return scrapedCurrency;
    const normalized = country.toLowerCase();
    if (normalized.includes('india')) return 'INR';
    if (normalized.includes('united states') || normalized === 'usa') return 'USD';
    if (normalized.includes('united kingdom')) return 'GBP';
    if (normalized.includes('australia')) return 'AUD';
    if (normalized.includes('canada')) return 'CAD';
    if (this.isEuroCountry(normalized)) return 'EUR';
    return 'USD';
  }

  private isEuroCountry(normalizedCountry: string): boolean {
    return [
      'austria',
      'belgium',
      'finland',
      'france',
      'germany',
      'ireland',
      'italy',
      'netherlands',
      'portugal',
      'spain',
    ].some((country) => normalizedCountry.includes(country));
  }
}

export const concertIntelligenceService = new ConcertIntelligenceService();
