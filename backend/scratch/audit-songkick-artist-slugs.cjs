require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function comparable(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function performerFromSongkickUrl(value) {
  const match = String(value || '').match(/\/concerts\/\d+-([^/?#]+?)-at-/i);
  if (!match?.[1]) return null;
  return comparable(match[1].replace(/-/g, ' '));
}

function sameArtist(left, right) {
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const compactLeft = left.replace(/\s+/g, '');
  const compactRight = right.replace(/\s+/g, '');
  return Boolean(compactLeft && compactRight) &&
    (compactLeft === compactRight || compactLeft.includes(compactRight) || compactRight.includes(compactLeft));
}

async function main() {
  const concerts = await prisma.concert.findMany({
    where: {
      source: 'SONGKICK',
      sourceUrl: { not: null },
    },
    select: {
      id: true,
      artistName: true,
      venueName: true,
      city: true,
      country: true,
      concertDate: true,
      sourceUrl: true,
    },
    orderBy: { created_at: 'desc' },
    take: 500,
  });

  const mismatches = concerts
    .map((concert) => ({
      ...concert,
      artistComparable: comparable(concert.artistName),
      performerComparable: performerFromSongkickUrl(concert.sourceUrl),
    }))
    .filter((concert) =>
      concert.performerComparable &&
      concert.artistComparable &&
      !sameArtist(concert.performerComparable, concert.artistComparable)
    );

  console.log(JSON.stringify({
    checked: concerts.length,
    mismatchCount: mismatches.length,
    mismatches,
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
