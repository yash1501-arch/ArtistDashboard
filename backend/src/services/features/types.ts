export interface FeatureEngineeringInput {
  artistId?: string;
  artistName: string;
  city: string;
  country?: string;
  venueName?: string;
  venueCapacity?: number;
  avgTicketPrice?: number;
  eventDate: Date;
  canonicalEventId?: string;
  concertId?: string;
}

export interface ConcertFeatureSet {
  artist_momentum: number;
  city_demand: number;
  venue_performance: number;
  ticket_pricing_intelligence: number;
  seasonal_trends: number;
  engagement_velocity: number;
  global_popularity: number;
  local_popularity: number;
  venue_capacity: number;
  avg_ticket_price: number;
  days_until_event: number;
  is_weekend: boolean;
  feature_set_version: string;
}
