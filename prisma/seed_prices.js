import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const prices = [
    { fuelType: 'Benzene', price: 132.18, unit: 'ETB/L' }, // Gasoline
    { fuelType: 'Gasoline', price: 139.84, unit: 'ETB/L' }, // White Diesel
    { fuelType: 'Electric', price: 10.00, unit: 'ETB/kWh' }, // Public Charging
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
