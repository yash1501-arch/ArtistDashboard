import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { NormalizedConcertEvent } from '../normalization/types';
import { embeddingGenerationService, EmbeddingGenerationService } from './embedding.service';
import { DeduplicationResult, DuplicateCandidate, EmbeddingVector } from './types';

const DEFAULT_DUPLICATE_THRESHOLD = 0.86;

interface PersistedCanonicalEvent {
  id: string;
  artistName: string;
  venueName: string;
  city: string;
  eventDate: Date;
  embedding: Prisma.JsonValue | null;
}

export class DuplicateDetectionService {
  constructor(private readonly embeddings: EmbeddingGenerationService = embeddingGenerationService) {}

  async detect(event: NormalizedConcertEvent): Promise<DeduplicationResult> {
    const embedding = await this.embeddings.generateEmbedding(this.toEmbeddingText(event));
    const candidates = await this.loadCandidateEvents(event);
    const duplicates = this.scoreCandidates(event, embedding, candidates);

    return {
      event,
      embedding,
      duplicates,
      bestMatch: duplicates[0],
    };
  }

  async persistDuplicateGroup(result: DeduplicationResult, canonicalEventId: string): Promise<string | null> {
    if (!result.bestMatch) return null;

    const group = await prisma.duplicateGroup.create({
      data: {
        canonicalEventId: result.bestMatch.canonicalEventId,
        similarityScore: result.bestMatch.similarityScore,
        members: {
          create: [
            {
              canonicalEventId: result.bestMatch.canonicalEventId,
              role: 'CANONICAL',
              similarityScore: 1,
              reasons: ['existing canonical event'],
            },
            {
              canonicalEventId,
              role: 'DUPLICATE',
              similarityScore: result.bestMatch.similarityScore,
              reasons: result.bestMatch.reasons,
            },
          ],
        },
      },
    });

    return group.id;
  }

  private async loadCandidateEvents(event: NormalizedConcertEvent): Promise<PersistedCanonicalEvent[]> {
    const eventDate = event.event_date;
    const from = new Date(eventDate);
    from.setUTCDate(from.getUTCDate() - 2);
    const to = new Date(eventDate);
    to.setUTCDate(to.getUTCDate() + 2);

    return prisma.canonicalEvent.findMany({
      where: {
        eventDate: {
          gte: from,
          lte: to,
        },
        OR: [
          { normalizedArtistName: { contains: event.normalized_artist_name, mode: 'insensitive' } },
          { normalizedVenueName: { contains: event.normalized_venue_name, mode: 'insensitive' } },
          { normalizedCity: event.normalized_city },
        ],
      },
      select: {
        id: true,
        artistName: true,
        venueName: true,
        city: true,
        eventDate: true,
        embedding: true,
      },
      take: 100,
    });
  }

  private scoreCandidates(
    event: NormalizedConcertEvent,
    embedding: EmbeddingVector,
    candidates: PersistedCanonicalEvent[]
  ): DuplicateCandidate[] {
    return candidates
      .map((candidate) => this.scoreCandidate(event, embedding, candidate))
      .filter((candidate): candidate is DuplicateCandidate => Boolean(candidate))
      .sort((left, right) => right.similarityScore - left.similarityScore);
  }

  private scoreCandidate(
    event: NormalizedConcertEvent,
    embedding: EmbeddingVector,
    candidate: PersistedCanonicalEvent
  ): DuplicateCandidate | null {
    const candidateEmbedding = this.extractEmbedding(candidate.embedding);
    const semanticScore = candidateEmbedding
      ? this.embeddings.cosineSimilarity(embedding.vector, candidateEmbedding.vector)
      : 0;

    const artistScore = this.tokenSimilarity(event.artist_name, candidate.artistName);
    const venueScore = this.tokenSimilarity(event.venue_name, candidate.venueName);
    const cityScore = this.tokenSimilarity(event.city, candidate.city);
    const dateScore = this.dateSimilarity(event.event_date, candidate.eventDate);

    const similarityScore = this.round(
      semanticScore * 0.42 + artistScore * 0.22 + venueScore * 0.18 + cityScore * 0.1 + dateScore * 0.08,
      4
    );

    if (similarityScore < DEFAULT_DUPLICATE_THRESHOLD) return null;

    const reasons: string[] = [];
    if (semanticScore >= 0.82) reasons.push(`semantic match ${this.round(semanticScore, 3)}`);
    if (artistScore >= 0.8) reasons.push(`artist match ${this.round(artistScore, 3)}`);
    if (venueScore >= 0.8) reasons.push(`venue match ${this.round(venueScore, 3)}`);
    if (cityScore >= 0.9) reasons.push('same city');
    if (dateScore >= 0.9) reasons.push('same or adjacent date');

    return {
      canonicalEventId: candidate.id,
      similarityScore,
      reasons,
      event: {
        artistName: candidate.artistName,
        venueName: candidate.venueName,
        city: candidate.city,
        eventDate: candidate.eventDate,
      },
    };
  }

  private extractEmbedding(value: Prisma.JsonValue | null): EmbeddingVector | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as unknown as EmbeddingVector;
    if (!Array.isArray(candidate.vector)) return null;
    return candidate;
  }

  private toEmbeddingText(event: NormalizedConcertEvent): string {
    return [
      event.normalized_artist_name,
      event.event_name,
      event.normalized_venue_name,
      event.normalized_city,
      event.country,
      event.event_date.toISOString().slice(0, 10),
    ].filter(Boolean).join(' ');
  }

  private tokenSimilarity(left: string, right: string): number {
    const leftTokens = new Set(this.normalize(left).split(' ').filter(Boolean));
    const rightTokens = new Set(this.normalize(right).split(' ').filter(Boolean));
    if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

    const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    const union = new Set([...leftTokens, ...rightTokens]).size;
    return intersection / union;
  }

  private dateSimilarity(left: Date, right: Date): number {
    const days = Math.abs(left.getTime() - right.getTime()) / 86_400_000;
    if (days < 0.5) return 1;
    if (days <= 1) return 0.9;
    if (days <= 2) return 0.65;
    return 0;
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}

export const duplicateDetectionService = new DuplicateDetectionService();
