
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // Get first 30 artist names to see what's in the database
  const artists = await prisma.artist.findMany({
    select: { artistName: true },
    take: 30
  });

  console.log('First 30 artist names in database:');
  artists.forEach((a, index) => {
    console.log((index + 1) + '. ' + a.artistName);
  });

  await prisma.();
}

main().catch(e => {
  console.error(e);
  prisma.();
});

