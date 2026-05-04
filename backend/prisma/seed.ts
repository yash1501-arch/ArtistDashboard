import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@mad.com' },
    update: {},
    create: {
      email: 'admin@mad.com',
      passwordHash: hashedPassword,
      role: 'ADMIN',
      active: true,
    },
  });

  console.log('✅ Admin user created:', adminUser.email);

  // Create sample viewer user
  const viewerPassword = await bcrypt.hash('viewer123', 10);

  const viewerUser = await prisma.user.upsert({
    where: { email: 'viewer@mad.com' },
    update: {},
    create: {
      email: 'viewer@mad.com',
      passwordHash: viewerPassword,
      role: 'VIEWER',
      active: true,
    },
  });

  console.log('✅ Viewer user created:', viewerUser.email);

  // Create sample genres
  const genres = ['Pop', 'Rock', 'Hip-Hop', 'Electronic', 'R&B', 'Country', 'Jazz', 'Classical'];
  for (const genreName of genres) {
    await prisma.genre.upsert({
      where: { name: genreName },
      update: {},
      create: { name: genreName },
    });
  }
  console.log('✅ Sample genres created');

  // Create sample artist if none exist
  const artistCount = await prisma.artist.count();
  if (artistCount === 0) {
    const popGenre = await prisma.genre.findFirst({ where: { name: 'Pop' } });
    const rockGenre = await prisma.genre.findFirst({ where: { name: 'Rock' } });

    const artist1 = await prisma.artist.create({
      data: {
        artistName: 'Arijit Singh',
        nationality: 'India',
        bio: 'Indian playback singer known for his soulful voice',
        photoUrl: 'https://example.com/arijit.jpg',
        active: true,
      },
    });

    const artist2 = await prisma.artist.create({
      data: {
        artistName: 'The Local Train',
        nationality: 'India',
        bio: 'Popular Indian rock band',
        photoUrl: 'https://example.com/local-train.jpg',
        active: true,
      },
    });

    // Connect artists to genres via ArtistGenre
    if (popGenre) {
      await prisma.artistGenre.create({
        data: {
          artistId: artist1.id,
          genreId: popGenre.id,
        },
      });
    }

    if (rockGenre) {
      await prisma.artistGenre.create({
        data: {
          artistId: artist2.id,
          genreId: rockGenre.id,
        },
      });
    }

    console.log('✅ Sample artists created:', artist1.artistName, artist2.artistName);

    // Create sample concert
    await prisma.concert.create({
      data: {
        artistId: artist1.id,
        concertName: 'Arijit Singh Live in Mumbai',
        concertDate: new Date('2025-12-15'),
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        venueName: 'NSCI Dome',
        capacity: 10000,
        ticketsSold: 8500,
        avgTicketPrice: 3500,
        totalRevenue: 29750000,
        currency: 'INR',
      },
    });

    console.log('✅ Sample concert created');
  }

  console.log('🎉 Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
