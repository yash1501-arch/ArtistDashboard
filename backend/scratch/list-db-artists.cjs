require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const artists = await prisma.artist.findMany({
    select: {
      id: true,
      artistName: true,
      active: true,
      genre: true,
      nationality: true,
    },
    orderBy: { artistName: 'asc' },
    take: 100,
  });

  console.log(JSON.stringify({
    count: artists.length,
    activeCount: artists.filter((artist) => artist.active).length,
    artists,
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
