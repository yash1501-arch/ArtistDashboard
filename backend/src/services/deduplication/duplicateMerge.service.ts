import { EventValidationStatus, Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { NormalizedConcertEvent } from '../normalization/types';
import { DeduplicationResult } from './types';

export interface CanonicalEventPersistenceResult {
  canonicalEventId: string;
  action: 'created' | 'updated' | 'merged';
  duplicateGroupId?: string;
}

export class DuplicateMergeService {
  async persistNormalizedEvent(
    event: NormalizedConcertEvent,
    deduplication: DeduplicationResult
  ): Promise<CanonicalEventPersistenceResult> {
    const existingByKey = await prisma.canonicalEvent.findUnique({
      where: { canonicalKey: event.canonical_key },
    });

    if (existingByKey) {
      await this.upsertSourceReference(existingByKey.id, event);
      return { canonicalEventId: existingByKey.id, action: 'updated' };
    }

    if (deduplication.bestMatch) {
      const duplicate = await prisma.canonicalEvent.create({
        data: {
          ...this.toCreateData(event, deduplication),
          validationStatus: EventValidationStatus.DUPLICATE,
        },
      });

      await this.upsertSourceReference(deduplication.bestMatch.canonicalEventId, event);
      const group = await prisma.duplicateGroup.create({
        data: {
          canonicalEventId: deduplication.bestMatch.canonicalEventId,
          similarityScore: deduplication.bestMatch.similarityScore,
          members: {
            create: [
              {
                canonicalEventId: deduplication.bestMatch.canonicalEventId,
                role: 'CANONICAL',
                similarityScore: 1,
                reasons: ['existing canonical event'],
              },
              {
                canonicalEventId: duplicate.id,
                role: 'DUPLICATE',
                similarityScore: deduplication.bestMatch.similarityScore,
                reasons: deduplication.bestMatch.reasons,
              },
            ],
          },
        },
      });

      await this.mergeSourceSignals(deduplication.bestMatch.canonicalEventId, event);
      return {
        canonicalEventId: deduplication.bestMatch.canonicalEventId,
        action: 'merged',
        duplicateGroupId: group.id,
      };
    }

    const created = await prisma.canonicalEvent.create({
      data: this.toCreateData(event, deduplication),
    });

    await this.upsertSourceReference(created.id, event);
    return { canonicalEventId: created.id, action: 'created' };
  }

  private toCreateData(
    event: NormalizedConcertEvent,
    deduplication: DeduplicationResult
  ): Prisma.CanonicalEventUncheckedCreateInput {
    return {
      artistName: event.artist_name,
      normalizedArtistName: event.normalized_artist_name,
      eventName: event.event_name,
      venueName: event.venue_name,
      normalizedVenueName: event.normalized_venue_name,
      city: event.city,
      normalizedCity: event.normalized_city,
      country: event.country,
      eventDate: event.event_date,
      sourcePlatform: String(event.source_platform),
      sourceUrl: event.source_url,
      ticketPriceRange: event.ticket_price_range as Prisma.InputJsonValue | undefined,
      confidenceScore: event.confidence_score,
      validationStatus: EventValidationStatus.PENDING,
      canonicalKey: event.canonical_key,
      embedding: deduplication.embedding as unknown as Prisma.InputJsonValue,
      rawPayload: event.raw_event as unknown as Prisma.InputJsonValue,
    };
  }

  private async mergeSourceSignals(canonicalEventId: string, event: NormalizedConcertEvent): Promise<void> {
    const references = await prisma.sourceEventReference.count({
      where: { canonicalEventId },
    });

    const confidenceBoost = Math.min(0.15, references * 0.03);
    await prisma.canonicalEvent.update({
      where: { id: canonicalEventId },
      data: {
        confidenceScore: Math.min(1, event.confidence_score + confidenceBoost),
        updatedAt: new Date(),
      },
    });
  }

  private async upsertSourceReference(
    canonicalEventId: string,
    event: NormalizedConcertEvent
  ): Promise<void> {
    const sourceEventKey = this.sourceReferenceKey(event);

    await prisma.sourceEventReference.upsert({
      where: { sourceEventKey },
      update: {
        canonicalEventId,
        rawPayload: event.raw_event as unknown as Prisma.InputJsonValue,
        confidenceScore: event.confidence_score,
      },
      create: {
        canonicalEventId,
        sourcePlatform: String(event.source_platform),
        sourceEventId: event.source_event_id,
        sourceUrl: event.source_url,
        sourceEventKey,
        rawPayload: event.raw_event as unknown as Prisma.InputJsonValue,
        confidenceScore: event.confidence_score,
      },
    });
  }

  private sourceReferenceKey(event: NormalizedConcertEvent): string {
    return [
      event.source_platform,
      event.source_event_id || event.source_url || event.canonical_key,
    ].join('|');
  }
}

export const duplicateMergeService = new DuplicateMergeService();
