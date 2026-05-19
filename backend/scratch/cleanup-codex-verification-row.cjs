require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const concerts = await prisma.concert.findMany({
    where: {
      OR: [
        { sourceUrl: { startsWith: 'https://example.com/codex/' } },
        { venueName: { contains: 'Codex Verification Arena', mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  const concertIds = concerts.map((concert) => concert.id);

  const canonicalEvents = await prisma.canonicalEvent.findMany({
    where: {
      OR: [
        { concertId: { in: concertIds } },
        { sourceUrl: { startsWith: 'https://example.com/codex/' } },
        { venueName: { contains: 'Codex Verification Arena', mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  const canonicalEventIds = canonicalEvents.map((event) => event.id);

  const groupMembers = canonicalEventIds.length
    ? await prisma.duplicateGroupMember.findMany({
        where: { canonicalEventId: { in: canonicalEventIds } },
        select: { groupId: true },
      })
    : [];
  const groupIds = [...new Set(groupMembers.map((member) => member.groupId))];

  const deleted = {
    predictionOutputs: await prisma.predictionOutput.deleteMany({
      where: {
        OR: [
          { concertId: { in: concertIds } },
          { canonicalEventId: { in: canonicalEventIds } },
        ],
      },
    }),
    featureSnapshots: await prisma.featureSnapshot.deleteMany({
      where: {
        OR: [
          { concertId: { in: concertIds } },
          { canonicalEventId: { in: canonicalEventIds } },
        ],
      },
    }),
    validationLogs: await prisma.validationLog.deleteMany({
      where: {
        OR: [
          { concertId: { in: concertIds } },
          { canonicalEventId: { in: canonicalEventIds } },
        ],
      },
    }),
    sourceReferences: await prisma.sourceEventReference.deleteMany({
      where: { canonicalEventId: { in: canonicalEventIds } },
    }),
    duplicateGroupMembers: await prisma.duplicateGroupMember.deleteMany({
      where: {
        OR: [
          { canonicalEventId: { in: canonicalEventIds } },
          { groupId: { in: groupIds } },
        ],
      },
    }),
    duplicateGroups: await prisma.duplicateGroup.deleteMany({
      where: {
        OR: [
          { id: { in: groupIds } },
          { canonicalEventId: { in: canonicalEventIds } },
        ],
      },
    }),
    canonicalEvents: await prisma.canonicalEvent.deleteMany({
      where: { id: { in: canonicalEventIds } },
    }),
    concerts: await prisma.concert.deleteMany({
      where: { id: { in: concertIds } },
    }),
  };

  console.log(JSON.stringify({
    matchedConcertIds: concertIds,
    matchedCanonicalEventIds: canonicalEventIds,
    deleted,
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
