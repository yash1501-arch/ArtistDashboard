import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import {
  featureEngineeringService,
  FeatureEngineeringService,
} from '../features/featureEngineering.service';
import { RevenuePredictionInput, RevenuePredictionResult } from './types';

const MODEL_VERSION = 'hybrid-revenue-v1';

export class RevenuePredictionService {
  constructor(private readonly features: FeatureEngineeringService = featureEngineeringService) {}

  async predict(input: RevenuePredictionInput): Promise<RevenuePredictionResult> {
    const eventDate = input.event_date instanceof Date ? input.event_date : new Date(input.event_date);
    if (Number.isNaN(eventDate.getTime())) {
      throw new Error('event_date must be a valid date');
    }

    const featureSet = await this.features.buildFeatures({
      artistId: input.artistId,
      artistName: input.artist,
      city: input.city,
      country: input.country,
      venueName: input.venueName,
      venueCapacity: input.venue_capacity,
      avgTicketPrice: input.avg_ticket_price,
      eventDate,
      canonicalEventId: input.canonicalEventId,
      concertId: input.concertId,
    });

    const demandScore = this.calculateDemandScore(featureSet);
    const selloutProbability = this.calculateSelloutProbability(featureSet, demandScore);
    const expectedAttendance = Math.min(
      featureSet.venue_capacity,
      Math.max(0, Math.round(featureSet.venue_capacity * selloutProbability))
    );
    const expectedRevenue = expectedAttendance * featureSet.avg_ticket_price;

    const result: RevenuePredictionResult = {
      expected_revenue: this.round(expectedRevenue, 2),
      expected_attendance: expectedAttendance,
      sellout_probability: this.round(selloutProbability, 4),
      demand_score: this.round(demandScore, 2),
      model_version: MODEL_VERSION,
      features: featureSet,
    };

    await this.storePrediction(input, result);
    await this.storeTrainingDataIfHistorical(input, result);

    return result;
  }

  private calculateDemandScore(features: RevenuePredictionResult['features']): number {
    const raw =
      features.global_popularity * 0.18 +
      features.local_popularity * 0.24 +
      features.artist_momentum * 0.14 +
      features.city_demand * 0.16 +
      features.venue_performance * 0.11 +
      features.ticket_pricing_intelligence * 0.08 +
      features.seasonal_trends * 0.06 +
      features.engagement_velocity * 0.03;

    return this.clamp(raw, 0, 100);
  }

  private calculateSelloutProbability(
    features: RevenuePredictionResult['features'],
    demandScore: number
  ): number {
    const capacityPressure = features.venue_capacity < 1_000
      ? 0.08
      : features.venue_capacity > 20_000
        ? -0.08
        : 0;
    const timingPenalty = features.days_until_event < 0 ? -0.05 : 0;
    const weekendBoost = features.is_weekend ? 0.04 : 0;
    const base = 0.18 + demandScore / 115 + capacityPressure + timingPenalty + weekendBoost;

    return this.clamp(base, 0.05, 0.99);
  }

  private async storePrediction(
    input: RevenuePredictionInput,
    result: RevenuePredictionResult
  ): Promise<void> {
    await prisma.predictionOutput.create({
      data: {
        canonicalEventId: input.canonicalEventId,
        concertId: input.concertId,
        modelVersion: MODEL_VERSION,
        input: this.toJsonInput(input),
        features: result.features as unknown as Prisma.InputJsonValue,
        expectedRevenue: result.expected_revenue,
        expectedAttendance: result.expected_attendance,
        selloutProbability: result.sellout_probability,
        demandScore: result.demand_score,
      },
    });
  }

  private async storeTrainingDataIfHistorical(
    input: RevenuePredictionInput,
    result: RevenuePredictionResult
  ): Promise<void> {
    if (!input.concertId) return;

    const concert = await prisma.concert.findUnique({ where: { id: input.concertId } });
    if (!concert?.totalRevenue) return;

    await prisma.predictionTrainingData.create({
      data: {
        concertId: input.concertId,
        features: result.features as unknown as Prisma.InputJsonValue,
        actualRevenue: concert.totalRevenue,
        predictedRevenue: result.expected_revenue,
        accuracy: this.calculateAccuracy(Number(concert.totalRevenue), result.expected_revenue),
        modelVersion: MODEL_VERSION,
      },
    });
  }

  private toJsonInput(input: RevenuePredictionInput): Prisma.InputJsonValue {
    return {
      ...input,
      event_date: input.event_date instanceof Date ? input.event_date.toISOString() : input.event_date,
    } as Prisma.InputJsonValue;
  }

  private calculateAccuracy(actual: number, predicted: number): number {
    if (actual <= 0) return 0;
    const error = Math.abs(actual - predicted) / actual;
    return this.round(this.clamp((1 - error) * 100, 0, 100), 2);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}

export const revenuePredictionService = new RevenuePredictionService();
