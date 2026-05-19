import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkConcerts() {
  try {
    console.log('Checking concerts in the database...');

    // Get total count
    const totalConcerts = await prisma.concert.count();
    console.log(`Total concerts in database: ${totalConcerts}`);

    // Get India-based concerts count
    const indiaConcerts = await prisma.concert.count({
      where: {
        country: {
          equals: 'India',
          mode: 'insensitive'
        }
      }
    });
    console.log(`India-based concerts: ${indiaConcerts}`);

    // Get some sample concerts with coordinates
    const sampleConcerts = await prisma.concert.findMany({
      take: 10,
      select: {
        id: true,
        artistName: true,
        venueName: true,
        city: true,
        country: true,
        latitude: true,
        longitude: true,
        concertDate: true
      },
      orderBy: {
        concertDate: 'desc'
      }
    });

    console.log(`\nSample concerts (most recent 10):`);
    console.log('-'.repeat(100));
    sampleConcerts.forEach((concert, index) => {
      console.log(`${index + 1}. ${concert.artistName || 'Unknown Artist'} - ${concert.venueName || 'Unknown Venue'}`);
      console.log(`   Location: ${concert.city}, ${concert.country}`);
      console.log(`   Coordinates: Lat ${concert.latitude}, Lng ${concert.longitude}`);
      console.log(`   Date: ${concert.concertDate}`);
      console.log();
    });

    // Check which concerts already have predictions
    const predictedCount = await prisma.predictionOutput.groupBy({
      by: ['concertId'],
      _count: true
    });
    console.log(`Concerts with existing predictions: ${predictedCount.length}`);

    // Check India-based concerts with predictions
    const indiaPredictedCount = await prisma.predictionOutput.groupBy({
      by: ['concertId'],
      where: {
        concert: {
          country: {
            equals: 'India',
            mode: 'insensitive'
          }
        }
      },
      _count: true
    });
    console.log(`India-based concerts with predictions: ${indiaPredictedCount.length}`);

  } catch (error) {
    console.error('Error checking concerts:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkConcerts();