const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const totalConcerts = await prisma.concert.count();
  console.log("Total Concerts:", totalConcerts);
  const ticketsSoldYTD = await prisma.concert.aggregate({
    _sum: { ticketsSold: true },
  });
  console.log("Total Tickets Sold:", ticketsSoldYTD._sum.ticketsSold);
}
test().catch(console.error).finally(() => prisma.$disconnect());
