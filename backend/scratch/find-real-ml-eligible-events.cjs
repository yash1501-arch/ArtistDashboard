const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const events = await prisma.canonicalEvent.findMany({
    where: {
      sourceUrl: { not: null },
      validationStatus: { in: ['VALIDATED', 'REVIEW_REQUIRED', 'DUPLICATE'] },
    },
    take: 50,
    orderBy: { updatedAt: 'desc' },
  });

  const eligible = [];
  for (const event of events) {
    const venue = await prisma.venue.findFirst({
      where: {
        name: { equals: event.venueName, mode: 'insensitive' },
        city: { equals: event.city, mode: 'insensitive' },
        country: { equals: event.country, mode: 'insensitive' },
      },
    });
    const ticketRange = event.ticketPriceRange || {};
    const capacity = venue?.avgCapacity || venue?.capacityMax || venue?.capacityMin;
    const price = ticketRange.min || ticketRange.max || venue?.avgTicketPrice;

    if (capacity && price) {
      eligible.push({
        id: event.id,
        artistName: event.artistName,
        venueName: event.venueName,
        city: event.city,
        country: event.country,
        sourcePlatform: event.sourcePlatform,
        sourceUrl: event.sourceUrl,
        capacity,
        price,
      });
    }
  }

  console.log(JSON.stringify({
    sourceBackedCanonicalEventsChecked: events.length,
    strictMlEligibleCount: eligible.length,
    eligible,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
