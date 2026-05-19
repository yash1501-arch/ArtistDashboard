require('dotenv').config();
require('tsx/cjs');

const { concertScrapingService } = require('../src/services/scrapers/concertScraping.service');
const { eventNormalizationService } = require('../src/services/normalization/eventNormalization.service');

async function main() {
  const query = {
    sources: ['EVENTBRITE', 'SONGKICK', 'BANDSINTOWN', 'BOOKMYSHOW'],
    artists: ['Anuv Jain', 'Sunidhi Chauhan'],
    cities: ['Mumbai', 'Delhi', 'London'],
    dateFrom: new Date('2026-05-16T00:00:00.000Z'),
    dateTo: new Date('2027-12-31T00:00:00.000Z'),
    limitPerSource: 3,
    maxPages: 2,
  };

  const scraped = await concertScrapingService.scrapeSources(query);
  const normalized = eventNormalizationService.normalizeBatch(scraped.events);

  console.log(JSON.stringify({
    sourceCount: scraped.sourceCount,
    scrapedCount: scraped.eventCount,
    normalizedCount: normalized.length,
    errors: scraped.errors,
    rawEvents: scraped.events.slice(0, 5).map((event) => ({
      artistName: event.artistName,
      eventName: event.eventName,
      venueName: event.venueName,
      city: event.city,
      country: event.country,
      eventDate: event.eventDate,
      sourcePlatform: event.sourcePlatform,
      sourceUrl: event.sourceUrl,
      ticketPriceRange: event.ticketPriceRange,
      confidenceScore: event.confidenceScore,
      rawPayload: event.rawPayload,
    })),
    events: normalized.slice(0, 5).map((event) => ({
      artist_name: event.artist_name,
      event_name: event.event_name,
      venue_name: event.venue_name,
      city: event.city,
      country: event.country,
      event_date: event.event_date.toISOString().slice(0, 10),
      source_platform: event.source_platform,
      source_url: event.source_url,
      ticket_price_range: event.ticket_price_range,
      confidence_score: event.confidence_score,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
