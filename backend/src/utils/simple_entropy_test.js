// Simple demonstration of entropy-weighted artist popularity calculation
// Based on the actual implementation in artistPopularity.ts

// Helper functions from the original code
function toFiniteNumber(value) {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function transformReachValue(value) {
  return Math.log1p(Math.max(0, value)); // log(1 + x)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Platforms array (same as in original)
const ARTIST_POPULARITY_PLATFORMS = [
  'spotifyMonthlyListeners',
  'youtubeSubscribers',
  'instagramFollowers',
  'facebookFollowers',
  'twitterFollowers',
  'appleMusicListeners'
];

// Equal weights (fallback when entropy can't differentiate)
const EQUAL_ARTIST_POPULARITY_WEIGHTS = ARTIST_POPULARITY_PLATFORMS.reduce((weights, platform) => {
  weights[platform] = 1 / ARTIST_POPULARITY_PLATFORMS.length;
  return weights;
}, {});

// Core entropy weight calculation (simplified version)
function calculateEntropyWeights(normalizedRows) {
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
  }, {});
}

// Build entropy model from artist data
function buildEntropyArtistPopularityModel(artists) {
  const transformedRows = artists.map((artist) =>
    ARTIST_POPULARITY_PLATFORMS.map((platform) =>
      transformReachValue(toFiniteNumber(artist[platform]))
    )
  );

  const maxValues = ARTIST_POPULARITY_PLATFORMS.reduce((values, platform, index) => {
    values[platform] = Math.max(...transformedRows.map((row) => row[index]), 0);
    return values;
  }, {});

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
function calculateArtistPopularityWithModel(artist, model) {
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

// Test with sample data
console.log("ENTROPY-WEIGHTED ARTIST POPULARITY CALCULATION DEMO\n");

const sampleArtists = [
  {
    name: "Global Superstar",
    spotifyMonthlyListeners: 50_000_000,
    youtubeSubscribers: 30_000_000,
    instagramFollowers: 20_000_000,
    facebookFollowers: 15_000_000,
    twitterFollowers: 10_000_000,
    appleMusicListeners: 8_000_000,
  },
  {
    name: "Established International Artist",
    spotifyMonthlyListeners: 5_000_000,
    youtubeSubscribers: 4_000_000,
    instagramFollowers: 3_000_000,
    facebookFollowers: 2_000_000,
    twitterFollowers: 1_000_000,
    appleMusicListeners: 1_500_000,
  },
  {
    name: "Regional Popular Artist",
    spotifyMonthlyListeners: 800_000,
    youtubeSubscribers: 600_000,
    instagramFollowers: 400_000,
    facebookFollowers: 250_000,
    twitterFollowers: 150_000,
    appleMusicListeners: 200_000,
  },
  {
    name: "Emerging Artist",
    spotifyMonthlyListeners: 150_000,
    youtubeSubscribers: 100_000,
    instagramFollowers: 75_000,
    facebookFollowers: 40_000,
    twitterFollowers: 20_000,
    appleMusicListeners: 15_000,
  },
  {
    name: "Local/New Artist",
    spotifyMonthlyListeners: 25_000,
    youtubeSubscribers: 15_000,
    instagramFollowers: 10_000,
    facebookFollowers: 5_000,
    twitterFollowers: 2_000,
    appleMusicListeners: 3_000,
  }
];

// Build entropy model
const entropyModel = buildEntropyArtistPopularityModel(sampleArtists);

console.log("ENTROPY MODEL WEIGHTS (Platform Importance):");
console.log("==================================================");
ARTIST_POPULARITY_PLATFORMS.forEach(platform => {
  console.log(`${platform.padEnd(28)}: ${entropyModel.weights[platform].toFixed(4)}`);
});

console.log("\nNORMALIZATION MAXIMUMS (Observed Max in Dataset):");
console.log("==================================================");
ARTIST_POPULARITY_PLATFORMS.forEach(platform => {
  console.log(`${platform.padEnd(28)}: ${entropyModel.maxValues[platform].toLocaleString()}`);
});

console.log(`\nSAMPLE SIZE: ${entropyModel.sampleSize} artists\n`);

console.log("INDIVIDUAL ARTIST SCORES:");
console.log("==================================================");
sampleArtists.forEach(artist => {
  const score = calculateArtistPopularityWithModel(artist, entropyModel);
  console.log(`${artist.name.padEnd(25)}: ${score}/100`);
});

// Show transformation examples
console.log("\nLOGARITHMIC TRANSFORMATION (log1p):");
console.log("========================================");
const testValues = [0, 1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000];
testValues.forEach(value => {
  const transformed = transformReachValue(value);
  console.log(`Raw: ${value.toLocaleString().padEnd(12)} → log(1+${value}): ${transformed.toFixed(4)}`);
});

// Information entropy explanation
console.log("\nHOW THIS RELATES TO INFORMATION ENTROPY:");
console.log("==========================================");
console.log("1. ENTROPY MEASURES UNCERTAINTY/SURPRISE:");
console.log("   - High entropy = more uniform distribution = less informative");
console.log("   - Low entropy = skewed distribution = more informative (surprising)");
console.log("");
console.log("2. DIVERSIFICATION = 1 - ENTROPY:");
console.log("   - Measures how well a platform distinguishes between artists");
console.log("   - Platform where all artists have similar scores → low diversification");
console.log("   - Platform with varied scores → high diversification");
console.log("");
console.log("3. WEIGHTS PROPORTIONAL TO DIVERSIFICATION:");
console.log("   - More diversified platforms get higher weights");
console.log("   - Less diversified platforms get lower weights");
console.log("   - Weights normalized to sum to 1.0");
console.log("");
console.log("4. MATHEMATICAL CONNECTION:");
console.log("   - Entropy: H = -Σ(p × log₂(p)) where p = probability");
console.log("   - Our entropy: Uses log and normalizes to [0,1] range");
console.log("   - Diversification = 1 - normalized entropy");
console.log("");
console.log("KEY INSIGHT:");
console.log("This approach automatically discovers which social media platforms");
console.log("are most predictive of an artist's true popularity by measuring");
console.log("how much each platform's data varies across the artist population.");
console.log("Platforms where everyone has similar scores (low variance) get less weight.");
console.log("Platforms that effectively separate artists (high variance) get more weight.");