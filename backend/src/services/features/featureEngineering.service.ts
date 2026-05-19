import { DemographicDimension, Prisma } from '@prisma/client';
import { prisma, redis } from '../../utils/database';
import { ConcertFeatureSet, FeatureEngineeringInput } from './types';

const FEATURE_SET_VERSION = 'concert-intelligence-features-v1';
const CACHE_TTL_SECONDS = 60 * 15;

export class FeatureEngineeringService {
  async buildFeatures(input: FeatureEngineeringInput): Promise<ConcertFeatureSet> {
    const cacheKey = this.cacheKey(input);
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as ConcertFeatureSet;

    const artist = await this.resolveArtist(input);
    const [artistMomentum, cityDemand, venuePerformance, ticketPricing, seasonal, engagementVelocity] =
      await Promise.all([
        this.calculateArtistMomentum(artist?.id),
        this.calculateCityDemand(artist?.id, input.city, input.country),
        this.calculateVenuePerformance(input.venueName, input.city, input.country),
        this.calculateTicketPricingIntelligence(input.avgTicketPrice, input.city, input.country),
        this.calculateSeasonalTrends(input.eventDate),
        this.calculateEngagementVelocity(artist?.id),
      ]);

    const globalPopularity = artist ? this.calculateGlobalPopularity(artist) : 45;
    const localPopularity = this.clamp(globalPopularity * 0.52 + cityDemand * 0.32 + artistMomentum * 0.16, 0, 100);
    const venueCapacity = Math.max(100, Math.round(input.venueCapacity || await this.resolveVenueCapacity(input)));
    const avgTicketPrice = Math.max(1, input.avgTicketPrice || await this.resolveAverageTicketPrice(input));

    const features: ConcertFeatureSet = {
      artist_momentum: this.round(artistMomentum, 2),
      city_demand: this.round(cityDemand, 2),
      venue_performance: this.round(venuePerformance, 2),
      ticket_pricing_intelligence: this.round(ticketPricing, 2),
      seasonal_trends: this.round(seasonal, 2),
      engagement_velocity: this.round(engagementVelocity, 2),
      global_popularity: this.round(globalPopularity, 2),
      local_popularity: this.round(localPopularity, 2),
      venue_capacity: venueCapacity,
      avg_ticket_price: this.round(avgTicketPrice, 2),
      days_until_event: this.daysUntil(input.eventDate),
      is_weekend: [0, 5, 6].includes(input.eventDate.getUTCDay()),
      feature_set_version: FEATURE_SET_VERSION,
    };

    await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(features));
    await this.storeSnapshot(input, artist?.id, features);

