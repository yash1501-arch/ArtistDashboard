const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const [sourceCounts, totalConcerts, trainingCounts] = await Promise.all([
    prisma.$queryRawUnsafe(`
      select source, count(*)::int as count
      from concerts
      group by source
      order by count desc
    `),
    prisma.concert.count(),
    Promise.all([
      prisma.predictionModel.count(),
      prisma.predictionTrainingData.count(),
    ]).then(([predictionModels, predictionTrainingData]) => ({
      predictionModels,
      predictionTrainingData,
    })),
  ]);

  const sampleConcerts = await prisma.concert.findMany({
    take: 10,
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      artistName: true,
      city: true,
      country: true,
      concertDate: true,
      venueName: true,
      source: true,
      sourceUrl: true,
      totalRevenue: true,
      ticketsSold: true,
      avgTicketPrice: true,
      capacity: true,
      verificationStatus: true,
      notes: true,
    },
  });

  console.log(JSON.stringify({ totalConcerts, sourceCounts, trainingCounts, sampleConcerts }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
