require('dotenv').config();
require('tsx/cjs');

const { concertScrapingService } = require('../src/services/scrapers/concertScraping.service');

async function main() {
  const query = {
    sources: ['BOOKMYSHOW'],
    // We will leave artists and cities undefined to see if it scrapes generally,
    // or we might need to specify them based on `bookMyShow.scraper.ts`.
    cities: ['mumbai', 'delhi', 'bangalore', 'pune', 'hyderabad'],
    limitPerSource: 50,
    maxPages: 10,
  };

  console.log('Scraping BookMyShow...');
  const scraped = await concertScrapingService.scrapeSources(query);
  
  console.log(JSON.stringify({
    sourceCount: scraped.sourceCount,
    scrapedCount: scraped.eventCount,
    errors: scraped.errors,
    rawEvents: scraped.events.map((event) => ({
      artistName: event.artistName,
      eventName: event.eventName,
      venueName: event.venueName,
      city: event.city,
      country: event.country,
      eventDate: event.eventDate,
      sourcePlatform: event.sourcePlatform,
      sourceUrl: event.sourceUrl,
      ticketPriceRange: event.ticketPriceRange,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});