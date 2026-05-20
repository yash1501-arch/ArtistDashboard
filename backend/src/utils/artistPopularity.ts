import { prisma, redis } from './database';

export type ArtistPopularityInput = {
  spotifyMonthlyListeners?: unknown;
  youtubeSubscribers?: unknown;
  instagramFollowers?: unknown;
  facebookFollowers?: unknown;
  twitterFollowers?: unknown;
  appleMusicListeners?: unknown;
};

export type ArtistPopularityPlatform = keyof ArtistPopularityInput;

export type ArtistPopularityWeights = Record<ArtistPopularityPlatform, number>;

export const ARTIST_POPULARITY_PLATFORMS: ArtistPopularityPlatform[] = [
  'spotifyMonthlyListeners',
  'youtubeSubscribers',
  'instagramFollowers',
  'facebookFollowers',
  'twitterFollowers',
  'appleMusicListeners',
];

const CACHE_KEY = 'artist-popularity:entropy-weights:v1';
const CACHE_TTL_SECONDS = 60 * 60;
const DEFAULT_FALLBACK_POPULARITY = 45;

export const EQUAL_ARTIST_POPULARITY_WEIGHTS: ArtistPopularityWeights =
  ARTIST_POPULARITY_PLATFORMS.reduce((weights, platform) => {
    weights[platform] = 1 / ARTIST_POPULARITY_PLATFORMS.length;
    return weights;
  }, {} as ArtistPopularityWeights);

export async function calculateArtistPopularity(
  artist: ArtistPopularityInput,
  fallback = DEFAULT_FALLBACK_POPULARITY
): Promise<number> {
  const model = await getEntropyArtistPopularityModel();
  return calculateArtistPopularityWithModel(artist, model, fallback);
}

export function calculateArtistPopularityWithModel(
  artist: ArtistPopularityInput,
  model: EntropyArtistPopularityModel,
  fallback = DEFAULT_FALLBACK_POPULARITY
): number {
  if (!hasReachData(artist)) return fallback;

  const score = ARTIST_POPULARITY_PLATFORMS.reduce((sum, platform) => {
    const max = model.maxValues[platform] || 0;
    const normalized = max > 0
      ? transformReachValue(toFiniteNumber(artist[platform])) / max
      : 0;
    return sum + normalized * model.weights[platform];
  }, 0);

  return round(clamp(5 + score * 95, 5, 100), 2);
}

export async function getEntropyArtistPopularityModel(): Promise<EntropyArtistPopularityModel> {
  const cached = await redis.get(CACHE_KEY);
  if (cached) return JSON.parse(cached) as EntropyArtistPopularityModel;

  const artists = await prisma.artist.findMany({
    where: { active: true },
    select: {
      spotifyMonthlyListeners: true,
      youtubeSubscribers: true,
      instagramFollowers: true,
      facebookFollowers: true,
      twitterFollowers: true,
      appleMusicListeners: true,
    },
  });

  const model = buildEntropyArtistPopularityModel(artists);
  await redis.setex(CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(model));

  return model;
}

export type EntropyArtistPopularityModel = {
  weights: ArtistPopularityWeights;
  maxValues: ArtistPopularityWeights;
  sampleSize: number;
};

export function buildEntropyArtistPopularityModel(
  artists: ArtistPopularityInput[]
): EntropyArtistPopularityModel {
  const transformedRows = artists.map((artist) =>
    ARTIST_POPULARITY_PLATFORMS.map((platform) =>
      transformReachValue(toFiniteNumber(artist[platform]))
    )
  );

  const maxValues = ARTIST_POPULARITY_PLATFORMS.reduce((values, platform, index) => {
    values[platform] = Math.max(...transformedRows.map((row) => row[index]), 0);
    return values;
  }, {} as ArtistPopularityWeights);

  const normalizedRows = transformedRows.map((row) =>
    row.map((value, index) => {
      const max = maxValues[ARTIST_POPULARITY_PLATFORMS[index]];
      return max > 0 ? value / max : 0;
    })
  );

  const weights = calculateEntropyWeights(normalizedRows);

  return {
    weights,
    maxValues,
    sampleSize: artists.length,
  };
}

function calculateEntropyWeights(normalizedRows: number[][]): ArtistPopularityWeights {
  const sampleSize = normalizedRows.length;
  const entropyFactor = sampleSize > 1 ? 1 / Math.log(sampleSize) : 0;

  const diversification = ARTIST_POPULARITY_PLATFORMS.map((_, columnIndex) => {
    const column = normalizedRows.map((row) => row[columnIndex]);
    const columnSum = column.reduce((sum, value) => sum + value, 0);
    if (columnSum <= 0 || entropyFactor === 0) return 0;

    const entropy = -entropyFactor * column.reduce((sum, value) => {
      if (value <= 0) return sum;
      const probability = value / columnSum;
      return sum + probability * Math.log(probability);
    }, 0);

    return Math.max(0, 1 - entropy);
  });

  const totalDiversification = diversification.reduce((sum, value) => sum + value, 0);
  if (totalDiversification <= 0) return EQUAL_ARTIST_POPULARITY_WEIGHTS;

  return ARTIST_POPULARITY_PLATFORMS.reduce((weights, platform, index) => {
    weights[platform] = diversification[index] / totalDiversification;
    return weights;
  }, {} as ArtistPopularityWeights);
}

function hasReachData(artist: ArtistPopularityInput): boolean {
  return ARTIST_POPULARITY_PLATFORMS.some((platform) => toFiniteNumber(artist[platform]) > 0);
}

function transformReachValue(value: number): number {
  return Math.log1p(Math.max(0, value));
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
