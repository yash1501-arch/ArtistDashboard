const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const event = await prisma.canonicalEvent.findUnique({
    where: { id: process.argv[2] },
    include: {
      sourceReferences: true,
      validationLogs: true,
      predictionOutputs: true,
      featureSnapshots: true,
    },
  });

  console.log(JSON.stringify({
    exists: Boolean(event),
    source: event?.sourcePlatform,
    sourceUrl: event?.sourceUrl,
    validationStatus: event?.validationStatus,
    refs: event?.sourceReferences.length,
    logs: event?.validationLogs.length,
    predictions: event?.predictionOutputs.length,
    features: event?.featureSnapshots.length,
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
