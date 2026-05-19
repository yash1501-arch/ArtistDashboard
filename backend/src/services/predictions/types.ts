import { ConcertFeatureSet } from '../features/types';

export interface RevenuePredictionInput {
  artist: string;
  artistId?: string;
  city: string;
  country?: string;
  venueName?: string;
  venue_capacity: number;
  avg_ticket_price: number;
  event_date: Date | string;
  canonicalEventId?: string;
  concertId?: string;
}

export interface RevenuePredictionOutput {
  expected_revenue: number;
  expected_attendance: number;
  sellout_probability: number;
  demand_score: number;
}

export interface RevenuePredictionResult extends RevenuePredictionOutput {
  model_version: string;
  features: ConcertFeatureSet;
}
