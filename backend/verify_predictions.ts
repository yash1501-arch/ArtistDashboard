import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyPredictions() {
  try {
    console.log('Verifying predictions in the database...');

    // Get count of predictions
    const predictionCount = await prisma.predictionOutput.count();
    console.log(`Total predictions in database: ${predictionCount}`);

    // Get some sample predictions with concert details
    const predictions = await prisma.predictionOutput.findMany({
      take: 10,
      include: {
        concert: {
          include: {
            artist: true
          }
        }
      },
      orderBy: {
        expectedRevenue: 'desc'
      }
    });

    console.log(`\nTop 10 predictions by revenue:`);
    console.log('-'.repeat(80));

    let totalRevenueInCrores = 0;
    let croreCount = 0;
    let lakhCount = 0;

    for (const pred of predictions) {
      // Convert Decimal to number for calculations
      const revenueAsNumber = Number(pred.expectedRevenue);
      const revenueInCrores = revenueAsNumber / 10000000;
      totalRevenueInCrores += revenueInCrores;

      if (revenueInCrores >= 1) {
        croreCount++;
      } else if (revenueInCrores >= 0.01) {
        lakhCount++;
      }

      console.log(`Artist: ${pred.concert?.artist?.artistName || 'Unknown'}`);
      console.log(`  Concert: ${pred.concert?.venueName || 'Unknown Venue'} (${pred.concert?.city || 'Unknown City'})`);
      console.log(`  Revenue: INR ${revenueAsNumber.toLocaleString()} (${revenueInCrores.toFixed(2)} crores)`);
      console.log(`  Tickets: ${pred.expectedAttendance.toLocaleString()}`);
      console.log(`  Model: ${pred.modelVersion}`);
      console.log();
    }

    console.log(`Summary:`);
    console.log(`  Predictions in crores range (≥1 cr): ${croreCount}`);
    console.log(`  Predictions in lakhs range (0.01-0.99 cr): ${lakhCount}`);
    console.log(`  Total revenue across all predictions: ${totalRevenueInCrores.toFixed(2)} crores`);
    console.log(`  Average revenue per prediction: ${(totalRevenueInCrores / predictionCount).toFixed(2)} crores`);

    // Check if we have predictions in the expected range (crores)
    if (croreCount > 0) {
      console.log(`\n✅ SUCCESS: Predictions are now in crores range as requested!`);
    } else {
      console.log(`\n⚠️  WARNING: No predictions in crores range found. May need further tuning.`);
    }

  } catch (error) {
    console.error('Error verifying predictions:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyPredictions();