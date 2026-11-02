// Integration tests: need Postgres with the *_test database (see README "Integration tests").
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

const body = (roomId: number, over: Record<string, unknown> = {}) => ({
  roomId,
  date: istDate(3),
  startTime: "10:00",
  endTime: "11:00",
  purpose: "Sprint planning",
  ...over,
});

async function setup() {
  const tag = randomUUID();
  const user = await prisma.user.create({
    data: { name: "Test User", email: `${tag}@example.test`, passwordHash },
  });
  createdUserIds.push(user.id);
  const room = await prisma.room.create({
    data: { name: `Room ${tag.slice(0, 8)}`, location: "Test wing", capacity: 8, facilities: [] },
  });
  createdRoomIds.push(room.id);

  const agent = request.agent(createApp({ sessionStore: new session.MemoryStore() }));
  const login = await agent.post("/api/auth/login").send({ email: user.email, password: PASSWORD });
  expect(login.status).toBe(200);
  const csrf = login.headers["x-csrf-token"] as string;
  return { agent, user, room, csrf };
}

const bookingCount = (roomId: number) => prisma.booking.count({ where: { roomId } });

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

describe("TC04 / create booking", () => {
  it("TC04: valid booking returns 201 CONFIRMED and stores exactly one row for the session user", async () => {
    const { agent, user, room, csrf } = await setup();
    const date = istDate(3);
    const res = await agent.post("/api/bookings").set("x-csrf-token", csrf).send(body(room.id, { date }));

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      bookingId: expect.any(Number),
      status: "CONFIRMED",
      roomId: room.id,
      startAt: new Date(`${date}T10:00:00+05:30`).toISOString(),
      endAt: new Date(`${date}T11:00:00+05:30`).toISOString(),
    });

    const rows = await prisma.booking.findMany({ where: { roomId: room.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: res.body.bookingId,
      userId: user.id,
      purpose: "Sprint planning",
      status: "CONFIRMED",
    });
    // No booking-list endpoint exists yet; ownership is verified through the owner's rows.
    expect(await prisma.booking.count({ where: { userId: user.id, id: res.body.bookingId } })).toBe(1);
  });

  it("TC04: userId and status in the body are ignored", async () => {
    const { agent, user, room, csrf } = await setup();
    const res = await agent
      .post("/api/bookings")
      .set("x-csrf-token", csrf)
      .send(body(room.id, { userId: 999999, status: "CANCELLED" }));

    expect(res.status).toBe(201);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: res.body.bookingId } });
    expect(row.userId).toBe(user.id);
    expect(row.status).toBe("CONFIRMED");
  });

  it("TC04: overlapping booking returns 409 CONFLICT and adjacent booking returns 201", async () => {
    const { agent, room, csrf } = await setup();
    const post = (over: Record<string, unknown>) =>
      agent.post("/api/bookings").set("x-csrf-token", csrf).send(body(room.id, over));

    expect((await post({})).status).toBe(201); // 10:00-11:00
    const overlap = await post({ startTime: "10:30", endTime: "11:30" });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe("CONFLICT");
    expect((await post({ startTime: "11:00", endTime: "12:00" })).status).toBe(201); // adjacent after
    expect((await post({ startTime: "09:00", endTime: "10:00" })).status).toBe(201); // adjacent before
    expect(await bookingCount(room.id)).toBe(3);
  });
});

