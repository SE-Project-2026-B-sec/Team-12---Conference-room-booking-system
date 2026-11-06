process.loadEnvFile(new URL("../.env", import.meta.url));

import { writeFile } from "node:fs/promises";
const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient();

try {
  const url = new URL(process.env.DATABASE_URL);

  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Only a local database is allowed.");
  }

  const users = await db.user.findMany({
    where: {
      email: {
        in: Array.from({ length: 5 }, (_, i) => `k6-user-${i + 1}@example.test`),
      },
    },
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });

  const rooms = await db.room.findMany({
    where: { name: { startsWith: "K6-CRBS-LOAD Room " } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (users.length !== 5 || rooms.length !== 5) {
    throw new Error(`Expected 5 users and 5 rooms. Found ${users.length} users and ${rooms.length} rooms.`);
  }

  const data = {
    baseUrl: "http://localhost:3000",
    users,
    rooms,
  };

  await writeFile(
    new URL("./data.json", import.meta.url),
    JSON.stringify(data, null, 2)
  );

  console.log("Verified 5 performance users and 5 performance rooms.");
  console.log("Saved their IDs to performance/data.json");
  console.log("Users:", users);
  console.log("Rooms:", rooms);
} finally {
  await db.$disconnect();
}
