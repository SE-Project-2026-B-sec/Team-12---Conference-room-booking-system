import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

// CRBS-14 / CRBS-15: Cost factor 12 per SRS SR02 and Test Plan TC16.
const BCRYPT_COST = 12;

// Explicitly documented demo credentials for verification:
// - Regular User: demo.user@example.com / User123!@#
// - Administrator: demo.admin@example.com / Admin123!@#
export const SEED_CREDENTIALS = {
  user: {
    email: "demo.user@example.com",
    password: "User123!@#",
  },
  admin: {
    email: "demo.admin@example.com",
    password: "Admin123!@#",
  },
} as const;

async function main() {
  const userPasswordHash = await bcrypt.hash(SEED_CREDENTIALS.user.password, BCRYPT_COST);
  const adminPasswordHash = await bcrypt.hash(SEED_CREDENTIALS.admin.password, BCRYPT_COST);

  // Create or update two reusable demo users with valid bcrypt cost-12 hashes.
  const user = await prisma.user.upsert({
    where: { email: SEED_CREDENTIALS.user.email },
    update: {
      passwordHash: userPasswordHash,
    },
    create: {
      name: "Demo User",
      email: SEED_CREDENTIALS.user.email,
      passwordHash: userPasswordHash,
      role: UserRole.USER,
    },
  });

  await prisma.user.upsert({
    where: { email: SEED_CREDENTIALS.admin.email },
    update: {
      passwordHash: adminPasswordHash,
    },
    create: {
      name: "Demo Admin",
      email: SEED_CREDENTIALS.admin.email,
      passwordHash: adminPasswordHash,
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

  console.log("Seed completed: demo users with bcrypt hashes, rooms, and booking.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
