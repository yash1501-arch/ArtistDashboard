// Example script showing how to get artist popularity from the database
// This demonstrates the complete process: query DB -> calculate popularity

import { prisma } from './database';

// Helper functions from artistPopularity.ts
function toFiniteNumber(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function transformReachValue(value: number): number {
  return Math.log1p(Math.max(0, value)); // log(1 + x)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export type ArtistPopularityInput = {
  spotifyMonthlyListeners?: unknown;
  youtubeSubscribers?: unknown;
  instagramFollowers?: unknown;
  facebookFollowers?: unknown;
  twitterFollowers?: unknown;
};

export type ArtistPopularityPlatform = keyof ArtistPopularityInput;

const ARTIST_POPULARITY_PLATFORMS: ArtistPopularityPlatform[] = [
  'spotifyMonthlyListeners',
  'youtubeSubscribers',
  'instagramFollowers',
  'facebookFollowers',
  'twitterFollowers'
];

const EQUAL_ARTIST_POPULARITY_WEIGHTS: Record<ArtistPopularityPlatform, number> =
  ARTIST_POPULARITY_PLATFORMS.reduce((weights, platform) => {
    weights[platform] = 1 / ARTIST_POPULARITY_PLATFORMS.length;
    return weights;
  }, {} as Record<ArtistPopularityPlatform, number>);

// Core entropy weight calculation
function calculateEntropyWeights(normalizedRows: number[][]): Record<ArtistPopularityPlatform, number> {
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
  if (totalDiversification <= 0) return EQUAL_ARTIST_POPULARITY_WEIGHTS as Record<ArtistPopularityPlatform, number>;

  return ARTIST_POPULARITY_PLATFORMS.reduce((weights, platform, index) => {
    weights[platform] = diversification[index] / totalDiversification;
    return weights;
  }, {} as Record<ArtistPopularityPlatform, number>);
}

// Build entropy model from artist data
async function buildEntropyArtistPopularityModel(artists: ArtistPopularityInput[]) {
  const transformedRows = artists.map((artist) =>
    ARTIST_POPULARITY_PLATFORMS.map((platform) =>
      transformReachValue(toFiniteNumber(artist[platform]))
    )
  );

  const maxValues = ARTIST_POPULARITY_PLATFORMS.reduce((values, platform, index) => {
    values[platform] = Math.max(...transformedRows.map((row) => row[index]), 0);
    return values;
  }, {} as Record<ArtistPopularityPlatform, number>);

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
    sampleSize: artists.length
  };
}

// Calculate popularity score using entropy model
async function calculateArtistPopularityWithModel(artist: ArtistPopularityInput, model: any): Promise<number> {
  if (!model || !model.weights || Object.keys(model.weights).length === 0) {
    return 45; // fallback
  }

  const score = ARTIST_POPULARITY_PLATFORMS.reduce((sum, platform) => {
    const max = model.maxValues[platform] || 0;
    const normalized = max > 0
      ? transformReachValue(toFiniteNumber(artist[platform])) / max
      : 0;
    return sum + normalized * model.weights[platform];
  }, 0);

  return round(clamp(5 + score * 95, 5, 100), 2);
}

// Main function to get artist popularity from database
export async function getArtistPopularityFromDb(artistName: string): Promise<number> {
  try {
    // Query the artist with their latest platform metrics
    const artist = await prisma.artist.findFirst({
      where: {
        artistName: { equals: artistName, mode: 'insensitive' },
        active: true
      },
      include: {
        platformMetrics: {
          orderBy: { metricDate: 'desc' },
          take: 1 // Get the most recent metrics
        }
      }
    });

    if (!artist) {
      throw new Error(`Artist "${artistName}" not found or not active`);
    }

    // Extract social media metrics from the artist's direct fields
    // (PlatformMetric rows have followers/streams per platform, not named fields)
    const artistData: ArtistPopularityInput = {
      spotifyMonthlyListeners: artist.spotifyMonthlyListeners,
      youtubeSubscribers: artist.youtubeSubscribers,
      instagramFollowers: artist.instagramFollowers,
      facebookFollowers: artist.facebookFollowers,
      twitterFollowers: artist.twitterFollowers,
    };

    console.log(`Found artist: ${artist.artistName}`);
    console.log('Social Media Metrics:');
    console.log(`  Spotify Monthly Listeners: ${artistData.spotifyMonthlyListeners?.toLocaleString() ?? 'N/A'}`);
    console.log(`  YouTube Subscribers: ${artistData.youtubeSubscribers?.toLocaleString() ?? 'N/A'}`);
    console.log(`  Instagram Followers: ${artistData.instagramFollowers?.toLocaleString() ?? 'N/A'}`);
    console.log(`  Facebook Followers: ${artistData.facebookFollowers?.toLocaleString() ?? 'N/A'}`);
    console.log(`  Twitter Followers: ${artistData.twitterFollowers?.toLocaleString() ?? 'N/A'}`);

    // For demonstration, we'll create a dummy second artist to build the entropy model
    // In practice, the system would use all artists in the database to build the model
    const dummySecondArtist: ArtistPopularityInput = {
      spotifyMonthlyListeners: artistData.spotifyMonthlyListeners?.toString() === '0' || !artistData.spotifyMonthlyListeners ? 1000 : 0,
      youtubeSubscribers: artistData.youtubeSubscribers?.toString() === '0' || !artistData.youtubeSubscribers ? 100 : 0,
      instagramFollowers: artistData.instagramFollowers?.toString() === '0' || !artistData.instagramFollowers ? 50 : 0,
      facebookFollowers: artistData.facebookFollowers?.toString() === '0' || !artistData.facebookFollowers ? 20 : 0,
      twitterFollowers: artistData.twitterFollowers?.toString() === '0' || !artistData.twitterFollowers ? 10 : 0,
    };

    // Build entropy model using the target artist and a dummy artist for comparison
    // NOTE: In the real system, this model is built from ALL artists in the database and cached
    const artistsForModel = [artistData, dummySecondArtist];
    const entropyModel = await buildEntropyArtistPopularityModel(artistsForModel);

    // Calculate the popularity score
    const popularityScore = await calculateArtistPopularityWithModel(artistData, entropyModel);

    console.log('\nCalculated Popularity Score:');
    console.log(`  ${artist.artistName}: ${popularityScore}/100`);

    return popularityScore;
  } catch (error) {
    console.error(`Error calculating popularity for ${artistName}:`, error);
    throw error;
  }
}

// Example usage
if (require.main === module) {
  getArtistPopularityFromDb('Arijit Singh')
    .then(score => {
      console.log(`\nFinal Result: Arijit Singh popularity score = ${score}/100`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Failed to calculate popularity:', error);
      process.exit(1);
    });
}