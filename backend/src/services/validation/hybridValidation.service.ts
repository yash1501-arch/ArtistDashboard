import { EventValidationStatus, Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { NormalizedConcertEvent } from '../normalization/types';
import { HybridValidationResult, ValidationContext, ValidationSignals } from './types';

const TRUSTED_SOURCES = new Set(['BOOKMYSHOW', 'SONGKICK', 'BANDSINTOWN', 'EVENTBRITE', 'SETLIST_FM']);
const TRUSTED_EVENT_DOMAINS = [
  'bookmyshow.com',
  'songkick.com',
  'bandsintown.com',
  'eventbrite.com',
  'ticketmaster.com',
  'insider.in',
];

export class HybridValidationService {
  async validate(event: NormalizedConcertEvent, context: ValidationContext = {}): Promise<HybridValidationResult> {
    const signals = await this.collectSignals(event, context);
    const ruleScores = this.scoreRules(signals);
    const confidence = this.calculateConfidence(event, ruleScores, signals);
    const fraudRisk = this.calculateFraudRisk(event, ruleScores, signals);
    const status = this.resolveStatus(confidence, fraudRisk, signals);
    const reasons = this.buildReasons(event, signals, ruleScores, status);

    const result: HybridValidationResult = {
      confidence_score: this.round(confidence, 4),
      fraud_risk_score: this.round(fraudRisk, 4),
      validation_status: status,
      validation_reasons: reasons,
      rule_scores: ruleScores,
      ml_signals: {
        extraction_confidence: event.confidence_score,
        source_platform: String(event.source_platform),
        ticket_price_present: Boolean(event.ticket_price_range),
        duplicate_detected: Boolean(signals.duplicateDetected),
        confirmation_count: signals.multipleConfirmations,
      },
    };

    await this.logValidation(event, result, context);
    await this.updateCanonicalEvent(result, context);

    return result;
  }

  private async collectSignals(
    event: NormalizedConcertEvent,
    context: ValidationContext
  ): Promise<ValidationSignals> {
    const [venue, confirmations] = await Promise.all([
      prisma.venue.findFirst({
        where: {
          name: { equals: event.venue_name, mode: 'insensitive' },
          city: { equals: event.city, mode: 'insensitive' },
          country: { equals: event.country, mode: 'insensitive' },
        },
      }),
      context.canonicalEventId
        ? prisma.sourceEventReference.count({ where: { canonicalEventId: context.canonicalEventId } })
        : Promise.resolve(1),
    ]);

    return {
      trustedSource: TRUSTED_SOURCES.has(String(event.source_platform).toUpperCase()) ||
        this.hasTrustedEventDomain(event.source_url),
      officialTicketUrl: Boolean(event.official_ticket_url || event.source_url),
      venueExists: Boolean(venue),
      verifiedArtistAccount: Boolean(event.verified_artist_account),
      multipleConfirmations: Math.max(1, confirmations),
      duplicateDetected: context.duplicateDetected,
    };
  }

  private hasTrustedEventDomain(sourceUrl?: string): boolean {
    if (!sourceUrl) return false;
    try {
      const host = new URL(sourceUrl).hostname.toLowerCase();
      return TRUSTED_EVENT_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
    } catch {
      return false;
    }
  }

  private scoreRules(signals: ValidationSignals): Record<string, number> {
    return {
      trusted_source: signals.trustedSource ? 0.22 : 0,
      official_ticket_url: signals.officialTicketUrl ? 0.18 : 0,
      venue_existence: signals.venueExists ? 0.18 : 0.05,
      verified_artist_account: signals.verifiedArtistAccount ? 0.12 : 0,
      multiple_confirmations: Math.min(0.22, Math.max(0, signals.multipleConfirmations - 1) * 0.11),
      duplicate_penalty: signals.duplicateDetected ? -0.12 : 0,
    };
  }

  private calculateConfidence(
    event: NormalizedConcertEvent,
    ruleScores: Record<string, number>,
    signals: ValidationSignals
  ): number {
    const ruleTotal = Object.values(ruleScores).reduce((sum, value) => sum + value, 0);
    const fieldCompleteness = [
      event.artist_name,
      event.venue_name,
      event.city,
      event.country,
      event.event_date,
      event.source_url,
    ].filter(Boolean).length / 6;

    const sourceConfidence = event.confidence_score * 0.2;
    const completenessScore = fieldCompleteness * 0.12;
    const baseline = signals.trustedSource ? 0.22 : 0.12;

    return this.clamp(baseline + sourceConfidence + completenessScore + ruleTotal, 0, 1);
  }

  private calculateFraudRisk(
    event: NormalizedConcertEvent,
    ruleScores: Record<string, number>,
    signals: ValidationSignals
  ): number {
    let risk = 0.5;
    risk -= ruleScores.trusted_source;
    risk -= ruleScores.official_ticket_url * 0.75;
    risk -= ruleScores.venue_existence * 0.7;
    risk -= ruleScores.multiple_confirmations * 0.6;
    risk += signals.duplicateDetected ? 0.08 : 0;
    risk += event.event_date.getTime() < Date.now() - 86_400_000 ? 0.05 : 0;

    if (!event.source_url) risk += 0.08;
    if (!event.ticket_price_range) risk += 0.03;

    return this.clamp(risk, 0, 1);
  }

  private resolveStatus(
    confidence: number,
    fraudRisk: number,
    signals: ValidationSignals
  ): EventValidationStatus {
    if (signals.duplicateDetected) return EventValidationStatus.DUPLICATE;
    if (confidence >= 0.76 && fraudRisk <= 0.38) return EventValidationStatus.VALIDATED;
    if (confidence < 0.42 || fraudRisk >= 0.72) return EventValidationStatus.REJECTED;
    return EventValidationStatus.REVIEW_REQUIRED;
  }

  private buildReasons(
    event: NormalizedConcertEvent,
    signals: ValidationSignals,
    ruleScores: Record<string, number>,
    status: EventValidationStatus
  ): string[] {
    const reasons: string[] = [`status=${status}`];
    if (signals.trustedSource) reasons.push(`trusted source ${event.source_platform}`);
    if (signals.officialTicketUrl) reasons.push('ticket URL present');
    if (signals.venueExists) reasons.push('venue exists in venue database');
    if (signals.verifiedArtistAccount) reasons.push('verified artist source account');
    if (signals.multipleConfirmations > 1) reasons.push(`${signals.multipleConfirmations} source confirmations`);
    if (signals.duplicateDetected) reasons.push('duplicate candidate detected');
    if (!event.source_url) reasons.push('missing source URL');
    if (ruleScores.venue_existence <= 0.05) reasons.push('venue not yet verified');
    return reasons;
  }

  private async logValidation(
    event: NormalizedConcertEvent,
    result: HybridValidationResult,
    context: ValidationContext
  ): Promise<void> {
    await prisma.validationLog.create({
      data: {
        canonicalEventId: context.canonicalEventId,
        concertId: context.concertId,
        sourcePlatform: String(event.source_platform),
        confidenceScore: result.confidence_score,
        fraudRiskScore: result.fraud_risk_score,
        validationStatus: result.validation_status,
        validationReasons: result.validation_reasons as Prisma.InputJsonValue,
        ruleScores: result.rule_scores as Prisma.InputJsonValue,
        mlSignals: result.ml_signals as Prisma.InputJsonValue,
      },
    });
  }

  private async updateCanonicalEvent(
    result: HybridValidationResult,
    context: ValidationContext
  ): Promise<void> {
    if (!context.canonicalEventId) return;

    await prisma.canonicalEvent.update({
      where: { id: context.canonicalEventId },
      data: {
        confidenceScore: result.confidence_score,
        fraudRiskScore: result.fraud_risk_score,
        validationStatus: result.validation_status,
      },
    });
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}

export const hybridValidationService = new HybridValidationService();
