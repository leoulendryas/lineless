import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const prices = [
    { fuelType: 'Benzene', price: 91.14, unit: 'ETB/L' },
    { fuelType: 'Gasoline', price: 92.50, unit: 'ETB/L' },
    { fuelType: 'Electric', price: 1.50, unit: 'ETB/kWh' },
  ];

  for (const price of prices) {
    await prisma.globalPrice.upsert({
      where: { fuelType: price.fuelType },
      update: { price: price.price, unit: price.unit },
      create: price,
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
