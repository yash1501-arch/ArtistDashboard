import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStatus() {
  try {
    console.log('Checking current status of concerts and predictions...');

    // Get total concerts
    const totalConcerts = await prisma.concert.count();
    console.log(`Total concerts in database: ${totalConcerts}`);

    // Get predictions count
    const totalPredictions = await prisma.predictionOutput.count();
    console.log(`Total predictions in database: ${totalPredictions}`);

    // Get unique concerts with predictions
    const predictedConcerts = await prisma.predictionOutput.groupBy({
      by: ['concertId'],
      _count: true
    });
    console.log(`Unique concerts with predictions: ${predictedConcerts.length}`);

    // Get concerts without predictions using a different approach
    const allConcerts = await prisma.concert.findMany({
      select: {
        id: true,
        artistName: true,
        venueName: true,
        city: true,
        country: true
      }
    });

    const predictedConcertIds = predictedConcerts.map(p => p.concertId);
    const concertsWithoutPredictions = allConcerts.filter(c =>
      !predictedConcertIds.includes(c.id)
    );

    console.log(`Concerts WITHOUT predictions: ${concertsWithoutPredictions.length}`);

    if (concertsWithoutPredictions.length > 0) {
      console.log('\nFirst 10 concerts without predictions:');
      concertsWithoutPredictions.slice(0, 10).forEach((c, index) => {
        console.log(`${index + 1}. ${c.artistName || 'Unknown'} - ${c.venueName || 'Unknown Venue'} (${c.city}, ${c.country})`);
      });
    }

    // Check India-based specifics
    const indiaConcerts = await prisma.concert.count({
      where: {
        country: {
          equals: 'India',
          mode: 'insensitive'
        }
      }
    });
    console.log(`\nIndia-based concerts: ${indiaConcerts}`);

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
    console.log(`India-based predictions: ${indiaPredictions}`);

  } catch (error) {
    console.error('Error checking status:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkStatus();