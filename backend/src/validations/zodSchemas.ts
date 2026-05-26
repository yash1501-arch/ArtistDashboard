import { z } from 'zod';

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// User schemas (admin only)
export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['ADMIN', 'VIEWER']),
});

export const updateUserSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  role: z.enum(['ADMIN', 'VIEWER']).optional(),
  active: z.boolean().optional(),
});

// Artist schemas
export const createArtistSchema = z.object({
  artistName: z.string().min(1, 'Artist name is required').max(255),
  displayName: z.string().max(255).optional().nullable(),
  age: z.number().int().positive().optional().nullable(),
  gender: z.string().max(50).optional().nullable(),
  genre: z.string().max(100).optional().nullable(),
  nationality: z.string().max(100).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  wikiUrl: z.string().url().optional().nullable(),
  active: z.boolean().optional(),
  instagramUrl: z.string().url().optional().nullable(),
  facebookUrl: z.string().url().optional().nullable(),
  twitterUrl: z.string().url().optional().nullable(),
  spotifyUrl: z.string().url().optional().nullable(),
  youtubeUrl: z.string().url().optional().nullable(),
  appleMusicUrl: z.string().url().optional().nullable(),
  instagramFollowers: z.number().int().nonnegative().optional().nullable(),
  facebookFollowers: z.number().int().nonnegative().optional().nullable(),
  twitterFollowers: z.number().int().nonnegative().optional().nullable(),
  spotifyMonthlyListeners: z.number().int().nonnegative().optional().nullable(),
  youtubeSubscribers: z.number().int().nonnegative().optional().nullable(),
  genreIds: z.array(z.string()).optional(),
});

export const updateArtistSchema = z.object({
  artistName: z.string().min(1, 'Artist name is required').max(255).optional(),
  displayName: z.string().max(255).optional().nullable(),
  age: z.number().int().positive().optional().nullable(),
  gender: z.string().max(50).optional().nullable(),
  genre: z.string().max(100).optional().nullable(),
  nationality: z.string().max(100).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  wikiUrl: z.string().url().optional().nullable(),
  active: z.boolean().optional(),
  instagramUrl: z.string().url().optional().nullable(),
  facebookUrl: z.string().url().optional().nullable(),
  twitterUrl: z.string().url().optional().nullable(),
  spotifyUrl: z.string().url().optional().nullable(),
  youtubeUrl: z.string().url().optional().nullable(),
  appleMusicUrl: z.string().url().optional().nullable(),
  instagramFollowers: z.number().int().nonnegative().optional().nullable(),
  facebookFollowers: z.number().int().nonnegative().optional().nullable(),
  twitterFollowers: z.number().int().nonnegative().optional().nullable(),
  spotifyMonthlyListeners: z.number().int().nonnegative().optional().nullable(),
  youtubeSubscribers: z.number().int().nonnegative().optional().nullable(),
  genreIds: z.array(z.string()).optional(),
});

// Concert schemas
export const createConcertSchema = z.object({
  artistId: z.string().cuid('Invalid artist ID'),
  concertName: z.string().max(255).optional().nullable(),
  concertDate: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    { message: 'Invalid date format' }
  ),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().max(100).optional().nullable(),
  country: z.string().min(1, 'Country is required').max(100),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  venueName: z.string().max(255).optional().nullable(),
  capacity: z.number().int().positive().optional().nullable(),
  ticketsSold: z.number().int().nonnegative().optional().nullable(),
  ticketPriceVip: z.number().positive().optional().nullable(),
  ticketPriceTier1: z.number().positive().optional().nullable(),
  ticketPriceTier2: z.number().positive().optional().nullable(),
  ticketPriceTier3: z.number().positive().optional().nullable(),
  avgTicketPrice: z.number().positive().optional().nullable(),
  totalRevenue: z.number().positive().optional().nullable(),
  currency: z.string().length(3).optional().default('INR'),
  artistCityPopularity: z.number().min(0).max(100).optional().nullable(),
  demandScore: z.number().min(0).max(100).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const updateConcertSchema = createConcertSchema.partial();

// Platform metric schemas
export const createPlatformMetricSchema = z.object({
  artistId: z.string().cuid('Invalid artist ID'),
  platform: z.enum(['FACEBOOK', 'INSTAGRAM', 'TWITTER', 'YOUTUBE', 'SPOTIFY', 'APPLE_MUSIC', 'REDDIT', 'QUORA']),
  metricDate: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    { message: 'Invalid date format' }
  ),
  followers: z.number().int().nonnegative().default(0),
  likes: z.number().int().nonnegative().default(0),
  shares: z.number().int().nonnegative().default(0),
  comments: z.number().int().nonnegative().default(0),
  streams: z.number().int().nonnegative().default(0),
});

