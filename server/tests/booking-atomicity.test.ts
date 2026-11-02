// Integration tests (TC15 / FR14): need Postgres with the *_test database (see README "Integration tests").
import "./helpers/test-db.js"; // must stay first: points DATABASE_URL at the *_test database
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createBooking } from "../src/services/booking-service.js";
import request from "supertest";
import bcrypt from "bcrypt";
import session from "express-session";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { loginRateLimiter } from "../src/services/rate-limiter.js";

const PASSWORD = "Test-Pass-123!";
// Cost 4 (not 12) only inside tests, to keep the suite fast; production hashing is unaffected.
let passwordHash = "";

const createdUserIds: number[] = [];
const createdRoomIds: number[] = [];

/** YYYY-MM-DD in Asia/Kolkata, `days` from today. */
function istDate(days: number): string {
  const ms = Date.now() + 330 * 60_000 + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

const interval = (day: number) => {
  const date = istDate(day);
  return { startAt: new Date(`${date}T10:00:00+05:30`), endAt: new Date(`${date}T11:00:00+05:30`) };
};

async function makeFixtures() {
  const user = await prisma.user.create({
    data: { name: "Test", email: `${randomUUID()}@example.test`, passwordHash },
  });
  createdUserIds.push(user.id);
  const room = await prisma.room.create({
    data: { name: `Room ${randomUUID().slice(0, 8)}`, location: "Test wing", capacity: 8, facilities: [] },
  });
  createdRoomIds.push(room.id);
  return { user, room };
}

beforeAll(async () => {
  const table = await prisma.$queryRaw<{ t: string | null }[]>`SELECT to_regclass('public."Booking"')::text AS t`;
  if (!table[0]?.t) throw new Error("Test database has no schema. Run: npm run test:db:prepare");
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

afterEach(async () => {
  loginRateLimiter.clear();
  await prisma.booking.deleteMany({
    where: { OR: [{ roomId: { in: createdRoomIds } }, { userId: { in: createdUserIds } }] },
  });
  await prisma.room.deleteMany({ where: { id: { in: createdRoomIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdRoomIds.length = 0;
  createdUserIds.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("TC15 / FR14 atomic writes and persistence", () => {
  it("TC15: a failure after the insert rolls the transaction back and leaves no booking row", async () => {
    const { user, room } = await makeFixtures();
    const { startAt, endAt } = interval(2);
    const input = { userId: user.id, roomId: room.id, purpose: "Rollback", startAt, endAt };

    await expect(
      createBooking(input, {
        afterInsert: async (tx) => {
          // The insert is visible inside the transaction...
          expect(await tx.booking.count({ where: { roomId: room.id } })).toBe(1);
          throw new Error("simulated failure after insert");
        },
      }),
    ).rejects.toThrow("simulated failure after insert");

    // ...but nothing remains once it has rolled back, and the slot is still bookable.
    expect(await prisma.booking.count({ where: { roomId: room.id } })).toBe(0);
    expect((await createBooking(input)).ok).toBe(true);
    expect(await prisma.booking.count({ where: { roomId: room.id } })).toBe(1);
  });

  it("TC15: an unexpected failure through the API returns a safe 500 and persists nothing", async () => {
    const { user, room } = await makeFixtures();
    const agent = request.agent(createApp({ sessionStore: new session.MemoryStore() }));
    const login = await agent.post("/api/auth/login").send({ email: user.email, password: PASSWORD });
    const spy = vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("secret db detail"));
    const res = await agent
      .post("/api/bookings")
      .set("x-csrf-token", login.headers["x-csrf-token"] as string)
      .send({ roomId: room.id, date: istDate(2), startTime: "10:00", endTime: "11:00", purpose: "Fail" });
    spy.mockRestore();

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    expect(JSON.stringify(res.body)).not.toContain("secret");
    expect(await prisma.booking.count({ where: { roomId: room.id } })).toBe(0);
  });

  it("TC15: a conflict or missing room writes nothing", async () => {
    const { user, room } = await makeFixtures();
    const { startAt, endAt } = interval(2);
    const input = { userId: user.id, roomId: room.id, purpose: "First", startAt, endAt };
    expect((await createBooking(input)).ok).toBe(true);
    expect(await createBooking({ ...input, purpose: "Second" })).toEqual({ ok: false, reason: "CONFLICT" });
    expect(await createBooking({ ...input, roomId: 2_000_000_000 })).toEqual({ ok: false, reason: "ROOM_NOT_FOUND" });
    expect(await prisma.booking.count({ where: { roomId: room.id } })).toBe(1);
  });

  it("TC15: committed bookings persist after the Prisma client is disconnected and recreated", async () => {
    const { user, room } = await makeFixtures();
    const { startAt, endAt } = interval(3);
    const result = await createBooking({ userId: user.id, roomId: room.id, purpose: "Durable", startAt, endAt });
    expect(result.ok).toBe(true);

    await prisma.$disconnect(); // simulate a server restart: drop every connection...
    const fresh = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_TEST }); // ...and start a new client
    try {
      const rows = await fresh.booking.findMany({ where: { roomId: room.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ userId: user.id, purpose: "Durable", status: "CONFIRMED", startAt, endAt });
    } finally {
      await fresh.$disconnect();
    }
  });
});
