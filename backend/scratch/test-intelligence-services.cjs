process.env.NODE_ENV = 'test';
require('tsx/cjs');

const { PrismaClient } = require('@prisma/client');
const { eventNormalizationService } = require('../src/services/normalization/eventNormalization.service');
const { duplicateDetectionService } = require('../src/services/deduplication/duplicateDetection.service');
const { duplicateMergeService } = require('../src/services/deduplication/duplicateMerge.service');
const { hybridValidationService } = require('../src/services/validation/hybridValidation.service');
const { revenuePredictionService } = require('../src/services/predictions/revenuePrediction.service');

const prisma = new PrismaClient();

const marker = `artistiq-intelligence-test-${Date.now()}`;
const artistName = `ArtistIQ Test Artist ${marker}`;
const venueName = `ArtistIQ Test Arena ${marker}`;
const city = 'Mumbai';
const country = 'India';
const eventDate = '2026-12-12T00:00:00.000Z';

async function cleanup() {
  const canonicalEvents = await prisma.canonicalEvent.findMany({
    where: {
      OR: [
        { artistName: { contains: 'artistiq-intelligence-test', mode: 'insensitive' } },
        { venueName: { contains: 'artistiq-intelligence-test', mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  const ids = canonicalEvents.map((event) => event.id);

  if (ids.length > 0) {
    const groups = await prisma.duplicateGroupMember.findMany({
      where: { canonicalEventId: { in: ids } },
      select: { groupId: true },
    });
    const groupIds = [...new Set(groups.map((group) => group.groupId))];

    await prisma.predictionOutput.deleteMany({ where: { canonicalEventId: { in: ids } } });
    await prisma.featureSnapshot.deleteMany({ where: { canonicalEventId: { in: ids } } });
    await prisma.validationLog.deleteMany({ where: { canonicalEventId: { in: ids } } });
    if (groupIds.length > 0) {
      await prisma.duplicateGroup.deleteMany({ where: { id: { in: groupIds } } });
    }
    await prisma.duplicateGroup.deleteMany({ where: { canonicalEventId: { in: ids } } });
    await prisma.canonicalEvent.deleteMany({ where: { id: { in: ids } } });
  }

  await prisma.venue.deleteMany({
    where: {
      name: venueName,
      city,
      country,
    },
  });
}

async function ingest(rawEvent) {
  const normalized = eventNormalizationService.normalize(rawEvent);
  if (!normalized) throw new Error('Normalization failed');

  const dedupe = await duplicateDetectionService.detect(normalized);
  const persisted = await duplicateMergeService.persistNormalizedEvent(normalized, dedupe);
  const validation = await hybridValidationService.validate(normalized, {
    canonicalEventId: persisted.canonicalEventId,
    duplicateDetected: persisted.action === 'merged' || dedupe.duplicates.length > 0,
  });

  return { normalized, dedupe, persisted, validation };
}

async function main() {
  await cleanup();

  await prisma.venue.create({
    data: {
      name: venueName,
      city,
      country,
      avgCapacity: 12000,
      capacityMin: 10000,
      capacityMax: 14000,
      avgTicketPrice: 1500,
      venueType: 'Arena',
      verified: true,
      source: 'TEST',
    },
  });

  const first = await ingest({
    artistName,
    eventName: `${artistName} Live`,
    venueName,
    city,
    country,
    eventDate,
    sourcePlatform: 'BOOKMYSHOW',
    sourceUrl: `https://example.com/bookmyshow/${marker}`,
    sourceEventId: `${marker}-bms`,
    officialTicketUrl: `https://example.com/bookmyshow/${marker}/tickets`,
    ticketPriceRange: { min: 1000, max: 2500, currency: 'INR' },
    confidenceScore: 0.91,
  });

  const second = await ingest({
    artistName,
    eventName: `${artistName} Live in Mumbai`,
    venueName: `${venueName} Main Stage`,
    city,
    country,
    eventDate,
    sourcePlatform: 'EVENTBRITE',
    sourceUrl: `https://example.com/eventbrite/${marker}`,
    sourceEventId: `${marker}-eventbrite`,
    officialTicketUrl: `https://example.com/eventbrite/${marker}/tickets`,
    ticketPriceRange: { min: 1200, max: 2600, currency: 'INR' },
    confidenceScore: 0.89,
  });

  const prediction = await revenuePredictionService.predict({
    artist: artistName,
    city,
    country,
    venueName,
    venue_capacity: 12000,
    avg_ticket_price: 1500,
    event_date: eventDate,
    canonicalEventId: first.persisted.canonicalEventId,
  });

  const canonicalEvents = await prisma.canonicalEvent.findMany({
    where: {
      OR: [
        { artistName: { contains: marker, mode: 'insensitive' } },
        { venueName: { contains: marker, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  const canonicalEventIds = canonicalEvents.map((event) => event.id);
  const groups = await prisma.duplicateGroupMember.findMany({
    where: { canonicalEventId: { in: canonicalEventIds } },
    select: { groupId: true },
  });
  const duplicateGroupIds = [...new Set(groups.map((group) => group.groupId))];

  const counts = {
    canonicalEvents: canonicalEventIds.length,
    sourceReferences: await prisma.sourceEventReference.count({
      where: { canonicalEventId: { in: canonicalEventIds } },
    }),
    duplicateGroups: await prisma.duplicateGroup.count({
      where: {
        OR: [
          { id: { in: duplicateGroupIds } },
          { canonicalEventId: { in: canonicalEventIds } },
        ],
      },
    }),
    validationLogs: await prisma.validationLog.count({
      where: { canonicalEventId: { in: canonicalEventIds } },
    }),
    predictionOutputs: await prisma.predictionOutput.count({
      where: { canonicalEventId: { in: canonicalEventIds } },
    }),
    featureSnapshots: await prisma.featureSnapshot.count({
      where: { canonicalEventId: { in: canonicalEventIds } },
    }),
  };

  console.log(JSON.stringify({
    marker,
    first: {
      action: first.persisted.action,
      canonicalEventId: first.persisted.canonicalEventId,
      validationStatus: first.validation.validation_status,
      confidence: first.validation.confidence_score,
      fraudRisk: first.validation.fraud_risk_score,
    },
    second: {
      action: second.persisted.action,
      canonicalEventId: second.persisted.canonicalEventId,
      duplicateCount: second.dedupe.duplicates.length,
      duplicateGroupId: second.persisted.duplicateGroupId,
      validationStatus: second.validation.validation_status,
    },
    prediction: {
      expectedRevenue: prediction.expected_revenue,
      expectedAttendance: prediction.expected_attendance,
      selloutProbability: prediction.sellout_probability,
      demandScore: prediction.demand_score,
      modelVersion: prediction.model_version,
    },
    counts,
  }, null, 2));

  await cleanup();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
