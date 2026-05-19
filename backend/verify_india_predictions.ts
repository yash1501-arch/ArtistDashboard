import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyIndiaPredictions() {
  try {
    console.log('Verifying India-based concert predictions with coordinates...');

    // Get India-based predictions with concert details
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

    console.log(`Found ${indiaPredictions.length} India-based concert predictions`);
    console.log('='.repeat(100));

    let totalRevenueInCrores = 0;

    for (const pred of indiaPredictions) {
      // Convert Decimal to number for calculations
      const revenueAsNumber = Number(pred.expectedRevenue);
      const revenueInCrores = revenueAsNumber / 10000000;
      totalRevenueInCrores += revenueInCrores;

      // Safely access features as JsonObject
      const lat = pred.features && typeof pred.features === 'object' && 'latitude' in pred.features
        ? (pred.features as any).latitude
        : 'NULL';
      const lng = pred.features && typeof pred.features === 'object' && 'longitude' in pred.features
        ? (pred.features as any).longitude
        : 'NULL';

      console.log(`Artist: ${pred.concert?.artist?.artistName || 'Unknown'}`);
      console.log(`  Concert: ${pred.concert?.venueName || 'Unknown Venue'} (${pred.concert?.city || 'Unknown City'}, ${pred.concert?.country})`);
      console.log(`  Revenue: INR ${revenueAsNumber.toLocaleString()} (${revenueInCrores.toFixed(2)} crores)`);
      console.log(`  Coordinates: Lat ${lat}, Lng ${lng}`);
      console.log(`  Tickets: ${pred.expectedAttendance.toLocaleString()}`);
      console.log(`  Model: ${pred.modelVersion}`);
      console.log(`  Demand Score: ${pred.demandScore}`);
      console.log('-'.repeat(50));
    }

    console.log(`\nSummary for India-based concerts:`);
    console.log(`  Total predictions: ${indiaPredictions.length}`);
    console.log(`  Total revenue: ${totalRevenueInCrores.toFixed(2)} crores`);
    console.log(`  Average revenue per prediction: ${(totalRevenueInCrores / indiaPredictions.length).toFixed(2)} crores`);

    // Show coordinate coverage
    const predictionsWithCoords = indiaPredictions.filter(p =>
      p.features &&
      typeof p.features === 'object' &&
      'latitude' in p.features &&
      'longitude' in p.features &&
      p.features.latitude !== null &&
      p.features.longitude !== null
    );
    console.log(`  Predictions with coordinates: ${predictionsWithCoords.length}/${indiaPredictions.length}`);

  } catch (error) {
    console.error('Error verifying India predictions:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyIndiaPredictions();