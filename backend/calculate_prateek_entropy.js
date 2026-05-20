
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const PLATFORMS = [
  'spotifyMonthlyListeners',
  'youtubeSubscribers',
  'instagramFollowers',
  'facebookFollowers',
  'twitterFollowers',
  'appleMusicListeners',
];

function toNumber(value) {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function transformReachValue(value) {
  return Math.log1p(Math.max(0, value));
}

function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

async function main() {
  // Get all active artists with platform metrics
  const artists = await prisma.artist.findMany({
    where: { active: true },
    select: {
      id: true,
      artistName: true,
      displayName: true,
      spotifyMonthlyListeners: true,
      youtubeSubscribers: true,
      instagramFollowers: true,
      facebookFollowers: true,
      twitterFollowers: true,
      appleMusicListeners: true,
    }
  });

  console.log('Found ' + artists.length + ' active artists');

  // Build the data matrix
  const matrix = artists.map(artist =>
    PLATFORMS.map(platform => toNumber(artist[platform]))
  );

  // Transform values
  const transformed = matrix.map(row =>
    row.map(transformReachValue)
  );

  // Find max values for normalization
  const maxByPlatform = {};
  PLATFORMS.forEach((platform, index) => {
    maxByPlatform[platform] = Math.max(...transformed.map(row => row[index]), 0);
  });

  // Normalize the matrix
  const normalized = transformed.map(row =>
    row.map((value, index) => {
      const max = maxByPlatform[PLATFORMS[index]];
      return max > 0 ? value / max : 0;
    })
  );

  // Calculate entropy weights
  const n = normalized.length;
  const entropyFactor = n > 1 ? 1 / Math.log(n) : 0;

  const diversification = {};
  PLATFORMS.forEach((platform, colIndex) => {
    const column = normalized.map(row => row[colIndex]);
    const columnSum = column.reduce((sum, value) => sum + value, 0);

    if (columnSum <= 0 || entropyFactor === 0) {
      diversification[platform] = 0;
      return;
    }

    const entropy = -entropyFactor * column.reduce((sum, value) => {
      if (value <= 0) return sum;
      const p = value / columnSum;
      return sum + p * Math.log(p);
    }, 0);

    diversification[platform] = Math.max(0, 1 - entropy);
  });

  const totalDiversification = Object.values(diversification).reduce((sum, value) => sum + value, 0);

  const weights = {};
  if (totalDiversification > 0) {
    PLATFORMS.forEach(platform => {
      weights[platform] = diversification[platform] / totalDiversification;
    });
  } else {
    // Fallback to equal weights
    PLATFORMS.forEach(platform => {
      weights[platform] = 1 / PLATFORMS.length;
    });
  }

  // Find Prateek Kuhad
  const prateek = artists.find(a =>
    a.artistName.toLowerCase().includes('prateek kuhad') ||
    (a.displayName && a.displayName.toLowerCase().includes('prateek kuhad'))
  );

  if (!prateek) {
    console.log('Prateek Kuhad not found');
    return;
  }

  console.log('');
  console.log('Prateek Kuhad found:', {
    id: prateek.id,
    artistName: prateek.artistName,
    displayName: prateek.displayName
  });

  // Get Prateek's platform data
  const prateekRow = PLATFORMS.map(platform => toNumber(prateek[platform]));
  const prateekTransformed = prateekRow.map(transformReachValue);

  // Normalize Prateek's data
  const prateekNormalized = prateekTransformed.map((value, index) => {
    const max = maxByPlatform[PLATFORMS[index]];
    return max > 0 ? value / max : 0;
  });

  // Calculate entropy-based popularity score
  let entropyScore = 0;
  for (let i = 0; i < PLATFORMS.length; i++) {
    entropyScore += prateekNormalized[i] * weights[PLATFORMS[i]];
  }

  const finalScore = round(5 + entropyScore * 95, 2);

  console.log('');
  console.log('Platform Data:');
  PLATFORMS.forEach((platform, index) => {
    console.log(platform + ': ' + prateekRow[index] + ' (normalized: ' + prateekNormalized[index].toFixed(4) + ')');
  });

  console.log('');
  console.log('Entropy Weights:');
  PLATFORMS.forEach(platform => {
    console.log(platform + ': ' + weights[platform].toFixed(4));
  });

  console.log('');
  console.log('Diversification Values:');
  PLATFORMS.forEach(platform => {
    console.log(platform + ': (diversification: ' + diversification[platform].toFixed(4) + ')');
  });

  console.log('');
  console.log('Total Diversification: ' + totalDiversification.toFixed(4));

  console.log('');
  console.log('Prateek Kuhad Entropy Popularity Score: ' + finalScore);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
});