describe("TC05 / invalid booking input", () => {
  it.each([
    ["missing fields", {}],
    ["malformed date", { date: "2026-02-30" }],
    ["malformed time", { startTime: "9:00" }],
    ["empty purpose", { purpose: "   " }],
    ["purpose over 200 characters", { purpose: "x".repeat(201) }],
    ["past start", { date: istDate(-1) }],
    ["outside 09:00-18:00", { startTime: "08:00", endTime: "09:00" }],
    ["duration over 240 minutes", { startTime: "09:00", endTime: "13:30" }],
    ["equal start and end", { startTime: "10:00", endTime: "10:00" }],
    ["date more than 30 days ahead", { date: istDate(31) }],
  ])("TC05: %s returns 400 and persists nothing", async (_name, over) => {
    const { agent, room, csrf } = await setup();
    const payload = _name === "missing fields" ? {} : body(room.id, over);
    const res = await agent.post("/api/bookings").set("x-csrf-token", csrf).send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(typeof res.body.error.message).toBe("string");
    expect(Object.keys(res.body.fields).length).toBeGreaterThan(0);
    expect(await bookingCount(room.id)).toBe(0);
  });

  it("TC05: nonexistent room returns 404 and persists nothing", async () => {
    const { agent, csrf } = await setup();
    const before = await prisma.booking.count();
    const res = await agent.post("/api/bookings").set("x-csrf-token", csrf).send(body(2_000_000_000));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(await prisma.booking.count()).toBe(before);
  });

  it("TC05: no session returns 401", async () => {
    const { room } = await setup();
    const res = await request(createApp({ sessionStore: new session.MemoryStore() }))
      .post("/api/bookings")
      .send(body(room.id));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(await bookingCount(room.id)).toBe(0);
  });

  it("TC05: missing or wrong CSRF token returns 403 and persists nothing", async () => {
    const { agent, room, csrf } = await setup();
    const missing = await agent.post("/api/bookings").send(body(room.id));
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe("FORBIDDEN");
    const wrong = await agent.post("/api/bookings").set("x-csrf-token", csrf.replace(/./, (c) => (c === "a" ? "b" : "a"))).send(body(room.id));
    expect(wrong.status).toBe(403);
    expect(await bookingCount(room.id)).toBe(0);
  });
});

