const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const expectedTables = [
    'canonical_events',
    'source_event_references',
    'duplicate_groups',
    'duplicate_group_members',
    'validation_logs',
    'prediction_outputs',
    'feature_snapshots',
  ];

  const tables = await prisma.$queryRawUnsafe(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name = any($1)
    order by table_name
  `, expectedTables);

  const enums = await prisma.$queryRawUnsafe(`
    select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as values
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname in ('EventValidationStatus', 'DuplicateGroupStatus', 'DuplicateMemberRole')
    group by t.typname
    order by t.typname
  `);

  const counts = {
    canonicalEvents: await prisma.canonicalEvent.count(),
    sourceReferences: await prisma.sourceEventReference.count(),
    duplicateGroups: await prisma.duplicateGroup.count(),
    validationLogs: await prisma.validationLog.count(),
    predictionOutputs: await prisma.predictionOutput.count(),
    featureSnapshots: await prisma.featureSnapshot.count(),
  };

  console.log(JSON.stringify({ tables, enums, counts }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
