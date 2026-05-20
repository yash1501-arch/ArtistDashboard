const { calculateArtistPopularityWithModel, buildEntropyArtistPopularityModel, EQUAL_ARTIST_POPULARITY_WEIGHTS } = require('./dist/utils/artistPopularity.js');

console.log("Testing Entropy-Weighted Logarithmic Scale Artist Popularity Calculation\n");

// Sample artist dataset for building the entropy model
const sampleArtists = [
  {
    spotifyMonthlyListeners: 2_000_000,
    youtubeSubscribers: 1_500_000,
    instagramFollowers: 800_000,
    facebookFollowers: 400_000,
    twitterFollowers: 200_000,
    appleMusicListeners: 150_000,
  },
  {
    spotifyMonthlyListeners: 800_000,
    youtubeSubscribers: 600_000,
    instagramFollowers: 300_000,
    facebookFollowers: 150_000,
    twitterFollowers: 75_000,
    appleMusicListeners: 60_000,
  },
  {
    spotifyMonthlyListeners: 150_000,
    youtubeSubscribers: 100_000,
    instagramFollowers: 75_000,
    facebookFollowers: 40_000,
    twitterFollowers: 20_000,
    appleMusicListeners: 15_000,
  },
  {
    spotifyMonthlyListeners: 25_000,
    youtubeSubscribers: 20_000,
    instagramFollowers: 15_000,
    facebookFollowers: 8_000,
    twitterFollowers: 5_000,
    appleMusicListeners: 3_000,
  },
  {
    spotifyMonthlyListeners: 5_000,
    youtubeSubscribers: 3_000,
    instagramFollowers: 2_000,
    facebookFollowers: 1_000,
    twitterFollowers: 500,
    appleMusicListeners: 800,
  }
];

// Build entropy model from sample data
const entropyModel = buildEntropyArtistPopularityModel(sampleArtists);

console.log("Entropy Model Weights (platform importance):");
console.log("-".repeat(50));
const platforms = ['spotifyMonthlyListeners', 'youtubeSubscribers', 'instagramFollowers', 'facebookFollowers', 'twitterFollowers', 'appleMusicListeners'];
platforms.forEach(platform => {
  console.log(`${platform.padEnd(25)}: ${entropyModel.weights[platform].toFixed(4)}`);
});

console.log("\nMax Values (for normalization):");
console.log("-".repeat(50));
platforms.forEach(platform => {
  console.log(`${platform.padEnd(25)}: ${entropyModel.maxValues[platform].toLocaleString()}`);
});

console.log(`\nSample Size: ${entropyModel.sampleSize}`);

// Test various artist profiles
const testCases = [
  {
    name: "Global Superstar",
    artist: {
      spotifyMonthlyListeners: 50_000_000,
      youtubeSubscribers: 30_000_000,
      instagramFollowers: 20_000_000,
      facebookFollowers: 15_000_000,
      twitterFollowers: 10_000_000,
      appleMusicListeners: 8_000_000,
    }
  },
  {
    name: "Established International Artist",
    artist: {
      spotifyMonthlyListeners: 5_000_000,
      youtubeSubscribers: 4_000_000,
      instagramFollowers: 3_000_000,
      facebookFollowers: 2_000_000,
      twitterFollowers: 1_000_000,
      appleMusicListeners: 1_500_000,
    }
  },
  {
    name: "Regional Popular Artist",
    artist: {
      spotifyMonthlyListeners: 800_000,
      youtubeSubscribers: 600_000,
      instagramFollowers: 400_000,
      facebookFollowers: 250_000,
      twitterFollowers: 150_000,
      appleMusicListeners: 200_000,
    }
  },
  {
    name: "Emerging Artist",
    artist: {
      spotifyMonthlyListeners: 150_000,
      youtubeSubscribers: 100_000,
      instagramFollowers: 75_000,
      facebookFollowers: 40_000,
      twitterFollowers: 20_000,
      appleMusicListeners: 15_000,
    }
  },
  {
    name: "Local/New Artist",
    artist: {
      spotifyMonthlyListeners: 25_000,
      youtubeSubscribers: 15_000,
      instagramFollowers: 10_000,
      facebookFollowers: 5_000,
      twitterFollowers: 2_000,
      appleMusicListeners: 3_000,
    }
  }
];

console.log("\nArtist Popularity Scores (Entropy-Weighted Logarithmic Scale):");
console.log("=".repeat(80));
testCases.forEach(testCase => {
  const score = calculateArtistPopularityWithModel(testCase.artist, entropyModel);
  console.log(`${testCase.name.padEnd(25)}: ${score.toFixed(2)}/100`);
});

// Demonstrate the transformation function
console.log("\nLogarithmic Transformation Examples:");
console.log("-".repeat(40));
const transformReachValue = (value) => Math.log1p(Math.max(0, value));
const testValues = [0, 1, 10, 100, 1000, 10000, 100000, 1000000, 10000000];
testValues.forEach(value => {
  console.log(`Raw: ${value.toLocaleString().padEnd(12)} → Transformed: ${transformReachValue(value).toFixed(4)}`);
});

// Compare with equal weights
console.log("\nComparison with Equal Weights (Baseline):");
console.log("-".repeat(50));
const equalWeightsModel = {
  weights: EQUAL_ARTIST_POPULARITY_WEIGHTS,
  maxValues: sampleArtists.reduce((maxVals, artist) => {
    platforms.forEach(platform => {
      if (!maxVals[platform] || artist[platform] > maxVals[platform]) {
        maxVals[platform] = artist[platform];
      }
    });
    return maxVals;
  }, {}),
  sampleSize: sampleArtists.length
};

console.log("Artist: Global Superstar");
console.log("-".repeat(30));
const equalScore = calculateArtistPopularityWithModel(testCases[0].artist, equalWeightsModel);
const entropyScore = calculateArtistPopularityWithModel(testCases[0].artist, entropyModel);
console.log(`Equal Weights: ${equalScore.toFixed(2)}/100`);
console.log(`Entropy Weights: ${entropyScore.toFixed(2)}/100`);
console.log(`Difference: ${(entropyScore - equalScore).toFixed(2)}`);

// Information entropy explanation
console.log("\nInformation Entropy Connection:");
console.log("-".repeat(40));
console.log("The entropy-weighted approach is similar to information entropy in that:");
console.log("1. It measures the 'surprise' or information content in each platform's data");
console.log("2. Platforms with more varied distributions get higher weights (more informative)");
console.log("3. Platforms where all artists have similar values get lower weights (less discriminative)");
console.log("4. The weighting maximizes the total information extracted from the multi-platform data");
console.log("\nFormula connection:");
console.log("- Weight calculation uses entropy: H = -Σ(p * log(p))");
console.log("- Diversification = 1 - entropy (higher when platforms differentiate artists better)");
console.log("- Final weights = diversification / total_diversification (normalized to sum=1)");