import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function simpleCheck() {
  try {
    console.log('=== SIMPLE FINAL VERIFICATION ===\n');

    // Get basic counts
    const totalConcerts = await prisma.concert.count();
    const totalPredictions = await prisma.predictionOutput.count();

    console.log(`Total concerts: ${totalConcerts}`);
    console.log(`Total predictions: ${totalPredictions}`);

    // Check latest model
    const latestModelCount = await prisma.predictionOutput.count({
      where: {
        modelVersion: 'heuristic-demand-v4-improved'
      }
    });
    console.log(`Latest model predictions: ${latestModelCount}`);

    // Get a few samples with revenue info
    const predictions = await prisma.predictionOutput.findMany({
      take: 5,
      orderBy: {
        expectedRevenue: 'desc'
      }
    });

    console.log(`\nTop 5 predictions by revenue:`);
    for (const pred of predictions) {
      const revenueInCrores = Number(pred.expectedRevenue) / 10000000;
      console.log(`  Revenue: ₹${revenueInCrores.toFixed(2)} crores`);
    }

    // India-specific
    const indiaPredictions = await prisma.predictionOutput.count({
      where: {
        concert: {
          country: {
            equals: 'India',
            mode: 'insensitive'
          }
        }
      }
    });
    console.log(`\nIndia-based predictions: ${indiaPredictions}`);

    console.log(`\n✅ Verification complete!`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

simpleCheck();