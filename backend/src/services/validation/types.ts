import { EventValidationStatus } from '@prisma/client';
import { NormalizedConcertEvent } from '../normalization/types';

export interface ValidationSignals {
  trustedSource: boolean;
  officialTicketUrl: boolean;
  venueExists: boolean;
  verifiedArtistAccount: boolean;
  multipleConfirmations: number;
  duplicateDetected?: boolean;
}

export interface HybridValidationResult {
  confidence_score: number;
  fraud_risk_score: number;
  validation_status: EventValidationStatus;
  validation_reasons: string[];
  rule_scores: Record<string, number>;
  ml_signals: Record<string, number | boolean | string>;
}

export interface ValidationContext {
  canonicalEventId?: string;
  concertId?: string;
  duplicateDetected?: boolean;
  event?: NormalizedConcertEvent;
}
