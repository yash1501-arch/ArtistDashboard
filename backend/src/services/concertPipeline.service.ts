import { Concert, ConcertVerificationStatus, DemographicDimension, Prisma } from '@prisma/client';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import { calculateArtistPopularity } from '../utils/artistPopularity';
import { prisma } from '../utils/database';

dotenv.config({
  path: path.join(process.cwd(), 'ml_engine', '.env'),
  override: false,
});

type SupportedConcertSource = 'SETLIST_FM';

export interface ScrapedConcert {
  artistId: string;
  artistName: string;
  sourceArtistName?: string;
  concertDate: Date;
  city: string;
  state?: string;
  country: string;
  latitude?: number;
  longitude?: number;
  venueName: string;
  source: SupportedConcertSource;
  sourceUrl: string;
  sourceEventId?: string;
  tourName?: string;
}

export interface ConcertPipelineOptions {
  artistIds?: string[];
  startYear?: number;
  endYear?: number;
  sources?: SupportedConcertSource[];
  maxPagesPerYear?: number;
  dryRun?: boolean;
}

interface HybridValidationResult {
  valid: boolean;
  confidence: number;
  reasons: string[];
  matchingConcertId?: string;
}

interface VenueResearchResult {
  capacity: number;
  capacityMin?: number;
  capacityMax?: number;
  venueType?: string;
  source: string;
  sourceUrl?: string;
  verified: boolean;
  notes: string;
}

interface PricingModelOutput {
  pricing_tiers: {
    vip: number;
    tier1: number;
    tier2: number;
    tier3: number;
  };
  avg_ticket_price: number;
  tickets_sold: number;
  total_revenue: number;
  demand_score?: number;
  status: string;
  model_version?: string;
}

interface ProcessedConcertResult {
  artistId: string;
  artistName: string;
  concertDate: string;
  venueName: string;
  city: string;
  source: SupportedConcertSource;
  action: 'created' | 'updated' | 'validated' | 'skipped';
  concert?: Concert;
  reason?: string;
}

export interface ConcertPipelineSummary {
  artistsProcessed: number;
  scrapedCount: number;
  validatedCount: number;
  storedCount: number;
  skippedCount: number;
  concerts: Concert[];
  results: ProcessedConcertResult[];
  errors: string[];
}

interface SetlistFmSetlist {
  id?: string;
  eventDate?: string;
  url?: string;
  artist?: {
    name?: string;
  };
  venue?: {
    id?: string;
    name?: string;
    url?: string;
    city?: {
      name?: string;
      state?: string;
      country?: {
        name?: string;
        code?: string;
      };
      coords?: {
        lat?: number | string;
        long?: number | string;
      };
    };
  };
  tour?: {
    name?: string;
  };
}

interface SetlistFmResponse {
  setlist?: SetlistFmSetlist[] | SetlistFmSetlist;
  total?: number;
  page?: number;
  itemsPerPage?: number;
}

export class ConcertPipelineService {
  private readonly scriptPath = path.join(process.cwd(), 'ml_engine', 'processor.py');
  private readonly defaultStartYear = 2021;

  async runPipelineForArtist(
    artistId: string,
    options: Omit<ConcertPipelineOptions, 'artistIds'> = {}
  ): Promise<Concert[]> {
    const summary = await this.runPipeline({ ...options, artistIds: [artistId] });
    return summary.concerts;
  }

