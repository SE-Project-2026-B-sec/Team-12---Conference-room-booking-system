process.loadEnvFile(new URL("../.env", import.meta.url));

const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient();

try {
  const users = await db.user.findMany({
    where: {
      email: {
        in: Array.from({ length: 5 }, (_, i) => `k6-user-${i + 1}@example.test`),
      },
    },
    select: { id: true, email: true },
  });

  if (users.length !== 5) {
    throw new Error(`Expected 5 test users; found ${users.length}. Nothing deleted.`);
  }

  const userIds = users.map((user) => user.id);

  const bookings = await db.booking.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, userId: true },
  });

  console.log(`Found ${bookings.length} bookings belonging to the 5 k6 test users.`);
  console.log("No other users' bookings will be touched.");

  const result = await db.booking.deleteMany({
    where: { userId: { in: userIds } },
  });

  console.log(`Deleted ${result.count} performance-test bookings.`);
} finally {
  await db.$disconnect();
}
