import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // Check Artists
    const artists = await prisma.artist.findMany({
      select: {
        id: true,
        artistName: true,
        nationality: true,
        concerts: {
          select: {
            id: true,
            concertDate: true,
            city: true,
            country: true,
            venueName: true,
            capacity: true,
            ticketsSold: true,
            totalRevenue: true,
            currency: true
          }
        }
      }
    });

    console.log(`Found ${artists.length} artists`);

    artists.forEach(artist => {
      console.log(`\nArtist: ${artist.artistName} (${artist.nationality})`);
      console.log(`  Concerts: ${artist.concerts.length}`);

      let totalRevenueInr = 0;
      artist.concerts.forEach(concert => {
        let revenueInInr = 0;
        if (concert.totalRevenue) {
          // Convert to number from Decimal
          const revenueNum = Number(concert.totalRevenue);
          // Convert to INR if needed (assuming 1 USD = 83 INR for rough conversion)
          if (concert.currency === 'USD') {
            revenueInInr = revenueNum * 83;
          } else {
            revenueInInr = revenueNum;
          }
          totalRevenueInr += revenueInInr;
        }

        console.log(`    - ${concert.venueName} (${concert.city}, ${concert.country})`);
        console.log(`      Date: ${concert.concertDate}`);
        console.log(`      Capacity: ${concert.capacity}`);
        console.log(`      Tickets Sold: ${concert.ticketsSold}`);
        console.log(`      Revenue: ${concert.totalRevenue} ${concert.currency} (~₹${revenueInInr.toLocaleString()})`);
      });

      console.log(`  Total Revenue (INR): ~₹${totalRevenueInr.toLocaleString()}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();