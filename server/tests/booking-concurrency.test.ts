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
  roomId, date, startTime, endTime, purpose: "Concurrency check",
});

async function makeUsers(count: number) {
  const agents = [];
  for (let i = 0; i < count; i++) {
    const user = await prisma.user.create({
      data: { name: `Test ${i}`, email: `${randomUUID()}@example.test`, passwordHash },
    });
    createdUserIds.push(user.id);
    const agent = request.agent(createApp({ sessionStore: new session.MemoryStore() }));
    const login = await agent.post("/api/auth/login").send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(200);
    agents.push({ agent, csrf: login.headers["x-csrf-token"] as string });
  }
  return agents;
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

describe("TC09 / simultaneous booking requests", () => {
  it("TC09: 10 simultaneous pairs for the same free interval each give exactly one 201 and one 409", async () => {
    const [a, b] = await makeUsers(2);
    const room = await makeRoom();
    for (let day = 1; day <= 10; day++) {
      const date = istDate(day);
      const [r1, r2] = await Promise.all([post(a, body(room.id, date)), post(b, body(room.id, date))]);
      expect([r1.status, r2.status].sort()).toEqual([201, 409]);
      const loser = r1.status === 409 ? r1 : r2;
      expect(loser.body.error.code).toBe("CONFLICT");
      expect(await confirmedCount(room.id, new Date(`${date}T10:00:00+05:30`))).toBe(1);
    }
    expect(await prisma.booking.count({ where: { roomId: room.id } })).toBe(10);
  });

  it("TC09: a burst of 20 requests (2 per interval, 10 intervals) leaves exactly one booking per interval", async () => {
    const users = await makeUsers(20);
    const room = await makeRoom();
    const dates = Array.from({ length: 10 }, (_, i) => istDate(i + 1));
    const results = await Promise.all(
      dates.flatMap((d, i) => [post(users[2 * i], body(room.id, d)), post(users[2 * i + 1], body(room.id, d))]),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(10);
    expect(results.filter((r) => r.status === 409)).toHaveLength(10);
    for (const d of dates) expect(await confirmedCount(room.id, new Date(`${d}T10:00:00+05:30`))).toBe(1);
  });

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
  });

  it("TC09: the same interval in two different rooms both succeed", async () => {
    const [a, b] = await makeUsers(2);
    const [room1, room2] = [await makeRoom(), await makeRoom()];
    const date = istDate(2);
    const [r1, r2] = await Promise.all([post(a, body(room1.id, date)), post(b, body(room2.id, date))]);
    expect([r1.status, r2.status]).toEqual([201, 201]);
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
  });
});
