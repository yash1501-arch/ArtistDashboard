
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // First, let's see what artists we have in the database
  console.log('Checking for Taylor Swift and Drake in database...');
  
  const allArtists = await prisma.artist.findMany({
    select: { artistName: true, displayName: true },
    take: 20 // Just check first 20 to see what we're working with
  });
  
  console.log('First 20 artists in database:');
  allArtists.forEach((a, index) => {
    console.log((index + 1) + '. ' + a.artistName + (a.displayName ? ' (' + a.displayName + ')' : ''));
  });
  
  // Now search specifically
  const taylorArtists = await prisma.artist.findMany({
    where: {
      OR: [
        { artistName: { contains: 'Taylor', mode: 'insensitive' } },
        { displayName: { contains: 'Taylor', mode: 'insensitive' } }
      ]
    }
  });
  
  const drakeArtists = await prisma.artist.findMany({
    where: {
      OR: [
        { artistName: { contains: 'Drake', mode: 'insensitive' } },
        { displayName: { contains: 'Drake', mode: 'insensitive' } }
      ]
    }
  });
  
  console.log('');
  console.log('Found ' + taylorArtists.length + ' Taylor-related artists:');
  taylorArtists.forEach(a => {
    console.log('  - ' + a.artistName + (a.displayName ? ' (' + a.displayName + ')' : ''));
  });
  
  console.log('');
  console.log('Found ' + drakeArtists.length + ' Drake-related artists:');
  drakeArtists.forEach(a => {
    console.log('  - ' + a.artistName + (a.displayName ? ' (' + a.displayName + ')' : ''));
  });
  
  await prisma.();
}

main().catch(e => {
  console.error(e);
  prisma.();
});

