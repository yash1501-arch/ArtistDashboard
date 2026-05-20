
// Simple test to see database contents
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const count = await prisma.artist.count();
    console.log('Total artists in database: ' + count);
    
    const artists = await prisma.artist.findMany({
      take: 10,
      select: { artistName: true }
    });
    
    console.log('First 10 artists:');
    artists.forEach((a, i) => {
      console.log((i+1) + '. ' + a.artistName);
    });
  } finally {
    await prisma.();
  }
}

main().catch(console.error);

