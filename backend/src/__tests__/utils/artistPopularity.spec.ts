import {
  ARTIST_POPULARITY_PLATFORMS,
  buildEntropyArtistPopularityModel,
  calculateArtistPopularityWithModel,
  EQUAL_ARTIST_POPULARITY_WEIGHTS,
  getEntropyArtistPopularityModel,
} from '../../utils/artistPopularity';
import { prisma, redis } from '../../utils/database';

describe('artist popularity utilities', () => {
  beforeEach(() => {
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.setex as jest.Mock).mockResolvedValue(true);
  });

  it('builds entropy weights that sum to 1', () => {
    const model = buildEntropyArtistPopularityModel([
      {
        spotifyMonthlyListeners: 100,
        youtubeSubscribers: 80,
        instagramFollowers: 60,
        facebookFollowers: 10,
        twitterFollowers: 5,
        appleMusicListeners: 20,
      },
      {
        spotifyMonthlyListeners: 200,
        youtubeSubscribers: 50,
        instagramFollowers: 40,
        facebookFollowers: 15,
        twitterFollowers: 9,
        appleMusicListeners: 25,
      },
      {
        spotifyMonthlyListeners: 50,
        youtubeSubscribers: 120,
        instagramFollowers: 150,
        facebookFollowers: 12,
        twitterFollowers: 2,
        appleMusicListeners: 10,
      },
    ]);

    const sum = ARTIST_POPULARITY_PLATFORMS.reduce((total, key) => total + model.weights[key], 0);
    expect(Number(sum.toFixed(6))).toBe(1);
  });

  it('falls back to equal weights when entropy cannot differentiate', () => {
    const model = buildEntropyArtistPopularityModel([
      {
        spotifyMonthlyListeners: 0,
        youtubeSubscribers: 0,
        instagramFollowers: 0,
        facebookFollowers: 0,
        twitterFollowers: 0,
        appleMusicListeners: 0,
      },
    ]);

    expect(model.weights).toEqual(EQUAL_ARTIST_POPULARITY_WEIGHTS);
  });

  it('calculates a bounded popularity score from an entropy model', () => {
    const model = buildEntropyArtistPopularityModel([
      {
        spotifyMonthlyListeners: 1_000_000,
        youtubeSubscribers: 500_000,
        instagramFollowers: 250_000,
        facebookFollowers: 100_000,
        twitterFollowers: 50_000,
        appleMusicListeners: 25_000,
      },
      {
        spotifyMonthlyListeners: 200_000,
        youtubeSubscribers: 120_000,
        instagramFollowers: 180_000,
        facebookFollowers: 80_000,
        twitterFollowers: 30_000,
        appleMusicListeners: 15_000,
      },
    ]);

    const score = calculateArtistPopularityWithModel(
      {
        spotifyMonthlyListeners: 1_000_000,
        youtubeSubscribers: 500_000,
        instagramFollowers: 250_000,
      },
      model
    );

    expect(score).toBeGreaterThanOrEqual(5);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns fallback for missing reach data', () => {
    const model = buildEntropyArtistPopularityModel([]);
    expect(calculateArtistPopularityWithModel({}, model, 50)).toBe(50);
  });

  it('loads the entropy model from cache when present', async () => {
    const cached = {
      weights: EQUAL_ARTIST_POPULARITY_WEIGHTS,
      maxValues: EQUAL_ARTIST_POPULARITY_WEIGHTS,
      sampleSize: 1,
    };

    (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(cached));

    const model = await getEntropyArtistPopularityModel();
    expect(model.sampleSize).toBe(1);
    expect(prisma.artist.findMany).not.toHaveBeenCalled();
  });
});
