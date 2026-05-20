import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find Arijit Singh
  const artist = await prisma.artist.findFirst({
    where: {
      OR: [
        { artistName: { contains: 'Arijit', mode: 'insensitive' } },
        { displayName: { contains: 'Arijit', mode: 'insensitive' } }
      ]
    },
    include: {
      concerts: true,
      platformMetrics: true,
      audienceDemographics: true
    }
  });

  if (!artist) {
    console.log('Artist Arijit Singh not found');
    return;
  }

  console.log('Artist found:', {
    id: artist.id,
    artistName: artist.artistName,
    displayName: artist.displayName,
    active: artist.active
  });

  console.log('\nPlatform Metrics (latest):');
  const latestMetrics = artist.platformMetrics
    .sort((a, b) => b.metricDate.getTime() - a.metricDate.getTime())
    .slice(0, 1);

  if (latestMetrics.length > 0) {
    latestMetrics.forEach(m => {
      console.log({
        platform: m.platform,
        date: m.metricDate,
        followers: m.followers?.toString(),
        likes: m.likes?.toString(),
        shares: m.shares?.toString(),
        comments: m.comments?.toString(),
        streams: m.streams?.toString(),
        rogDaily: m.rogDaily?.toString(),
        rogWeekly: m.rogWeekly?.toString(),
        rogMonthly: m.rogMonthly?.toString()
      });
    });
  } else {
    console.log('No platform metrics found');
  }

  console.log('\nConcerts:');
  artist.concerts.forEach((c, index) => {
    console.log(`${index + 1}.`, {
      id: c.id,
      concertDate: c.concertDate,
      city: c.city,
      country: c.country,
      venueName: c.venueName,
      capacity: c.capacity,
      ticketsSold: c.ticketsSold,
      avgTicketPrice: c.avgTicketPrice?.toString(),
      totalRevenue: c.totalRevenue?.toString(),
      demandScore: c.demandScore?.toString()
    });
  });

  console.log('\nAudience Demographics:');
  const demoMap = new Map<string, any>();
  artist.audienceDemographics.forEach(d => {
    if (!demoMap.has(d.dimension)) {
      demoMap.set(d.dimension, {});
    }
    demoMap.get(d.dimension)[d.dimensionValue] = d.percentage?.toString() || '0';
  });

  demoMap.forEach((values, dimension) => {
    console.log(dimension + ':', values);
  });

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
});