
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create two reusable demo users.
  const user = await prisma.user.upsert({
    where: { email: "demo.user@example.com" },
    update: {},
    create: {
      name: "Demo User",
      email: "demo.user@example.com",
      passwordHash: "SEED_ONLY_REPLACE_WITH_BCRYPT_HASH",
      role: UserRole.USER,
    },
  });

  await prisma.user.upsert({
    where: { email: "demo.admin@example.com" },
    update: {},
    create: {
      name: "Demo Admin",
      email: "demo.admin@example.com",
      passwordHash: "SEED_ONLY_REPLACE_WITH_BCRYPT_HASH",
      role: UserRole.ADMIN,
    },
  });

  // Create demo rooms without duplicating them on repeated runs.
  const roomData = [
    {
      name: "Conference Room A",
      location: "First Floor",
      capacity: 10,
      facilities: ["Projector", "Whiteboard"],
    },
    {
      name: "Conference Room B",
      location: "Second Floor",
      capacity: 20,
      facilities: ["Display", "Video Conferencing"],
    },
    {
      name: "Meeting Room C",
      location: "First Floor",
      capacity: 6,
      facilities: ["Whiteboard"],
    },
  ];

  const rooms = [];

  for (const data of roomData) {
    const existing = await prisma.room.findFirst({
      where: { name: data.name },
    });

    const room = existing
      ? await prisma.room.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.room.create({ data });

    rooms.push(room);
  }

  // Add one future demo booking if it doesn't already exist.
  const startAt = new Date("2026-10-29T10:00:00+05:30");
  const endAt = new Date("2026-10-29T11:00:00+05:30");

  const existingBooking = await prisma.booking.findFirst({
    where: {
      userId: user.id,
      roomId: rooms[0].id,
      startAt,
      endAt,
      purpose: "Demo team meeting",
    },
  });

  if (!existingBooking) {
    await prisma.booking.create({
      data: {
        userId: user.id,
        roomId: rooms[0].id,
        startAt,
        endAt,
        purpose: "Demo team meeting",
      },
    });
  }

  console.log("Seed completed: demo users, rooms, and booking.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