describe("CRBS-25 / My Bookings", () => {
  it("returns only bookings belonging to the logged-in user", async () => {
    const { agent, user, room } = await setup();

    const otherUser = await prisma.user.create({
      data: {
        name: "Other User",
        email: `${randomUUID()}@example.test`,
        passwordHash,
      },
    });
    createdUserIds.push(otherUser.id);

    const otherAgent = request.agent(
      createApp({ sessionStore: new session.MemoryStore() }),
    );
    const login = await otherAgent
      .post("/api/auth/login")
      .send({ email: otherUser.email, password: PASSWORD });
    expect(login.status).toBe(200);

    const startAt = new Date(Date.now() + 2 * 86_400_000);
    const endAt = new Date(startAt.getTime() + 60 * 60_000);

    const ownBooking = await prisma.booking.create({
      data: {
        userId: user.id,
        roomId: room.id,
        startAt,
        endAt,
        purpose: "My meeting",
      },
    });

    await prisma.booking.create({
      data: {
        userId: otherUser.id,
        roomId: room.id,
        startAt: new Date(startAt.getTime() + 2 * 60 * 60_000),
        endAt: new Date(endAt.getTime() + 2 * 60 * 60_000),
        purpose: "Other user's meeting",
      },
    });

    const response = await agent.get("/api/bookings");
    expect(response.status).toBe(200);
    expect(response.body.bookings).toHaveLength(1);
    expect(response.body.bookings[0]).toMatchObject({
      id: ownBooking.id,
      roomId: room.id,
      purpose: "My meeting",
      status: "CONFIRMED",
    });
  });

  it("allows the owner to view their booking details", async () => {
    const { agent, user, room } = await setup();
    const startAt = new Date(Date.now() + 2 * 86_400_000);
    const booking = await prisma.booking.create({
      data: {
        userId: user.id,
        roomId: room.id,
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60_000),
        purpose: "Project meeting",
      },
    });

    const response = await agent.get(`/api/bookings/${booking.id}`);
    expect(response.status).toBe(200);
    expect(response.body.booking).toMatchObject({
      id: booking.id,
      roomId: room.id,
      purpose: "Project meeting",
    });
  });

  it("returns 404 when another user tries to view a booking", async () => {
    const { agent, user, room } = await setup();
    const otherUser = await prisma.user.create({
      data: {
        name: "Other User",
        email: `${randomUUID()}@example.test`,
        passwordHash,
      },
    });
    createdUserIds.push(otherUser.id);

    const startAt = new Date(Date.now() + 2 * 86_400_000);
    const booking = await prisma.booking.create({
      data: {
        userId: otherUser.id,
        roomId: room.id,
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60_000),
        purpose: "Private meeting",
      },
    });

    expect(user.id).not.toBe(otherUser.id);
    const response = await agent.get(`/api/bookings/${booking.id}`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for an unknown booking ID", async () => {
    const { agent } = await setup();
    const response = await agent.get("/api/bookings/999999999");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 401 when the user is not authenticated", async () => {
    const response = await request(
      createApp({ sessionStore: new session.MemoryStore() }),
    ).get("/api/bookings");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("CRBS-26 / booking cancellation (FR10 + FR11)", () => {
  async function createFutureBooking(userId: number, roomId: number) {
    const date = istDate(3);
    const startAt = new Date(`${date}T10:00:00+05:30`);
    const endAt = new Date(`${date}T11:00:00+05:30`);

    return prisma.booking.create({
      data: {
        userId,
        roomId,
        startAt,
        endAt,
        purpose: "Cancellation test",
        status: "CONFIRMED",
      },
    });
  }

  it("allows the owner to cancel a future booking", async () => {
    const { agent, user, room, csrf } = await setup();
    const booking = await createFutureBooking(user.id, room.id);
    const res = await agent
      .patch(`/api/bookings/${booking.id}/cancel`)
      .set("x-csrf-token", csrf);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ bookingId: booking.id, status: "CANCELLED" });
    const saved = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(saved.status).toBe("CANCELLED");
  });

  it("does not allow another user to cancel the booking", async () => {
    const owner = await setup();
    const otherUser = await setup();
    const booking = await createFutureBooking(owner.user.id, owner.room.id);
    const res = await otherUser.agent
      .patch(`/api/bookings/${booking.id}/cancel`)
      .set("x-csrf-token", otherUser.csrf);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    const saved = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(saved.status).toBe("CONFIRMED");
  });

  it("returns success when the owner cancels the same booking again", async () => {
    const { agent, user, room, csrf } = await setup();
    const booking = await createFutureBooking(user.id, room.id);
    const first = await agent
      .patch(`/api/bookings/${booking.id}/cancel`)
      .set("x-csrf-token", csrf);
    const second = await agent
      .patch(`/api/bookings/${booking.id}/cancel`)
      .set("x-csrf-token", csrf);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.status).toBe("CANCELLED");
  });

  it("rejects cancellation at or after the booking start time", async () => {
    const { agent, user, room, csrf } = await setup();
    const startAt = new Date(Date.now() - 60_000);
    const booking = await prisma.booking.create({
      data: {
        userId: user.id,
        roomId: room.id,
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60_000),
        purpose: "Already started booking",
        status: "CONFIRMED",
      },
    });

    const res = await agent
      .patch(`/api/bookings/${booking.id}/cancel`)
      .set("x-csrf-token", csrf);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    const saved = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(saved.status).toBe("CONFIRMED");
  });

  it("makes the room available again after cancellation", async () => {
    const { agent, user, room, csrf } = await setup();
    const booking = await createFutureBooking(user.id, room.id);
    const date = istDate(3);
    const before = await request(createApp()).get(
      `/api/rooms/availability?date=${date}&startTime=10:00&endTime=11:00`,
    );
    expect(before.status).toBe(200);
    expect(before.body.rooms.some((item: { id: number }) => item.id === room.id)).toBe(false);

    const cancelled = await agent
      .patch(`/api/bookings/${booking.id}/cancel`)
      .set("x-csrf-token", csrf);
    expect(cancelled.status).toBe(200);

    const after = await request(createApp()).get(
      `/api/rooms/availability?date=${date}&startTime=10:00&endTime=11:00`,
    );
    expect(after.status).toBe(200);
    expect(after.body.rooms.some((item: { id: number }) => item.id === room.id)).toBe(true);
  });

  it("requires an authenticated session", async () => {
    const { user, room } = await setup();
    const booking = await createFutureBooking(user.id, room.id);
    const res = await request(createApp())
      .patch(`/api/bookings/${booking.id}/cancel`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 404 for an unknown booking ID", async () => {
    const { agent, csrf } = await setup();
    const res = await agent
      .patch("/api/bookings/2000000000/cancel")
      .set("x-csrf-token", csrf);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});