require('dotenv').config();
process.env.NODE_ENV = 'production';
require('tsx/cjs');

const { PrismaClient } = require('@prisma/client');
const { concertIntelligenceService } = require('../src/services/concertIntelligence.service');

const prisma = new PrismaClient();

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function readListArg(name, fallback = []) {
  const value = readArg(name);
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : fallback;
}

function readNumberArg(name, fallback) {
  const value = readArg(name);
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readDateArg(name, fallback) {
  const value = readArg(name, fallback);
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid --${name} date: ${value}`);
  return date;
}

async function resolveArtists() {
  const artistIds = readListArg('artist-ids');
  const artistNames = readListArg('artists');
  const limit = readNumberArg('artist-limit', 1);

  const where = { active: true };
  if (artistIds.length) {
    where.id = { in: artistIds };
  } else if (artistNames.length) {
    where.OR = artistNames.map((artistName) => ({
      artistName: { equals: artistName, mode: 'insensitive' },
    }));
  }

  const artists = await prisma.artist.findMany({
    where,
    select: { id: true, artistName: true },
    orderBy: { artistName: 'asc' },
    take: artistIds.length || artistNames.length ? Math.max(artistIds.length, artistNames.length, limit) : limit,
  });

  if (artists.length === 0) {
    throw new Error('No active artists matched the provided Prisma DB selector');
  }

  return artists;
}

async function main() {
  const artists = await resolveArtists();
  const sources = readListArg('sources', ['BOOKMYSHOW', 'SONGKICK', 'BANDSINTOWN', 'EVENTBRITE']);
  const dateFrom = readDateArg('date-from', new Date().toISOString().slice(0, 10));
  const dateTo = readDateArg('date-to', '2027-12-31');
  const country = readArg('country');
  const summary = await concertIntelligenceService.runDiscoveryPipeline({
    artistIds: artists.map((artist) => artist.id),
    sources,
    dateFrom,
    dateTo,
    country: country || undefined,
    limitPerSource: readNumberArg('limit-per-source', 25),
    maxPages: readNumberArg('max-pages', 8),
    runPredictions: true,
    persistConcerts: true,
  });

  console.log(JSON.stringify({
    selectedArtists: artists,
    query: {
      sources,
      dateFrom: dateFrom?.toISOString().slice(0, 10),
      dateTo: dateTo?.toISOString().slice(0, 10),
      country: country || null,
    },
    counts: {
      scraped: summary.scrapedCount,
      normalized: summary.normalizedCount,
      persisted: summary.persistedCount,
      validated: summary.validatedCount,
      predicted: summary.predictedCount,
      storedConcerts: summary.storedConcertCount,
      errors: summary.errors.length,
    },
    sourceErrors: summary.errors,
    storedConcerts: summary.results
      .filter((result) => result.concert)
      .map((result) => ({
        id: result.concert.id,
        artistName: result.concert.artistName,
        venueName: result.concert.venueName,
        city: result.concert.city,
        country: result.concert.country,
        concertDate: result.concert.concertDate,
        source: result.concert.source,
        sourceUrl: result.concert.sourceUrl,
        verificationStatus: result.concert.verificationStatus,
        totalRevenue: result.concert.totalRevenue,
        ticketsSold: result.concert.ticketsSold,
        demandScore: result.concert.demandScore,
      })),
    skipped: summary.results
      .filter((result) => result.action === 'skipped')
      .map((result) => ({
        artist: result.event.artist_name,
        venue: result.event.venue_name,
        date: result.event.event_date,
        reason: result.reason,
      })),
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
