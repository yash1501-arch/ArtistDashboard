import { NormalizedConcertEvent } from '../normalization/types';

export interface EmbeddingVector {
  provider: 'sentence-transformers' | 'hash-fallback';
  model: 'all-MiniLM-L6-v2' | 'hash-v1';
  vector: number[];
}

export interface DuplicateCandidate {
  canonicalEventId: string;
  similarityScore: number;
  reasons: string[];
  event: {
    artistName: string;
    venueName: string;
    city: string;
    eventDate: Date;
  };
}

export interface DeduplicationResult {
  event: NormalizedConcertEvent;
  embedding: EmbeddingVector;
  duplicates: DuplicateCandidate[];
  bestMatch?: DuplicateCandidate;
}