// Audience demographic schemas
export const createAudienceDemographicSchema = z.object({
  artistId: z.string().cuid('Invalid artist ID').optional().nullable(),
  concertId: z.string().cuid('Invalid concert ID').optional().nullable(),
  dimension: z.enum(['AGE_GROUP', 'GENDER', 'GEOGRAPHY', 'GENRE']),
  dimensionValue: z.string().max(100),
  percentage: z.number().min(0).max(100).optional().nullable(),
  absoluteCount: z.number().int().nonnegative().optional().nullable(),
  sourcePlatform: z.string().max(100).optional().nullable(),
  metricDate: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    { message: 'Invalid date format' }
  ),
}).refine(
  (data) => data.artistId !== null || data.concertId !== null,
  {
    message: 'Either artistId or concertId must be provided',
    path: ['artistId'],
  }
);

// Query parameter schemas
export const paginationSchema = z.object({
  page: z.string().default('1').transform(val => parseInt(val)),
  limit: z.string().default('50').transform(val => parseInt(val)).refine(val => val > 0 && val <= 100, {
    message: 'Limit must be between 1 and 100',
  }),
});

export const artistQuerySchema = z.object({
  ...paginationSchema.shape,
  search: z.string().optional(),
  genre: z.string().optional(),
  active: z.string().optional().transform(val => val === 'true'),
});

export const concertQuerySchema = z.object({
  ...paginationSchema.shape,
  artistId: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export const metricsQuerySchema = z.object({
  artistId: z.string().cuid('Invalid artist ID'),
  platform: z.enum(['FACEBOOK', 'INSTAGRAM', 'TWITTER', 'YOUTUBE', 'SPOTIFY', 'APPLE_MUSIC', 'REDDIT', 'QUORA']).optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export const analyticsQuerySchema = z.object({
  artistId: z.string().cuid('Invalid artist ID').optional(),
  platform: z.enum(['FACEBOOK', 'INSTAGRAM', 'TWITTER', 'YOUTUBE', 'SPOTIFY', 'APPLE_MUSIC', 'REDDIT', 'QUORA']).optional(),
  period: z.enum(['daily', 'weekly', 'monthly']).optional().default('daily'),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export const demographicsQuerySchema = z.object({
  artistId: z.string().cuid('Invalid artist ID').optional(),
  concertId: z.string().cuid('Invalid concert ID').optional(),
  dimension: z.enum(['AGE_GROUP', 'GENDER', 'GEOGRAPHY', 'GENRE']).optional(),
});

// Scraping schemas
export const startScrapingSchema = z.object({
  sources: z.array(z.string()).min(1, 'At least one source is required'),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  artists: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  autoVerify: z.boolean().optional().default(false),
  enableWebSearch: z.boolean().optional().default(false),
});

export const verifyConcertsSchema = z.object({
  concertIds: z.array(z.string()).min(1, 'At least one concert ID is required').max(100, 'Maximum 100 concerts at a time'),
});

export const predictConcertValueSchema = z.object({
  venueCapacity: z.number().positive('Venue capacity must be positive'),
  artistTier: z.number().int().min(1).max(3, 'Artist tier must be 1, 2, or 3'),
  minTicketPrice: z.number().positive('Minimum ticket price must be positive'),
  maxTicketPrice: z.number().positive('Maximum ticket price must be positive').optional(),
  cityPopulation: z.number().positive().optional(),
  isWeekend: z.boolean().optional(),
  isHoliday: z.boolean().optional(),
  daysUntilConcert: z.number().int().optional(),
  artistInstagramFollowers: z.number().optional(),
  artistSpotifyListeners: z.number().optional(),
});

export const classifyArtistTierSchema = z.object({
  instagramFollowers: z.number().positive('Instagram followers must be positive'),
  spotifyListeners: z.number().positive('Spotify listeners must be positive'),
  youtubeSubscribers: z.number().optional(),
  facebookFollowers: z.number().optional(),
  twitterFollowers: z.number().optional(),
});

export const analyzeConcertPotentialSchema = z.object({
  artistName: z.string().min(1, 'Artist name is required'),
  venueCapacity: z.number().positive('Venue capacity must be positive'),
  minTicketPrice: z.number().positive('Minimum ticket price must be positive'),
  maxTicketPrice: z.number().positive().optional(),
  city: z.string().optional().default('Mumbai'),
  concertDate: z.string().optional(),
});

// Types for TypeScript
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateArtistInput = z.infer<typeof createArtistSchema>;
export type UpdateArtistInput = z.infer<typeof updateArtistSchema>;
export type CreateConcertInput = z.infer<typeof createConcertSchema>;
export type UpdateConcertInput = z.infer<typeof updateConcertSchema>;
export type CreatePlatformMetricInput = z.infer<typeof createPlatformMetricSchema>;
export type CreateAudienceDemographicInput = z.infer<typeof createAudienceDemographicSchema>;
export type StartScrapingInput = z.infer<typeof startScrapingSchema>;
export type VerifyConcertsInput = z.infer<typeof verifyConcertsSchema>;
export type PredictConcertValueInput = z.infer<typeof predictConcertValueSchema>;
export type ClassifyArtistTierInput = z.infer<typeof classifyArtistTierSchema>;
export type AnalyzeConcertPotentialInput = z.infer<typeof analyzeConcertPotentialSchema>;
