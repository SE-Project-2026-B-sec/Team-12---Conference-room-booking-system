// Integration tests (TC09 / NFR02): need Postgres with the *_test database (see README "Integration tests").
import "./helpers/test-db.js"; // must stay first: points DATABASE_URL at the *_test database
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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

const body = (roomId: number, date: string, startTime = "10:00", endTime = "11:00") => ({
  roomId,
  date,
  startTime,
  endTime,
  purpose: "Concurrency check",
});

async function makeUsers(count: number) {
  const userPromises = Array.from({ length: count }, async (_, i) => {
    const user = await prisma.user.create({
      data: { name: `Test ${i}`, email: `${randomUUID()}@example.test`, passwordHash },
    });
    createdUserIds.push(user.id);
    const agent = request.agent(createApp({ sessionStore: new session.MemoryStore() }));
    const login = await agent.post("/api/auth/login").send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(200);
    return { agent, csrf: login.headers["x-csrf-token"] as string, userId: user.id };
  });
  return Promise.all(userPromises);
}

async function makeRoom() {
  const room = await prisma.room.create({
    data: { name: `Room ${randomUUID().slice(0, 8)}`, location: "Test wing", capacity: 8, facilities: [] },
  });
  createdRoomIds.push(room.id);
  return room;
}

type Client = Awaited<ReturnType<typeof makeUsers>>[number];
const post = (c: Client, payload: Record<string, unknown>) =>
  c.agent.post("/api/bookings").set("x-csrf-token", c.csrf).send(payload);

const confirmedCount = (roomId: number, startAt: Date) =>
  prisma.booking.count({ where: { roomId, startAt, status: "CONFIRMED" } });

