process.loadEnvFile(new URL("../.env", import.meta.url));

const { PrismaClient } = await import("@prisma/client");
const bcrypt = (await import("bcrypt")).default;

const db = new PrismaClient();

const PREFIX = "K6-CRBS-LOAD";
const PASSWORD = "K6-CRBS-LoadTest-2026!";

try {
  const url = new URL(process.env.DATABASE_URL);

  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !["/crbs", "/crbs_test"].includes(url.pathname)
  ) {
    throw new Error("Safety check failed: use only your local CRBS database.");
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 4);

  console.log("Preparing 5 performance-test users...");

  for (let i = 1; i <= 5; i++) {
    const email = `k6-user-${i}@example.test`;

    await db.user.upsert({
      where: { email },
      update: { passwordHash, role: "USER" },
      create: {
        name: `${PREFIX} User ${i}`,
        email,
        passwordHash,
        role: "USER",
      },
    });

    console.log(`User ${i} ready: ${email}`);
  }

  console.log("\nPreparing 5 performance-test rooms...");

  for (let i = 1; i <= 5; i++) {
    const name = `${PREFIX} Room ${i}`;

    const existing = await db.room.findFirst({
      where: { name },
    });

    if (!existing) {
      await db.room.create({
        data: {
          name,
          location: "Performance Testing",
          capacity: 10,
          facilities: ["Projector", "Whiteboard"],
        },
      });
    }

    console.log(`Room ${i} ready: ${name}`);
  }

  console.log("\nPerformance test data is ready.");
  console.log("Test password:", PASSWORD);
} finally {
  await db.$disconnect();
}