  async runPipeline(options: ConcertPipelineOptions = {}): Promise<ConcertPipelineSummary> {
    const startYear = options.startYear ?? this.defaultStartYear;
    const endYear = options.endYear ?? new Date().getFullYear();
    const sources: SupportedConcertSource[] = options.sources?.length ? options.sources : ['SETLIST_FM'];
    const maxPagesPerYear = options.maxPagesPerYear ?? this.readPositiveIntEnv('SETLISTFM_MAX_PAGES_PER_YEAR', 10);

    if (startYear < 1900 || startYear > endYear) {
      throw new Error('Invalid year range for concert scraping');
    }

    const artists = await prisma.artist.findMany({
      where: {
        active: true,
        ...(options.artistIds?.length ? { id: { in: options.artistIds } } : {}),
      },
      include: {
        platformMetrics: {
          orderBy: { metricDate: 'desc' },
          take: 20,
        },
      },
      orderBy: { artistName: 'asc' },
    });

    if (options.artistIds?.length && artists.length === 0) {
      throw new Error('No matching active artists found');
    }

    const summary: ConcertPipelineSummary = {
      artistsProcessed: 0,
      scrapedCount: 0,
      validatedCount: 0,
      storedCount: 0,
      skippedCount: 0,
      concerts: [],
      results: [],
      errors: [],
    };

    for (const artist of artists) {
      summary.artistsProcessed++;

      try {
        const scrapedEvents = await this.scrapeFromPlatforms(artist, {
          startYear,
          endYear,
          sources,
          maxPagesPerYear,
        });
        summary.scrapedCount += scrapedEvents.length;

        for (const event of scrapedEvents) {
          const validation = await this.validateHybrid(event, artist, startYear, endYear);
          if (!validation.valid) {
            summary.skippedCount++;
            summary.results.push(this.toResult(event, 'skipped', undefined, validation.reasons.join('; ')));
            continue;
          }

          summary.validatedCount++;

          if (options.dryRun) {
            summary.results.push(this.toResult(event, 'validated'));
            continue;
          }

          const storedConcert = await this.storeValidatedConcert(event, artist, validation);
          summary.storedCount++;
          summary.concerts.push(storedConcert.concert);
          summary.results.push(this.toResult(event, storedConcert.action, storedConcert.concert));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.errors.push(`${artist.artistName}: ${message}`);
      }
    }

    return summary;
  }

  private async scrapeFromPlatforms(
    artist: { id: string; artistName: string },
    options: Required<Pick<ConcertPipelineOptions, 'startYear' | 'endYear' | 'sources' | 'maxPagesPerYear'>>
  ): Promise<ScrapedConcert[]> {
    const allEvents: ScrapedConcert[] = [];

    if (options.sources.includes('SETLIST_FM')) {
      const setlistEvents = await this.scrapeSetlistFm(
        artist.artistName,
        artist.id,
        options.startYear,
        options.endYear,
        options.maxPagesPerYear
      );
      allEvents.push(...setlistEvents);
    }

    return this.dedupeScrapedEvents(allEvents);
  }

  private async scrapeSetlistFm(
    artistName: string,
    artistId: string,
    startYear: number,
    endYear: number,
    maxPagesPerYear: number
  ): Promise<ScrapedConcert[]> {
    const apiKey =
      process.env.SETLISTFM_API_KEY ||
      process.env.SETLIST_FM_API_KEY ||
      process.env.SETLIST_API_KEY;
    if (!apiKey) {
      throw new Error('SETLISTFM_API_KEY or SETLIST_API_KEY is required to scrape setlist.fm');
    }

    const client = this.createSetlistClient(apiKey);
    const events: ScrapedConcert[] = [];

    for (let year = startYear; year <= endYear; year++) {
      let page = 1;

      while (page <= maxPagesPerYear) {
        const response = await this.getSetlistFmPage(client, artistName, year, page);
        if (!response) break;

        const pageEvents = this.mapSetlistFmEvents(response, artistId, artistName);
        events.push(...pageEvents);

        const total = Number(response.total ?? 0);
        const itemsPerPage = Number(response.itemsPerPage ?? (pageEvents.length || 20));
        const currentPage = Number(response.page ?? page);
        const totalPages = total > 0 ? Math.ceil(total / itemsPerPage) : currentPage;

        if (pageEvents.length === 0 || currentPage >= totalPages) break;

        page++;
        await this.delay(250);
      }
    }

    return events;
  }

  private async getSetlistFmPage(
    client: AxiosInstance,
    artistName: string,
    year: number,
    page: number
  ): Promise<SetlistFmResponse | null> {
    try {
      const response = await client.get<SetlistFmResponse>('/search/setlists', {
        params: {
          artistName,
          year,
          p: page,
        },
      });

      return response.data;
    } catch (error) {
      if (this.isSetlistFmNotFound(error)) {
        return null;
      }

      throw error;
    }
  }

  private createSetlistClient(apiKey: string): AxiosInstance {
    return axios.create({
      baseURL: 'https://api.setlist.fm/rest/1.0',
      timeout: 20_000,
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
        'x-api-key': apiKey,
      },
    });
  }

  private isSetlistFmNotFound(error: unknown): boolean {
    return axios.isAxiosError(error) && (error as AxiosError).response?.status === 404;
  }

  private mapSetlistFmEvents(
    data: SetlistFmResponse,
    artistId: string,
    requestedArtistName: string
  ): ScrapedConcert[] {
    const setlists = Array.isArray(data.setlist)
      ? data.setlist
      : data.setlist
        ? [data.setlist]
        : [];

    return setlists.flatMap((setlist) => {
      const concertDate = this.parseSetlistFmDate(setlist.eventDate);
      const venue = setlist.venue;
      const city = venue?.city;
      const venueName = venue?.name?.trim();
      const cityName = city?.name?.trim();
      const country = city?.country?.name?.trim() || city?.country?.code?.trim();
      const sourceUrl = setlist.url || venue?.url;

      if (!concertDate || !venueName || !cityName || !country || !sourceUrl) return [];

      return [{
        artistId,
        artistName: requestedArtistName,
        sourceArtistName: setlist.artist?.name,
        concertDate,
        city: cityName,
        state: city?.state,
        country,
        latitude: this.toOptionalNumber(city?.coords?.lat),
        longitude: this.toOptionalNumber(city?.coords?.long),
        venueName,
        source: 'SETLIST_FM' as const,
        sourceUrl,
        sourceEventId: setlist.id,
        tourName: setlist.tour?.name,
      }];
    });
  }

  private async validateHybrid(
    event: ScrapedConcert,
    artist: { id: string; artistName: string },
    startYear: number,
    endYear: number
  ): Promise<HybridValidationResult> {
    const reasons: string[] = [];
    let confidence = event.source === 'SETLIST_FM' ? 0.45 : 0.25;

    const year = event.concertDate.getUTCFullYear();
    if (Number.isNaN(event.concertDate.getTime())) {
      reasons.push('invalid event date');
    } else if (year < startYear || year > endYear) {
      reasons.push(`outside requested year range ${startYear}-${endYear}`);
    } else {
      confidence += 0.15;
    }

    const artistScore = this.scoreArtistNameMatch(artist.artistName, event.sourceArtistName || event.artistName);
    if (artistScore < 0.72) {
      reasons.push(`weak artist match: ${event.sourceArtistName || 'unknown source artist'}`);
    } else {
      confidence += artistScore * 0.2;
    }

    if (!event.venueName || !event.city || !event.country) {
      reasons.push('missing venue or location');
    } else {
      confidence += 0.12;
    }

    if (event.sourceUrl) {
      confidence += 0.08;
    }

    const existing = await this.findExistingConcert(event, artist.id);
    if (existing) {
      confidence = Math.min(1, confidence + 0.08);
    }

    const roundedConfidence = this.round(confidence, 2);

    return {
      valid: reasons.length === 0 && roundedConfidence >= 0.75,
      confidence: roundedConfidence,
      reasons,
      matchingConcertId: existing?.id,
    };
  }