async function verifyNoOverlappingBookings(): Promise<void> {
  const overlapping = await prisma.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int as count
    FROM "Booking" b1
    JOIN "Booking" b2 ON b1."roomId" = b2."roomId" AND b1.id != b2.id
    WHERE b1.status = 'CONFIRMED' AND b2.status = 'CONFIRMED'
      AND b1."startAt" < b2."endAt" AND b1."endAt" > b2."startAt"
  `;
  expect(overlapping[0].count).toBe(0);
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
  await prisma.auditLog.deleteMany({
    where: { actorId: { in: createdUserIds } },
  });
  await prisma.room.deleteMany({ where: { id: { in: createdRoomIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdRoomIds.length = 0;
  createdUserIds.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("TC09 / NFR02 simultaneous booking requests and concurrency protection", () => {
  it("TC09: 10 sequential pairs for the same free interval each give exactly one 201 and one 409", async () => {
    const [a, b] = await makeUsers(2);
    const room = await makeRoom();
    for (let day = 1; day <= 10; day++) {
      const date = istDate(day);
      const [r1, r2] = await Promise.all([post(a, body(room.id, date)), post(b, body(room.id, date))]);
      expect([r1.status, r2.status].sort()).toEqual([201, 409]);
      const loser = r1.status === 409 ? r1 : r2;
      expect(loser.body.error.code).toBe("CONFLICT");
      expect(loser.body.error.message).toBe("The room is already booked for that time.");
      expect(await confirmedCount(room.id, new Date(`${date}T10:00:00+05:30`))).toBe(1);
    }
    expect(await prisma.booking.count({ where: { roomId: room.id } })).toBe(10);
    await verifyNoOverlappingBookings();
  });

  it("NFR02 / CRBS-32: a burst of 10 simultaneous request pairs (20 requests across 10 intervals) leaves exactly one booking and one conflict per pair", async () => {
    const users = await makeUsers(20);
    const room = await makeRoom();
    const dates = Array.from({ length: 10 }, (_, i) => istDate(i + 1));

    // Dispatch all 10 pairs (20 requests) concurrently
    const results = await Promise.all(
      dates.flatMap((d, i) => [
        post(users[2 * i], body(room.id, d)),
        post(users[2 * i + 1], body(room.id, d)),
      ]),
    );

    // Verify aggregate counts
    expect(results.filter((r) => r.status === 201)).toHaveLength(10);
    expect(results.filter((r) => r.status === 409)).toHaveLength(10);

    // Verify per-pair: each interval pair had strictly one 201 and one 409
    for (let i = 0; i < 10; i++) {
      const rA = results[2 * i];
      const rB = results[2 * i + 1];
      const statuses = [rA.status, rB.status].sort();
      expect(statuses).toEqual([201, 409]);

      const winner = rA.status === 201 ? rA : rB;
      const loser = rA.status === 409 ? rA : rB;

      expect(winner.body.status).toBe("CONFIRMED");
      expect(winner.body.roomId).toBe(room.id);
      expect(winner.body.bookingId).toBeGreaterThan(0);

      expect(loser.body.error.code).toBe("CONFLICT");
      expect(loser.body.error.message).toBe("The room is already booked for that time.");

      const date = dates[i];
      expect(await confirmedCount(room.id, new Date(`${date}T10:00:00+05:30`))).toBe(1);
    }

    // Verify database constraint and isolation
    expect(await prisma.booking.count({ where: { roomId: room.id } })).toBe(10);
    await verifyNoOverlappingBookings();
  }, 15_000);

  it("NFR02 / CRBS-32: 10 simultaneous request pairs across 10 distinct rooms each yield exactly one booking and one conflict", async () => {
    const users = await makeUsers(20);
    const rooms = await Promise.all(Array.from({ length: 10 }, () => makeRoom()));
    const targetDate = istDate(2);

    // 10 pairs competing simultaneously, each pair for its own room
    const results = await Promise.all(
      rooms.flatMap((room, i) => [
        post(users[2 * i], body(room.id, targetDate)),
        post(users[2 * i + 1], body(room.id, targetDate)),
      ]),
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(10);
    expect(results.filter((r) => r.status === 409)).toHaveLength(10);

    // Verify each room has exactly 1 winner and 1 loser
    for (let i = 0; i < 10; i++) {
      const rA = results[2 * i];
      const rB = results[2 * i + 1];
      expect([rA.status, rB.status].sort()).toEqual([201, 409]);

      const loser = rA.status === 409 ? rA : rB;
      expect(loser.body.error.code).toBe("CONFLICT");
      expect(loser.body.error.message).toBe("The room is already booked for that time.");

      expect(await confirmedCount(rooms[i].id, new Date(`${targetDate}T10:00:00+05:30`))).toBe(1);
    }

    expect(await prisma.booking.count({ where: { roomId: { in: rooms.map((r) => r.id) } } })).toBe(10);
    await verifyNoOverlappingBookings();
  }, 15_000);

  it("NFR02 / CRBS-32: 10 simultaneous requests for the exact same room and slot yield exactly 1 confirmed booking and 9 conflicts", async () => {
    const users = await makeUsers(10);
    const room = await makeRoom();
    const date = istDate(3);

    // 10 competing requests targeting the exact same room and interval simultaneously
    const results = await Promise.all(users.map((u) => post(u, body(room.id, date))));

    const successes = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(9);

    expect(successes[0].body.status).toBe("CONFIRMED");
    expect(successes[0].body.roomId).toBe(room.id);

    for (const conflict of conflicts) {
      expect(conflict.body.error.code).toBe("CONFLICT");
      expect(conflict.body.error.message).toBe("The room is already booked for that time.");
    }

    expect(await prisma.booking.count({ where: { roomId: room.id } })).toBe(1);
    await verifyNoOverlappingBookings();
  }, 15_000);

  it("TC09: partially overlapping simultaneous requests allow only one", async () => {
    const [a, b] = await makeUsers(2);
    const room = await makeRoom();
    const date = istDate(2);
    const [r1, r2] = await Promise.all([
      post(a, body(room.id, date, "10:00", "11:00")),
      post(b, body(room.id, date, "10:30", "11:30")),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect(await prisma.booking.count({ where: { roomId: room.id } })).toBe(1);
    await verifyNoOverlappingBookings();
  });

  it("TC09: the same interval in two different rooms both succeed", async () => {
    const [a, b] = await makeUsers(2);
    const [room1, room2] = [await makeRoom(), await makeRoom()];
    const date = istDate(2);
    const [r1, r2] = await Promise.all([post(a, body(room1.id, date)), post(b, body(room2.id, date))]);
    expect([r1.status, r2.status]).toEqual([201, 201]);
    await verifyNoOverlappingBookings();
  });

  it("TC09: simultaneous adjacent intervals in the same room both succeed", async () => {
    const [a, b] = await makeUsers(2);
    const room = await makeRoom();
    const date = istDate(2);
    const [r1, r2] = await Promise.all([
      post(a, body(room.id, date, "10:00", "11:00")),
      post(b, body(room.id, date, "11:00", "12:00")),
    ]);
    expect([r1.status, r2.status]).toEqual([201, 201]);
    expect(await prisma.booking.count({ where: { roomId: room.id } })).toBe(2);
    await verifyNoOverlappingBookings();
  });
});
