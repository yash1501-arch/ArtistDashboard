require('dotenv').config();
require('tsx/cjs');

const { PrismaClient } = require('@prisma/client');
const { concertScrapingService } = require('../src/services/scrapers/concertScraping.service');
const { eventNormalizationService } = require('../src/services/normalization/eventNormalization.service');
const { duplicateDetectionService } = require('../src/services/deduplication/duplicateDetection.service');
const { duplicateMergeService } = require('../src/services/deduplication/duplicateMerge.service');
const { hybridValidationService } = require('../src/services/validation/hybridValidation.service');
const { revenuePredictionService } = require('../src/services/predictions/revenuePrediction.service');

const prisma = new PrismaClient();

async function main() {
  const scraped = await concertScrapingService.scrapeSources({
    sources: ['SONGKICK'],
    artists: ['Anuv Jain'],
    dateFrom: new Date('2026-05-16T00:00:00.000Z'),
    dateTo: new Date('2027-12-31T00:00:00.000Z'),
    limitPerSource: 1,
    maxPages: 1,
  });

  const normalized = eventNormalizationService.normalizeBatch(scraped.events);
  if (normalized.length === 0) {
    console.log(JSON.stringify({
      status: 'NO_REAL_EVENTS',
      scrapedCount: scraped.eventCount,
      errors: scraped.errors,
      rawEvents: scraped.events,
    }, null, 2));
    return;
  }

  const results = [];
  for (const event of normalized.slice(0, 1)) {
    const dedupe = await duplicateDetectionService.detect(event);
    const persisted = await duplicateMergeService.persistNormalizedEvent(event, dedupe);
    const validation = await hybridValidationService.validate(event, {
      canonicalEventId: persisted.canonicalEventId,
      duplicateDetected: persisted.action === 'merged' || dedupe.duplicates.length > 0,
    });

    const venue = await prisma.venue.findFirst({
      where: {
        name: { equals: event.venue_name, mode: 'insensitive' },
        city: { equals: event.city, mode: 'insensitive' },
        country: { equals: event.country, mode: 'insensitive' },
      },
    });

    const venueCapacity = venue?.avgCapacity || venue?.capacityMax || venue?.capacityMin || 5000;
    const ticketRange = event.ticket_price_range;
    const avgTicketPrice = ticketRange?.min && ticketRange.max
      ? (ticketRange.min + ticketRange.max) / 2
      : ticketRange?.min || ticketRange?.max || (event.country.toLowerCase().includes('india') ? 1250 : 45);

    const prediction = await revenuePredictionService.predict({
      artist: event.artist_name,
      city: event.city,
      country: event.country,
      venueName: event.venue_name,
      venue_capacity: venueCapacity,
      avg_ticket_price: avgTicketPrice,
      event_date: event.event_date,
      canonicalEventId: persisted.canonicalEventId,
    });

    results.push({
      canonicalEventId: persisted.canonicalEventId,
      action: persisted.action,
      event: {
        artist_name: event.artist_name,
        venue_name: event.venue_name,
        city: event.city,
        country: event.country,
        event_date: event.event_date.toISOString().slice(0, 10),
        source_platform: event.source_platform,
        source_url: event.source_url,
        source_ticket_price_range: event.ticket_price_range,
      },
      validation: {
        status: validation.validation_status,
        confidence: validation.confidence_score,
        fraudRisk: validation.fraud_risk_score,
        reasons: validation.validation_reasons,
      },
      modelInput: {
        venueCapacity,
        avgTicketPrice,
        venueCapacitySource: venue ? 'venue_db' : 'fallback_default',
        avgTicketPriceSource: ticketRange ? 'scraped_ticket_range' : 'country_default',
      },
      prediction: {
        expectedRevenue: prediction.expected_revenue,
        expectedAttendance: prediction.expected_attendance,
        selloutProbability: prediction.sellout_probability,
        demandScore: prediction.demand_score,
        modelVersion: prediction.model_version,
      },
    });
  }

  console.log(JSON.stringify({
    status: 'OK',
    scrapedCount: scraped.eventCount,
    normalizedCount: normalized.length,
    errors: scraped.errors,
    results,
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
