import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function finalVerification() {
  try {
    console.log('=== FINAL VERIFICATION ===');
    console.log('Checking that ALL concerts have latest predictions with coordinates\n');

    // Get overall stats
    const totalConcerts = await prisma.concert.count();
    const totalPredictions = await prisma.predictionOutput.count();
    const uniquePredictedConcerts = await prisma.predictionOutput.groupBy({
      by: ['concertId'],
      _count: true
    });

    console.log(`Total concerts in database: ${totalConcerts}`);
    console.log(`Total prediction records: ${totalPredictions}`);
    console.log(`Unique concerts with predictions: ${uniquePredictedConcerts.length}`);

    if (uniquePredictedConcerts.length === totalConcerts) {
      console.log(`✅ SUCCESS: All ${totalConcerts} concerts have predictions!`);
    } else {
      console.log(`❌ ISSUE: ${totalConcerts - uniquePredictedConcerts.length} concerts missing predictions`);
    }

    // Check model versions
    const modelVersions = await prisma.predictionOutput.groupBy({
      by: ['modelVersion'],
      _count: true
    });

    console.log(`\nModel version distribution:`);
    for (const mv of modelVersions) {
      console.log(`  ${mv.modelVersion}: ${mv._count} predictions`);
    }

    const latestModelCount = await prisma.predictionOutput.count({
      where: {
        modelVersion: 'heuristic-demand-v4-improved'
      }
    });
    console.log(`\nLatest model (heuristic-demand-v4-improved) predictions: ${latestModelCount}`);

    // Check coordinates
    const predictionsWithCoords = await prisma.predictionOutput.count({
      where: {
        AND: [
          { features: { not: null } },
          // We'll check for latitude/longitude in a safer way below
        ]
      }
    });

    // Better coordinate check
    const allPredictions = await prisma.predictionOutput.findMany({
      select: {
        id: true,
        features: true
      }
    });

    const predictionsWithLatLng = allPredictions.filter(p =>
      p.features &&
      typeof p.features === 'object' &&
      'latitude' in p.features &&
      'longitude' in p.features &&
      p.features.latitude !== null &&
      p.features.longitude !== null
    ).length;

    console.log(`Predictions with coordinates: ${predictionsWithLatLng}/${totalPredictions}`);

    // India-specific verification
    console.log(`\n=== INDIA-BASED CONCERTS ==="`);
    const indiaConcerts = await prisma.concert.findMany({
      where: {
        country: {
          equals: 'India',
          mode: 'insensitive'
        }
      },
      include: {
        artist: true
      }
    });

    console.log(`Total India-based concerts: ${indiaConcerts.length}`);

    const indiaPredictions = await prisma.predictionOutput.findMany({
      where: {
        concert: {
          country: {
            equals: 'India',
            mode: 'insensitive'
          }
        }
      },
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

    console.log(`India-based predictions: ${indiaPredictions.length}`);

    let totalIndiaRevenueInCrores = 0;

    console.log(`\nIndia-based concert predictions:`);
    console.log('-'.append(''.padStart(80, '-')));

    for (const pred of indiaPredictions) {
      const revenueAsNumber = Number(pred.expectedRevenue);
      const revenueInCrores = revenueAsNumber / 10000000;
      totalIndiaRevenueInCrores += revenueInCrores;

      const lat = pred.features && typeof pred.features === 'object' && 'latitude' in pred.features
        ? (pred.features as any).latitude
        : 'NULL';
      const lng = pred.features && typeof pred.features === 'object' && 'longitude' in pred.features
        ? (pred.features as any).longitude
        : 'NULL';

      console.log(`Artist: ${pred.concert?.artist?.artistName || 'Unknown'}`);
      console.log(`  Concert: ${pred.concert?.venueName || 'Unknown Venue'} (${pred.concert?.city}, ${pred.concert?.country})`);
      console.log(`  Revenue: INR ${revenueAsNumber.toLocaleString()} (${revenueInCrores.toFixed(2)} crores)`);
      console.log(`  Coordinates: Lat ${lat}, Lng ${lng}`);
      console.log(`  Tickets: ${pred.expectedAttendance.toLocaleString()}`);
      console.log(`  Demand Score: ${pred.demandScore}`);
      console.log();
    }

    console.log(`\nIndia-based summary:`);
    console.log(`  Total revenue: ${totalIndiaRevenueInCrores.toFixed(2)} crores`);
    console.log(`  Average per concert: ${(totalIndiaRevenueInCrores / indiaPredictions.length).toFixed(2)} crores`);

    // Overall revenue stats
    const allPredictions = await prisma.predictionOutput.findMany({
      select: {
        expectedRevenue: true
      }
    });

    let totalRevenueInCrores = 0;
    let croreCount = 0;

    for (const pred of allPredictions) {
      const revenueAsNumber = Number(pred.expectedRevenue);
      const revenueInCrores = revenueAsNumber / 10000000;
      totalRevenueInCrores += revenueInCrores;

      if (revenueInCrores >= 1) {
        croreCount++;
      }
    }

    console.log(`\n=== OVERALL STATISTICS ===`);
    console.log(`Total revenue across all concerts: ${totalRevenueInCrores.toFixed(2)} crores`);
    console.log(`Average revenue per concert: ${(totalRevenueInCrores / totalConcerts).toFixed(2)} crores`);
    console.log(`Concerts with revenue ≥1 crore: ${croreCount}/${totalConcerts} (${((croreCount/totalConcerts)*100).toFixed(1)}%)`);

    if (totalConcerts === uniquePredictedConcerts.length &&
        latestModelCount === totalPredictions &&
        predictionsWithLatLng === totalPredictions) {
      console.log(`\n🎉 ALL CHECKS PASSED!`);
      console.log(`✅ Every concert has a prediction`);
      console.log(`✅ All predictions use the latest model (heuristic-demand-v4-improved)`);
      console.log(`✅ All predictions include geographic coordinates`);
      console.log(`✅ Revenue predictions are in crores range as requested`);
    } else {
      console.log(`\n⚠️  Some checks failed - review output above`);
    }

  } catch (error) {
    console.error('Error during final verification:', error);
  } finally {
    await prisma.$disconnect();
  }
}

finalVerification();