    return features;
  }

  private async resolveArtist(input: FeatureEngineeringInput) {
    if (input.artistId) {
      return prisma.artist.findUnique({
        where: { id: input.artistId },
        include: { platformMetrics: { orderBy: { metricDate: 'desc' }, take: 30 } },
      });
    }

    return prisma.artist.findFirst({
      where: { artistName: { equals: input.artistName, mode: 'insensitive' } },
      include: { platformMetrics: { orderBy: { metricDate: 'desc' }, take: 30 } },
    });
  }

  private async calculateArtistMomentum(artistId?: string): Promise<number> {
    if (!artistId) return 45;

    const metrics = await prisma.platformMetric.findMany({
      where: { artistId },
      orderBy: { metricDate: 'desc' },
      take: 30,
    });

    if (metrics.length === 0) return 45;

    const rogValues = metrics.flatMap((metric) => [
      this.toNumber(metric.rogDaily),
      this.toNumber(metric.rogWeekly) / 7,
      this.toNumber(metric.rogMonthly) / 30,
    ]).filter((value) => value !== 0);

    if (rogValues.length === 0) return 50;

    const avgRog = rogValues.reduce((sum, value) => sum + value, 0) / rogValues.length;
    return this.clamp(50 + avgRog * 9, 0, 100);
  }

  private async calculateCityDemand(
    artistId: string | undefined,
    city: string,
    country?: string
  ): Promise<number> {
    const where: Prisma.ConcertWhereInput = {
      city: { equals: city, mode: 'insensitive' },
      ...(country ? { country: { equals: country, mode: 'insensitive' } } : {}),
    };

    const [cityConcerts, artistCityConcerts, demographic] = await Promise.all([
      prisma.concert.findMany({
        where,
        select: { capacity: true, ticketsSold: true, totalRevenue: true },
        take: 200,
      }),
      artistId
        ? prisma.concert.count({ where: { ...where, artistId } })
        : Promise.resolve(0),
      artistId
        ? prisma.audienceDemographic.findFirst({
            where: {
              artistId,
              dimension: DemographicDimension.GEOGRAPHY,
              dimensionValue: { contains: city, mode: 'insensitive' },
            },
            orderBy: { metricDate: 'desc' },
          })
        : Promise.resolve(null),
    ]);

    if (cityConcerts.length === 0) {
      return this.cityMarketBoost(city) + (demographic?.percentage ? Number(demographic.percentage) : 35);
    }

    const sellThroughs = cityConcerts.map((concert) => {
      const capacity = concert.capacity || 0;
      if (!capacity) return 0.5;
      return this.clamp((concert.ticketsSold || 0) / capacity, 0, 1);
    });
    const avgSellThrough = sellThroughs.reduce((sum, value) => sum + value, 0) / sellThroughs.length;
    const demographicBoost = demographic?.percentage ? Math.min(18, Number(demographic.percentage) * 0.8) : 0;
    const historyBoost = Math.min(12, artistCityConcerts * 3);

    return this.clamp(avgSellThrough * 62 + this.cityMarketBoost(city) + demographicBoost + historyBoost, 0, 100);
  }

  private async calculateVenuePerformance(
    venueName?: string,
    city?: string,
    country?: string
  ): Promise<number> {
    if (!venueName || !city) return 50;

    const concerts = await prisma.concert.findMany({
      where: {
        venueName: { equals: venueName, mode: 'insensitive' },
        city: { equals: city, mode: 'insensitive' },
        ...(country ? { country: { equals: country, mode: 'insensitive' } } : {}),
      },
      select: { capacity: true, ticketsSold: true, totalRevenue: true },
      take: 100,
    });

    if (concerts.length === 0) {
      const venue = await prisma.venue.findFirst({
        where: {
          name: { equals: venueName, mode: 'insensitive' },
          city: { equals: city, mode: 'insensitive' },
          ...(country ? { country: { equals: country, mode: 'insensitive' } } : {}),
        },
      });
      return venue?.verified ? 58 : 48;
    }

    const avgSellThrough = concerts.reduce((sum, concert) => {
      const capacity = concert.capacity || 0;
      return sum + (capacity ? this.clamp(concert.ticketsSold / capacity, 0, 1) : 0.5);
    }, 0) / concerts.length;

    return this.clamp(avgSellThrough * 76 + Math.min(12, concerts.length), 0, 100);
  }

  private async calculateTicketPricingIntelligence(
    avgTicketPrice?: number,
    city?: string,
    country?: string
  ): Promise<number> {
    const price = avgTicketPrice || 0;
    if (!price) return 50;

    const concerts = await prisma.concert.findMany({
      where: {
        avgTicketPrice: { not: null },
        ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}),
        ...(country ? { country: { equals: country, mode: 'insensitive' } } : {}),
      },
      select: { avgTicketPrice: true },
      take: 100,
    });

    if (concerts.length < 3) return 55;

    const marketAvg = concerts.reduce((sum, concert) => sum + this.toNumber(concert.avgTicketPrice), 0) / concerts.length;
    if (!marketAvg) return 50;

    const ratio = price / marketAvg;
    if (ratio >= 0.75 && ratio <= 1.25) return 78;
    if (ratio > 1.25 && ratio <= 1.55) return 64;
    if (ratio < 0.75 && ratio >= 0.5) return 68;
    return 42;
  }

  private calculateSeasonalTrends(eventDate: Date): number {
    const month = eventDate.getUTCMonth();
    const day = eventDate.getUTCDay();
    const monthBoosts = new Map<number, number>([
      [10, 12],
      [11, 16],
      [0, 8],
      [1, 6],
      [2, 4],
      [9, 7],
    ]);
    const weekendBoost = [0, 5, 6].includes(day) ? 10 : 0;
    return this.clamp(48 + (monthBoosts.get(month) ?? 0) + weekendBoost, 0, 100);
  }

  private async calculateEngagementVelocity(artistId?: string): Promise<number> {
    if (!artistId) return 45;

    const metrics = await prisma.platformMetric.findMany({
      where: { artistId },
      orderBy: { metricDate: 'desc' },
      take: 14,
    });

    if (metrics.length < 2) return 50;

    const latestEngagement = this.engagement(metrics[0]);
    const oldestEngagement = this.engagement(metrics[metrics.length - 1]);
    if (oldestEngagement <= 0) return 55;

    const growth = (latestEngagement - oldestEngagement) / oldestEngagement;
    return this.clamp(50 + growth * 45, 0, 100);
  }

  private calculateGlobalPopularity(artist: {
    instagramFollowers: bigint | number | null;
    facebookFollowers: bigint | number | null;
    twitterFollowers: bigint | number | null;
    spotifyMonthlyListeners: bigint | number | null;
    youtubeSubscribers: bigint | number | null;
    appleMusicListeners: bigint | number | null;
  }): number {
    const weightedReach =
      this.toNumber(artist.spotifyMonthlyListeners) * 1.2 +
      this.toNumber(artist.youtubeSubscribers) +
      this.toNumber(artist.instagramFollowers) * 0.8 +
      this.toNumber(artist.facebookFollowers) * 0.45 +
      this.toNumber(artist.twitterFollowers) * 0.35 +
      this.toNumber(artist.appleMusicListeners) * 0.8;

    if (weightedReach <= 0) return 45;
    return this.clamp(Math.log10(weightedReach + 1) * 11, 5, 100);
  }

  private async resolveVenueCapacity(input: FeatureEngineeringInput): Promise<number> {
    if (input.venueName && input.city) {
      const venue = await prisma.venue.findFirst({
        where: {
          name: { equals: input.venueName, mode: 'insensitive' },
          city: { equals: input.city, mode: 'insensitive' },
          ...(input.country ? { country: { equals: input.country, mode: 'insensitive' } } : {}),
        },
      });
      const capacity = venue?.avgCapacity || venue?.capacityMax || venue?.capacityMin;
      if (capacity) return capacity;
    }

    return 5_000;
  }

  private async resolveAverageTicketPrice(input: FeatureEngineeringInput): Promise<number> {
    const historical = await prisma.concert.findMany({
      where: {
        avgTicketPrice: { not: null },
        city: { equals: input.city, mode: 'insensitive' },
        ...(input.country ? { country: { equals: input.country, mode: 'insensitive' } } : {}),
      },
      select: { avgTicketPrice: true },
      take: 50,
    });

    if (historical.length === 0) return input.country?.toLowerCase().includes('india') ? 1_250 : 45;

    return historical.reduce((sum, concert) => sum + this.toNumber(concert.avgTicketPrice), 0) / historical.length;
  }

  private async storeSnapshot(
    input: FeatureEngineeringInput,
    artistId: string | undefined,
    features: ConcertFeatureSet
  ): Promise<void> {
    await prisma.featureSnapshot.create({
      data: {
        canonicalEventId: input.canonicalEventId,
        artistId,
        concertId: input.concertId,
        featureSetVersion: FEATURE_SET_VERSION,
        features: features as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private cacheKey(input: FeatureEngineeringInput): string {
    return [
      'features',
      FEATURE_SET_VERSION,
      input.artistId || input.artistName.toLowerCase(),
      input.city.toLowerCase(),
      input.venueName?.toLowerCase() || 'venue',
      input.eventDate.toISOString().slice(0, 10),
      input.avgTicketPrice || 'price',
      input.venueCapacity || 'capacity',
    ].join(':');
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
    return majorMarkets.has(city.toLowerCase()) ? 10 : 0;
  }

  private engagement(metric: { likes: bigint; comments: bigint; shares: bigint; streams: bigint }): number {
    return (
      this.toNumber(metric.likes) +
      this.toNumber(metric.comments) * 2 +
      this.toNumber(metric.shares) * 3 +
      this.toNumber(metric.streams) * 0.1
    );
  }

  private daysUntil(date: Date): number {
    return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
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

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}

export const featureEngineeringService = new FeatureEngineeringService();