  private async storeValidatedConcert(
    event: ScrapedConcert,
    artist: {
      id: string;
      artistName: string;
      instagramFollowers: bigint | number | null;
      facebookFollowers: bigint | number | null;
      twitterFollowers: bigint | number | null;
      spotifyMonthlyListeners: bigint | number | null;
      youtubeSubscribers: bigint | number | null;
      appleMusicListeners: bigint | number | null;
    },
    validation: HybridValidationResult
  ): Promise<{ action: 'created' | 'updated'; concert: Concert }> {
    const venueInfo = await this.researchVenue(event.venueName, event.city, event.country);
    const cityPopularity = await this.calculateArtistCityPopularity(artist, event.city, event.country);
    const globalPopularity = await calculateArtistPopularity(artist);

    const modelInput = {
      artist_id: artist.id,
      artist_name: artist.artistName,
      artist_popularity: globalPopularity,
      artist_city_popularity: cityPopularity,
      venue_name: event.venueName,
      venue_capacity: venueInfo.capacity,
      city: event.city,
      country: event.country,
      concert_year: event.concertDate.getUTCFullYear(),
    };

    const modelOutput = await this.callMLProcessor(modelInput);
    const notes = {
      source_event_id: event.sourceEventId,
      source_artist_name: event.sourceArtistName,
      tour_name: event.tourName,
      validation_confidence: validation.confidence,
      pricing_tiers: modelOutput.pricing_tiers,
      demand_score: modelOutput.demand_score,
      model_version: modelOutput.model_version,
      venue_research: {
        source: venueInfo.source,
        source_url: venueInfo.sourceUrl,
        verified: venueInfo.verified,
        notes: venueInfo.notes,
      },
    };

    const concertData = {
      artistName: artist.artistName,
      concertDate: event.concertDate,
      city: event.city,
      state: event.state,
      country: event.country,
      latitude: event.latitude,
      longitude: event.longitude,
      venueName: event.venueName,
      capacity: venueInfo.capacity,
      ticketsSold: modelOutput.tickets_sold,
      avgTicketPrice: modelOutput.avg_ticket_price,
      totalRevenue: modelOutput.total_revenue,
      currency: this.resolveCurrency(event.country),
      source: event.source,
      sourceUrl: event.sourceUrl,
      verificationStatus: ConcertVerificationStatus.VERIFIED,
      verifiedAt: new Date(),
      researchNotes: venueInfo.notes,
      notes: JSON.stringify(notes),
      ticketPriceVip: modelOutput.pricing_tiers.vip,
      ticketPriceTier1: modelOutput.pricing_tiers.tier1,
      ticketPriceTier2: modelOutput.pricing_tiers.tier2,
      ticketPriceTier3: modelOutput.pricing_tiers.tier3,
      artistCityPopularity: cityPopularity,
      demandScore: modelOutput.demand_score,
    };

    const existing = validation.matchingConcertId
      ? await prisma.concert.findUnique({ where: { id: validation.matchingConcertId } })
      : await this.findExistingConcert(event, artist.id);

    if (existing) {
      const concert = await prisma.concert.update({
        where: { id: existing.id },
        data: concertData as Prisma.ConcertUncheckedUpdateInput,
      });
      return { action: 'updated', concert };
    }

    const concert = await prisma.concert.create({
      data: {
        artistId: artist.id,
        ...concertData,
      } as Prisma.ConcertUncheckedCreateInput,
    });

    return { action: 'created', concert };
  }

