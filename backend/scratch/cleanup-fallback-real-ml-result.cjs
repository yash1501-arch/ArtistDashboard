const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const canonicalEventId = process.argv[2];
  if (!canonicalEventId) throw new Error('canonicalEventId is required');

  const deletedPredictions = await prisma.predictionOutput.deleteMany({
    where: { canonicalEventId },
  });
  const deletedFeatures = await prisma.featureSnapshot.deleteMany({
    where: { canonicalEventId },
  });

  console.log(JSON.stringify({
    canonicalEventId,
    deletedPredictions: deletedPredictions.count,
    deletedFeatureSnapshots: deletedFeatures.count,
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
