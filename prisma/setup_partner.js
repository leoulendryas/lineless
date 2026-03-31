/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const station = await prisma.station.upsert({
    where: { externalId: '9001' },
    update: {
      isPartner: true,
      accessKey: 'BOLE-001',
      name: 'Bole Medhanealem Verified Hub',
      type: 'charging',
      lat: 9.0212,
      lon: 38.7456
    },
    create: {
      externalId: '9001',
      isPartner: true,
      accessKey: 'BOLE-001',
      name: 'Bole Medhanealem Verified Hub',
      type: 'charging',
      lat: 9.0212,
      lon: 38.7456
    }
  });

  console.log('Partner Station Created:', station);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
