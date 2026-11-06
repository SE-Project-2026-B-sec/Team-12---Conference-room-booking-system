
import "./helpers/test-db.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import session from "express-session";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { loginRateLimiter } from "../src/services/rate-limiter.js";

const PASSWORD = "Test-Pass-123!";
let passwordHash = "";

const userIds: number[] = [];
const roomIds: number[] = [];

function istDate(days: number): string {
  const ms = Date.now() + 330 * 60_000 + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

async function signIn(role: "USER" | "ADMIN" = "USER") {
  const user = await prisma.user.create({
    data: {
      name: "Audit Test User",
      email: `${randomUUID()}@example.test`,
      passwordHash,
      role,
    },
  });
  userIds.push(user.id);

  const agent = request.agent(
    createApp({ sessionStore: new session.MemoryStore() })
  );

  const login = await agent
    .post("/api/auth/login")
    .send({ email: user.email, password: PASSWORD });

  expect(login.status).toBe(200);

  return {
    agent,
    user,
    csrf: login.headers["x-csrf-token"] as string,
  };
}

async function createRoom() {
  const room = await prisma.room.create({
    data: {
      name: `Audit Room ${randomUUID()}`,
      location: "Test wing",
      capacity: 10,
      facilities: [],
    },
  });

  roomIds.push(room.id);
  return room;
}

async function auditRecords(actorId: number) {
  return prisma.auditLog.findMany({
    where: { actorId },
    orderBy: { createdAt: "asc" },
  });
}

beforeAll(async () => {
  const table = await prisma.$queryRaw<{ t: string | null }[]>`
    SELECT to_regclass('public."AuditLog"')::text AS t
  `;

  if (!table[0]?.t) {
    throw new Error("AuditLog table is missing. Check Prisma migrations.");
  }

  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

afterEach(async () => {
  loginRateLimiter.clear();

  await prisma.auditLog.deleteMany({
    where: { actorId: { in: userIds } },
  });

  await prisma.booking.deleteMany({
    where: {
      OR: [
        { roomId: { in: roomIds } },
        { userId: { in: userIds } },
      ],
    },
  });

  await prisma.room.deleteMany({
    where: { id: { in: roomIds } },
  });

  await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  });

  userIds.length = 0;
  roomIds.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("CRBS-35 / Audit Logging", () => {
  it("records BOOKING_CREATED with the correct actor and entity", async () => {
    const { agent, user, csrf } = await signIn();
    const room = await createRoom();
    const date = istDate(3);

    const response = await agent
      .post("/api/bookings")
      .set("x-csrf-token", csrf)
      .send({
        roomId: room.id,
        date,
        startTime: "10:00",
        endTime: "11:00",
        purpose: "Audit test booking",
      });

    expect(response.status).toBe(201);

    const logs = await auditRecords(user.id);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorId: user.id,
      action: "BOOKING_CREATED",
      entityType: "Booking",
      entityId: String(response.body.bookingId),
    });
  });

  it("records BOOKING_CANCELLED and does not duplicate logs on repeated cancellation", async () => {
    const { agent, user, csrf } = await signIn();
    const room = await createRoom();
    const date = istDate(3);

    const booking = await agent
      .post("/api/bookings")
      .set("x-csrf-token", csrf)
      .send({
        roomId: room.id,
        date,
        startTime: "12:00",
        endTime: "13:00",
        purpose: "Cancellation audit test",
      });

    expect(booking.status).toBe(201);

    const bookingId = booking.body.bookingId;

    const cancel = () =>
      agent
        .patch(`/api/bookings/${bookingId}/cancel`)
        .set("x-csrf-token", csrf);

    const first = await cancel();
    expect(first.status).toBe(200);

    const second = await cancel();
    expect(second.status).toBe(200);

    const logs = await auditRecords(user.id);

    expect(logs.filter((log) => log.action === "BOOKING_CREATED")).toHaveLength(1);
    expect(logs.filter((log) => log.action === "BOOKING_CANCELLED")).toHaveLength(1);

    expect(logs.find((log) => log.action === "BOOKING_CANCELLED")).toMatchObject({
      actorId: user.id,
      entityType: "Booking",
      entityId: String(bookingId),
    });
  });

  it("records ROOM_CREATED for an admin-created room", async () => {
    const { agent, user, csrf } = await signIn("ADMIN");

    const response = await agent
      .post("/api/admin/rooms")
      .set("x-csrf-token", csrf)
      .send({
        name: `Audit Created ${randomUUID()}`,
        location: "Test floor",
        capacity: 12,
        facilities: ["Projector"],
      });

    expect(response.status).toBe(201);
    roomIds.push(response.body.id);

    const logs = await auditRecords(user.id);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorId: user.id,
      action: "ROOM_CREATED",
      entityType: "Room",
      entityId: String(response.body.id),
    });
  });

  it("records ROOM_UPDATED for an admin-updated room", async () => {
    const { agent, user, csrf } = await signIn("ADMIN");
    const room = await createRoom();

    const response = await agent
      .patch(`/api/admin/rooms/${room.id}`)
      .set("x-csrf-token", csrf)
      .send({ capacity: 20 });

    expect(response.status).toBe(200);

    const logs = await auditRecords(user.id);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorId: user.id,
      action: "ROOM_UPDATED",
      entityType: "Room",
      entityId: String(room.id),
    });
  });

  it("does not create an audit record for invalid booking input", async () => {
    const { agent, user, csrf } = await signIn();
    const room = await createRoom();

    const response = await agent
      .post("/api/bookings")
      .set("x-csrf-token", csrf)
      .send({
        roomId: room.id,
        date: istDate(3),
        startTime: "10:00",
        endTime: "10:00",
        purpose: "Invalid booking",
      });

    expect(response.status).toBe(400);
    expect(await auditRecords(user.id)).toHaveLength(0);
  });
});