  private async researchVenue(name: string, city: string, country: string): Promise<VenueResearchResult> {
    const existing = await prisma.venue.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        city: { equals: city, mode: 'insensitive' },
        country: { equals: country, mode: 'insensitive' },
      },
    });

    const existingCapacity = existing?.avgCapacity || existing?.capacityMax || existing?.capacityMin;
    if (existing && existingCapacity) {
      return {
        capacity: existingCapacity,
        capacityMin: existing.capacityMin ?? undefined,
        capacityMax: existing.capacityMax ?? undefined,
        venueType: existing.venueType ?? undefined,
        source: existing.source || 'VENUE_DB',
        sourceUrl: existing.sourceUrl ?? undefined,
        verified: existing.verified,
        notes: `Found existing venue record for ${name}`,
      };
    }

    const wikidataVenue = await this.researchVenueFromWikidata(name, city, country);
    const researchedVenue = wikidataVenue ?? this.estimateVenueCapacity(name);

    await prisma.venue.upsert({
      where: {
        name_city_country: {
          name,
          city,
          country,
        },
      },
      update: {
        capacityMin: researchedVenue.capacityMin,
        capacityMax: researchedVenue.capacityMax,
        avgCapacity: researchedVenue.capacity,
        venueType: researchedVenue.venueType,
        verified: researchedVenue.verified,
        source: researchedVenue.source,
        sourceUrl: researchedVenue.sourceUrl,
        lastUpdated: new Date(),
      },
      create: {
        name,
        city,
        country,
        capacityMin: researchedVenue.capacityMin,
        capacityMax: researchedVenue.capacityMax,
        avgCapacity: researchedVenue.capacity,
        venueType: researchedVenue.venueType,
        verified: researchedVenue.verified,
        source: researchedVenue.source,
        sourceUrl: researchedVenue.sourceUrl,
      },
    });

    return researchedVenue;
  }

  private async researchVenueFromWikidata(
    name: string,
    city: string,
    country: string
  ): Promise<VenueResearchResult | null> {
    if (process.env.VENUE_RESEARCH_WIKIDATA_ENABLED === 'false') return null;

    try {
      const searchResponse = await axios.get('https://www.wikidata.org/w/api.php', {
        timeout: 12_000,
        headers: {
          'User-Agent': process.env.WIKIDATA_USER_AGENT || 'MAD-Dashboard/1.0 venue research',
        },
        params: {
          action: 'wbsearchentities',
          format: 'json',
          language: 'en',
          type: 'item',
          limit: 5,
          search: `${name} ${city} ${country}`,
          origin: '*',
        },
      });

      const searchResults = Array.isArray(searchResponse.data?.search) ? searchResponse.data.search : [];
      const ids = searchResults
        .map((result: { id?: string }) => result.id)
        .filter((id: string | undefined): id is string => Boolean(id));

      if (ids.length === 0) return null;

      const entityResponse = await axios.get('https://www.wikidata.org/w/api.php', {
        timeout: 12_000,
        headers: {
          'User-Agent': process.env.WIKIDATA_USER_AGENT || 'MAD-Dashboard/1.0 venue research',
        },
        params: {
          action: 'wbgetentities',
          format: 'json',
          ids: ids.join('|'),
          props: 'claims|labels|descriptions',
          languages: 'en',
          origin: '*',
        },
      });

      const entities = entityResponse.data?.entities ?? {};
      for (const id of ids) {
        const entity = entities[id];
        const capacity = this.extractWikidataCapacity(entity);
        if (!capacity) continue;

        const label = entity?.labels?.en?.value || name;
        const description = entity?.descriptions?.en?.value;

        return {
          capacity,
          capacityMin: Math.round(capacity * 0.9),
          capacityMax: capacity,
          venueType: this.inferVenueType(name, description),
          source: 'WIKIDATA',
          sourceUrl: `https://www.wikidata.org/wiki/${id}`,
          verified: true,
          notes: `Wikidata capacity match: ${label}${description ? ` (${description})` : ''}`,
        };
      }

      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Wikidata venue research failed for ${name}: ${message}`);
      return null;
    }
  }

  private extractWikidataCapacity(entity: unknown): number | null {
    const claims = (entity as { claims?: Record<string, unknown[]> } | undefined)?.claims?.P1083;
    if (!Array.isArray(claims)) return null;

    for (const claim of claims) {
      const value = (claim as {
        mainsnak?: {
          datavalue?: {
            value?: {
              amount?: string;
            };
          };
        };
      }).mainsnak?.datavalue?.value;

      const amount = value?.amount ? Number(value.amount.replace('+', '')) : NaN;
      if (Number.isFinite(amount) && amount > 0) {
        return Math.round(amount);
      }
    }

    return null;
  }

  private estimateVenueCapacity(name: string): VenueResearchResult {
    const venueType = this.inferVenueType(name);
    const capacityByType: Record<string, number> = {
      Stadium: 45_000,
      Arena: 15_000,
      Amphitheatre: 8_000,
      Theater: 2_500,
      Club: 700,
      Hall: 3_500,
      Festival: 25_000,
      Venue: 5_000,
    };

    const capacity = capacityByType[venueType] ?? capacityByType.Venue;

    return {
      capacity,
      capacityMin: Math.round(capacity * 0.75),
      capacityMax: Math.round(capacity * 1.2),
      venueType,
      source: 'HEURISTIC_ESTIMATE',
      verified: false,
      notes: `Estimated capacity from venue name/type: ${venueType}`,
    };
  }

  private async calculateArtistCityPopularity(
    artist: {
      id: string;
      instagramFollowers: bigint | number | null;
      facebookFollowers: bigint | number | null;
      twitterFollowers: bigint | number | null;
      spotifyMonthlyListeners: bigint | number | null;
      youtubeSubscribers: bigint | number | null;
      appleMusicListeners: bigint | number | null;
    },
    city: string,
    country: string
  ): Promise<number> {
    const globalPopularity = await calculateArtistPopularity(artist);

    const geography = await prisma.audienceDemographic.findFirst({
      where: {
        artistId: artist.id,
        dimension: DemographicDimension.GEOGRAPHY,
        dimensionValue: { contains: city, mode: 'insensitive' },
      },
      orderBy: { metricDate: 'desc' },
    });

    const demographicBoost = geography?.percentage ? Number(geography.percentage) * 0.8 : 0;

    const [cityConcerts, countryConcerts, totalConcerts] = await Promise.all([
      prisma.concert.count({
        where: {
          artistId: artist.id,
          city: { equals: city, mode: 'insensitive' },
        },
      }),
      prisma.concert.count({
        where: {
          artistId: artist.id,
          country: { equals: country, mode: 'insensitive' },
        },
      }),
      prisma.concert.count({ where: { artistId: artist.id } }),
    ]);

    const cityHistoryBoost = totalConcerts > 0 ? Math.min(18, (cityConcerts / totalConcerts) * 45) : 0;
    const countryHistoryBoost = totalConcerts > 0 ? Math.min(10, (countryConcerts / totalConcerts) * 20) : 0;
    const marketBoost = this.cityMarketBoost(city);

    return this.round(
      this.clamp(globalPopularity * 0.68 + demographicBoost + cityHistoryBoost + countryHistoryBoost + marketBoost, 5, 100),
      2
    );
  }

  private async callMLProcessor(input: Record<string, unknown>): Promise<PricingModelOutput> {
    const pythonPath = process.env.PYTHON_PATH || 'python';

    try {
      return await new Promise<PricingModelOutput>((resolve, reject) => {
        const py = spawn(pythonPath, [this.scriptPath, JSON.stringify(input)]);
        let dataString = '';
        let errorString = '';

        py.stdout.on('data', (data: Buffer) => {
          dataString += data.toString();
        });

        py.stderr.on('data', (data: Buffer) => {
          errorString += data.toString();
        });

        py.on('error', (error) => {
          reject(error);
        });

        py.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(errorString || `Python process exited with code ${code}`));
            return;
          }

          try {
            resolve(JSON.parse(dataString) as PricingModelOutput);
          } catch {
            reject(new Error(`Failed to parse Python output: ${dataString}`));
          }
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`ML processor failed, using TypeScript fallback: ${message}`);
      return this.calculateFallbackPricing(input);
    }
  }

  private calculateFallbackPricing(input: Record<string, unknown>): PricingModelOutput {
    const artistPopularity = this.toNumber(input.artist_popularity);
    const cityPopularity = this.toNumber(input.artist_city_popularity) || artistPopularity;
    const venueCapacity = Math.max(100, Math.round(this.toNumber(input.venue_capacity) || 5_000));
    const city = String(input.city || '');

    const marketMultiplier = 1 + this.cityMarketBoost(city) / 100;
    const scarcityMultiplier = venueCapacity < 1_000 ? 1.18 : venueCapacity > 20_000 ? 0.88 : 1;
    const basePrice = Math.max(250, (350 + artistPopularity * 14 + cityPopularity * 9) * marketMultiplier * scarcityMultiplier);

    const pricingTiers = {
      vip: Math.round(basePrice * 3.1),
      tier1: Math.round(basePrice * 1.55),
      tier2: Math.round(basePrice),
      tier3: Math.round(basePrice * 0.62),
    };

    const avgTicketPrice = this.weightedAverageTicketPrice(pricingTiers);
    const demandScore = this.clamp(cityPopularity * 0.72 + artistPopularity * 0.18 + this.cityMarketBoost(city), 5, 100);
    const sellThrough = this.clamp(0.22 + demandScore / 125, 0.15, 0.97);
    const ticketsSold = Math.min(venueCapacity, Math.round(venueCapacity * sellThrough));

    return {
      pricing_tiers: pricingTiers,
      avg_ticket_price: this.round(avgTicketPrice, 2),
      tickets_sold: ticketsSold,
      total_revenue: this.round(ticketsSold * avgTicketPrice, 2),
      demand_score: this.round(demandScore, 2),
      status: 'processed',
      model_version: 'typescript-fallback-v1',
    };
  }

  private async findExistingConcert(event: ScrapedConcert, artistId: string): Promise<Concert | null> {
    const matchers: Prisma.ConcertWhereInput[] = [
      {
        concertDate: event.concertDate,
        city: { equals: event.city, mode: 'insensitive' },
        venueName: { equals: event.venueName, mode: 'insensitive' },
      },
    ];

    if (event.sourceUrl) {
      matchers.unshift({ sourceUrl: event.sourceUrl });
    }

    if (event.sourceEventId) {
      matchers.unshift({ notes: { contains: `"source_event_id":"${event.sourceEventId}"` } });
    }

    return prisma.concert.findFirst({
      where: {
        artistId,
        OR: matchers,
      },
      orderBy: { created_at: 'asc' },
    });
  }

  private dedupeScrapedEvents(events: ScrapedConcert[]): ScrapedConcert[] {
    const seen = new Set<string>();
    const unique: ScrapedConcert[] = [];

    for (const event of events) {
      const key = [
        event.source,
        event.sourceEventId || event.sourceUrl,
        event.artistId,
        event.concertDate.toISOString().slice(0, 10),
        event.venueName.toLowerCase(),
        event.city.toLowerCase(),
      ].join('|');

      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(event);
    }

    return unique;
  }

  private toResult(
    event: ScrapedConcert,
    action: ProcessedConcertResult['action'],
    concert?: Concert,
    reason?: string
  ): ProcessedConcertResult {
    return {
      artistId: event.artistId,
      artistName: event.artistName,
      concertDate: event.concertDate.toISOString().slice(0, 10),
      venueName: event.venueName,
      city: event.city,
      source: event.source,
      action,
      concert,
      reason,
    };
  }

  private parseSetlistFmDate(value?: string): Date | null {
    if (!value) return null;
    const [day, month, year] = value.split('-').map((part) => Number(part));
    if (!day || !month || !year) return null;

    return new Date(Date.UTC(year, month - 1, day));
  }

  private scoreArtistNameMatch(expected: string, actual: string): number {
    const normalizedExpected = this.normalizeName(expected);
    const normalizedActual = this.normalizeName(actual);

    if (!normalizedExpected || !normalizedActual) return 0;
    if (normalizedExpected === normalizedActual) return 1;
    if (normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual)) return 0.86;

    const expectedTokens = new Set(normalizedExpected.split(' ').filter(Boolean));
    const actualTokens = new Set(normalizedActual.split(' ').filter(Boolean));
    const intersection = [...expectedTokens].filter((token) => actualTokens.has(token)).length;
    const union = new Set([...expectedTokens, ...actualTokens]).size;

    return union > 0 ? intersection / union : 0;
  }

  private normalizeName(value: string): string {
    return value
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\b(the|official|live|band)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private inferVenueType(name: string, description?: string): string {
    const value = `${name} ${description || ''}`.toLowerCase();
    if (/\bstadium\b/.test(value)) return 'Stadium';
    if (/\barena\b/.test(value)) return 'Arena';
    if (/\bamphitheatre\b|\bamphitheater\b/.test(value)) return 'Amphitheatre';
    if (/\btheatre\b|\btheater\b|\bauditorium\b/.test(value)) return 'Theater';
    if (/\bclub\b|\blounge\b|\bbar\b/.test(value)) return 'Club';
    if (/\bfestival\b|\bfairground\b/.test(value)) return 'Festival';
    if (/\bhall\b|\bcentre\b|\bcenter\b/.test(value)) return 'Hall';
    return 'Venue';
  }

  private cityMarketBoost(city: string): number {
    const majorMarkets = new Set([
      'mumbai',
      'delhi',
      'new delhi',
      'bangalore',
      'bengaluru',
      'hyderabad',
      'chennai',
      'pune',
      'kolkata',
      'new york',
      'los angeles',
      'london',
      'paris',
      'tokyo',
      'singapore',
      'dubai',
    ]);

    return majorMarkets.has(city.toLowerCase()) ? 8 : 0;
  }

  private weightedAverageTicketPrice(pricingTiers: PricingModelOutput['pricing_tiers']): number {
    return (
      pricingTiers.vip * 0.08 +
      pricingTiers.tier1 * 0.22 +
      pricingTiers.tier2 * 0.38 +
      pricingTiers.tier3 * 0.32
    );
  }

  private resolveCurrency(country: string): string {
    const configured = process.env.DEFAULT_CONCERT_CURRENCY;
    if (configured && /^[A-Z]{3}$/.test(configured)) return configured;

    const normalized = country.toLowerCase();
    if (normalized.includes('india')) return 'INR';
    if (normalized.includes('united states') || normalized === 'usa') return 'USD';
    if (normalized.includes('united kingdom')) return 'GBP';
    if (normalized.includes('euro') || ['france', 'germany', 'italy', 'spain', 'netherlands'].includes(normalized)) return 'EUR';
    if (normalized.includes('canada')) return 'CAD';
    if (normalized.includes('australia')) return 'AUD';

    return 'INR';
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private toOptionalNumber(value: unknown): number | undefined {
    const parsed = this.toNumber(value);
    return parsed || undefined;
  }

  private readPositiveIntEnv(key: string, fallback: number): number {
    const parsed = Number(process.env[key]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

export const concertPipelineService = new ConcertPipelineService();
