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

const FIXED_WEIGHTS = {
  spotifyMonthlyListeners: 1.2,
  youtubeSubscribers: 1.0,
  instagramFollowers: 0.8,
  facebookFollowers: 0.45,
  twitterFollowers: 0.35,
  appleMusicListeners: 0.8,
};

function toNumber(value) {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value.toNumber === 'function') {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function currentPopularity(artist) {
  const reach = PLATFORMS.reduce((sum, key) => sum + toNumber(artist[key]) * FIXED_WEIGHTS[key], 0);
  if (reach <= 0) return 45;
  return round(clamp(Math.log10(reach + 1) * 11, 5, 100), 2);
}

function rank(values) {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = Array(values.length);

  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].value === sorted[i].value) j++;
    const averageRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) ranks[sorted[k].index] = averageRank;
    i = j;
  }

  return ranks;
}

function pearson(pairs) {
  if (pairs.length < 3) return null;
  const xs = pairs.map(([x]) => x);
  const ys = pairs.map(([, y]) => y);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;

  for (let i = 0; i < pairs.length; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    numerator += dx * dy;
    denominatorX += dx * dx;
    denominatorY += dy * dy;
  }

  const denominator = Math.sqrt(denominatorX * denominatorY);
  return denominator ? numerator / denominator : null;
}

function spearman(pairs) {
  if (pairs.length < 3) return null;
  const xRanks = rank(pairs.map(([x]) => x));
  const yRanks = rank(pairs.map(([, y]) => y));
  return pearson(xRanks.map((xRank, index) => [xRank, yRanks[index]]));
}

function entropyWeights(rows, transformValue) {
  const matrix = rows.map((row) => PLATFORMS.map((key) => transformValue(toNumber(row[key]))));
  const maxByColumn = PLATFORMS.map((_, columnIndex) =>
    Math.max(...matrix.map((row) => row[columnIndex]), 0)
  );
  const normalized = matrix.map((row) =>
    row.map((value, columnIndex) => {
      const max = maxByColumn[columnIndex];
      return max > 0 ? value / max : 0;
    })
  );
  const n = normalized.length;
  const entropyFactor = n > 1 ? 1 / Math.log(n) : 0;
  const diversification = PLATFORMS.map((_, columnIndex) => {
    const column = normalized.map((row) => row[columnIndex]);
    const columnSum = column.reduce((sum, value) => sum + value, 0);
    if (columnSum <= 0 || entropyFactor === 0) return 0;

    const entropy = -entropyFactor * column.reduce((sum, value) => {
      if (value <= 0) return sum;
      const p = value / columnSum;
      return sum + p * Math.log(p);
    }, 0);

    return Math.max(0, 1 - entropy);
  });
  const totalDiversification = diversification.reduce((sum, value) => sum + value, 0);
  const weights = {};

  PLATFORMS.forEach((key, index) => {
    weights[key] = totalDiversification > 0
      ? diversification[index] / totalDiversification
      : 1 / PLATFORMS.length;
  });

  const scores = normalized.map((row) => {
    const score01 = row.reduce((sum, value, index) => sum + value * weights[PLATFORMS[index]], 0);
    return round(5 + score01 * 95, 2);
  });

  return { weights, scores };
}

function outcomeMetrics(artist) {
  const concerts = artist.concerts || [];
  const concertsWithCapacity = concerts.filter((concert) => toNumber(concert.capacity) > 0);
  const totalRevenue = concerts.reduce((sum, concert) => sum + toNumber(concert.totalRevenue), 0);
  const totalTickets = concerts.reduce((sum, concert) => sum + toNumber(concert.ticketsSold), 0);
  const demandValues = concerts.map((concert) => toNumber(concert.demandScore)).filter((value) => value > 0);
  const sellThroughValues = concertsWithCapacity.map((concert) =>
    clamp(toNumber(concert.ticketsSold) / toNumber(concert.capacity), 0, 1)
  );

  return {
    concertCount: concerts.length,
    totalRevenue,
    avgRevenue: concerts.length ? totalRevenue / concerts.length : 0,
    totalTickets,
    avgDemandScore: demandValues.length
      ? demandValues.reduce((sum, value) => sum + value, 0) / demandValues.length
      : 0,
    avgSellThrough: sellThroughValues.length
      ? sellThroughValues.reduce((sum, value) => sum + value, 0) / sellThroughValues.length
      : 0,
  };
}

function hasReachData(row) {
  return PLATFORMS.some((key) => row[key] > 0);
}

function correlationTable(rows, scoreKey) {
  const outcomes = ['totalRevenue', 'avgRevenue', 'totalTickets', 'avgDemandScore', 'avgSellThrough'];
  const table = {};

  for (const outcome of outcomes) {
    const pairs = rows
      .filter((row) => row.concertCount > 0 && row[outcome] > 0)
      .map((row) => [row[scoreKey], row[outcome]]);

    table[outcome] = {
      n: pairs.length,
      pearson: pairs.length >= 3 ? round(pearson(pairs), 4) : null,
      spearman: pairs.length >= 3 ? round(spearman(pairs), 4) : null,
    };
  }

  return table;
}

function formatWeights(weights) {
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, round(value, 4)])
  );
}

async function main() {
  const artists = await prisma.artist.findMany({
    where: { active: true },
    include: { concerts: true },
    orderBy: { artistName: 'asc' },
  });

  const rows = artists.map((artist) => ({
    id: artist.id,
    artistName: artist.artistName,
    ...Object.fromEntries(PLATFORMS.map((key) => [key, toNumber(artist[key])])),
    currentPopularity: currentPopularity(artist),
    ...outcomeMetrics(artist),
  }));

  const scoredRows = rows;
  const rowsWithReach = rows.filter((row) =>
    PLATFORMS.some((key) => row[key] > 0)
  );
  const rawEntropy = entropyWeights(scoredRows, (value) => value);
  const logEntropy = entropyWeights(scoredRows, (value) => Math.log1p(value));

  scoredRows.forEach((row, index) => {
    row.entropyRawPopularity = hasReachData(row) ? rawEntropy.scores[index] : 45;
    row.entropyLogPopularity = hasReachData(row) ? logEntropy.scores[index] : 45;
  });

  const result = {
    sample: {
      activeArtists: rows.length,
      artistsWithReachData: rowsWithReach.length,
      artistsWithConcerts: rows.filter((row) => row.concertCount > 0).length,
    },
    weights: {
      fixedCurrent: FIXED_WEIGHTS,
      entropyRaw: formatWeights(rawEntropy.weights),
      entropyLog: formatWeights(logEntropy.weights),
    },
    correlations: {
      currentPopularity: correlationTable(scoredRows, 'currentPopularity'),
      entropyRawPopularity: correlationTable(scoredRows, 'entropyRawPopularity'),
      entropyLogPopularity: correlationTable(scoredRows, 'entropyLogPopularity'),
    },
    topScores: scoredRows
      .slice()
      .sort((a, b) => b.entropyLogPopularity - a.entropyLogPopularity)
      .slice(0, 10)
      .map((row) => ({
        artistName: row.artistName,
        currentPopularity: row.currentPopularity,
        entropyLogPopularity: row.entropyLogPopularity,
        totalRevenue: round(row.totalRevenue, 2),
        concertCount: row.concertCount,
      })),
  };

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
