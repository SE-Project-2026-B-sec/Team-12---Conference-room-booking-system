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
const tag = randomUUID().slice(0, 8);
// Every room these tests create carries this prefix, so cleanup only removes our own rows.
const PREFIX = `T-${tag}`;

async function signIn(role: "USER" | "ADMIN") {
  const user = await prisma.user.create({
    data: { name: `Test ${role}`, email: `${randomUUID()}@example.test`, passwordHash, role },
  });
  createdUserIds.push(user.id);
  const agent = request.agent(createApp({ sessionStore: new session.MemoryStore() }));
  const login = await agent.post("/api/auth/login").send({ email: user.email, password: PASSWORD });
  expect(login.status).toBe(200);
  return { agent, csrf: login.headers["x-csrf-token"] as string };
}

const makeRoom = (over: Record<string, unknown> = {}) =>
  prisma.room.create({
    data: { name: `${PREFIX} ${randomUUID().slice(0, 6)}`, location: "Test wing", capacity: 8, facilities: ["Projector"], ...over },
    select: { id: true, name: true, location: true, capacity: true, facilities: true },
  });
const reload = (id: number) =>
  prisma.room.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, location: true, capacity: true, facilities: true } });

beforeAll(async () => {
  const table = await prisma.$queryRaw<{ t: string | null }[]>`SELECT to_regclass('public."Room"')::text AS t`;
  if (!table[0]?.t) throw new Error("Test database has no schema. Run: npm run test:db:prepare");
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

afterEach(async () => {
  loginRateLimiter.clear();
  await prisma.booking.deleteMany({ where: { OR: [{ room: { name: { startsWith: PREFIX } } }, { userId: { in: createdUserIds } }] } });
  await prisma.room.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("TC13 / admin updates a room", () => {
  it("TC13: valid update persists, is returned, and appears in GET /api/rooms", async () => {
    const { agent, csrf } = await signIn("ADMIN");
    const room = await makeRoom();
    const res = await agent
      .patch(`/api/admin/rooms/${room.id}`)
      .set("x-csrf-token", csrf)
      .send({ name: ` ${PREFIX} Renamed `, location: " Floor 3 ", capacity: 20, facilities: [" TV ", "Phone"] });

    const expected = { id: room.id, name: `${PREFIX} Renamed`, location: "Floor 3", capacity: 20, facilities: ["TV", "Phone"] };
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expected);
    expect(await reload(room.id)).toEqual(expected);
    expect((await agent.get("/api/rooms")).body).toContainEqual(expected);
  });

  it("TC13: a partial update changes only the given fields", async () => {
    const { agent, csrf } = await signIn("ADMIN");
    const room = await makeRoom();
    const res = await agent.patch(`/api/admin/rooms/${room.id}`).set("x-csrf-token", csrf).send({ capacity: 12 });
    expect(res.status).toBe(200);
    expect(await reload(room.id)).toEqual({ ...room, capacity: 12 });

    const clear = await agent.patch(`/api/admin/rooms/${room.id}`).set("x-csrf-token", csrf).send({ facilities: [] });
    expect(clear.status).toBe(200);
    expect(await reload(room.id)).toEqual({ ...room, capacity: 12, facilities: [] });
  });

  it("TC13: unknown fields and a client-supplied role are ignored", async () => {
    const { agent, csrf } = await signIn("ADMIN");
    const room = await makeRoom();
    const res = await agent
      .patch(`/api/admin/rooms/${room.id}`)
      .set("x-csrf-token", csrf)
      .send({ capacity: 9, id: 999999, role: "USER", createdAt: "2000-01-01", bogus: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...room, capacity: 9 });
    expect(await prisma.room.count({ where: { id: 999999 } })).toBe(0);
  });

  it("TC13: updating a room does not cancel or alter its existing bookings", async () => {
    const { agent, csrf } = await signIn("ADMIN");
    const room = await makeRoom();
    const user = await prisma.user.create({
      data: { name: "Booker", email: `${randomUUID()}@example.test`, passwordHash },
    });
    createdUserIds.push(user.id);
    const startAt = new Date(Date.now() + 3 * 86_400_000);
    const booking = await prisma.booking.create({
      data: { userId: user.id, roomId: room.id, purpose: "Keep me", startAt, endAt: new Date(startAt.getTime() + 3_600_000), status: "CONFIRMED" },
    });

    const res = await agent
      .patch(`/api/admin/rooms/${room.id}`)
      .set("x-csrf-token", csrf)
      .send({ name: `${PREFIX} Changed`, capacity: 3 });
    expect(res.status).toBe(200);

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after).toEqual(booking); // every column, including updatedAt, is unchanged
    expect(after.status).toBe("CONFIRMED");
  });

  it.each([
    ["blank name", { name: "  " }, "name"],
    ["name over 100 characters", { name: "x".repeat(101) }, "name"],
    ["null name", { name: null }, "name"],
    ["blank location", { location: "" }, "location"],
    ["capacity 0", { capacity: 0 }, "capacity"],
    ["negative capacity", { capacity: -1 }, "capacity"],
    ["decimal capacity", { capacity: 1.5 }, "capacity"],
    ["string capacity", { capacity: "8" }, "capacity"],
    ["facilities not an array", { facilities: "TV" }, "facilities"],
    ["facilities with a non-string", { facilities: ["TV", 1] }, "facilities"],
    ["facilities with an empty entry", { facilities: [""] }, "facilities"],
    ["one valid and one invalid field", { name: "Fine", capacity: 0 }, "capacity"],
  ])("TC13: %s returns 400 and changes nothing", async (_label, payload, field) => {
    const { agent, csrf } = await signIn("ADMIN");
    const room = await makeRoom();
    const res = await agent.patch(`/api/admin/rooms/${room.id}`).set("x-csrf-token", csrf).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(res.body.fields).toHaveProperty(field);
    expect(await reload(room.id)).toEqual(room);
  });

  it.each([
    ["an empty body", {}],
    ["only unknown fields", { bogus: true, role: "ADMIN" }],
  ])("TC13: %s returns 400 and changes nothing", async (_label, payload) => {
    const { agent, csrf } = await signIn("ADMIN");
    const room = await makeRoom();
    const res = await agent.patch(`/api/admin/rooms/${room.id}`).set("x-csrf-token", csrf).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty("body");
    expect(await reload(room.id)).toEqual(room);
  });

  it("TC13: an unknown room id returns 404", async () => {
    const { agent, csrf } = await signIn("ADMIN");
    const res = await agent.patch("/api/admin/rooms/2000000000").set("x-csrf-token", csrf).send({ capacity: 5 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it.each(["abc", "0", "-1", "1.5", "1e3", "99999999999"])("TC13: id %s returns 400", async (id) => {
    const { agent, csrf } = await signIn("ADMIN");
    const res = await agent.patch(`/api/admin/rooms/${id}`).set("x-csrf-token", csrf).send({ capacity: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(res.body.fields).toHaveProperty("id");
  });
});

describe("TC14 / admin-only update", () => {
  it("TC14: a regular user gets 403 and the room is unchanged, even with role in the body", async () => {
    const { agent, csrf } = await signIn("USER");
    const room = await makeRoom();
    const res = await agent
      .patch(`/api/admin/rooms/${room.id}`)
      .set("x-csrf-token", csrf)
      .send({ capacity: 99, role: "ADMIN" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await reload(room.id)).toEqual(room);
  });

  it("TC14: no session returns 401 and the room is unchanged", async () => {
    const room = await makeRoom();
    const res = await request(createApp({ sessionStore: new session.MemoryStore() }))
      .patch(`/api/admin/rooms/${room.id}`)
      .send({ capacity: 99 });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(await reload(room.id)).toEqual(room);
  });

  it("TC14: missing or wrong CSRF token is rejected with 403 and the room is unchanged", async () => {
    const { agent } = await signIn("ADMIN");
    const room = await makeRoom();
    const missing = await agent.patch(`/api/admin/rooms/${room.id}`).send({ capacity: 99 });
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe("FORBIDDEN");
    const wrong = await agent.patch(`/api/admin/rooms/${room.id}`).set("x-csrf-token", "nope").send({ capacity: 99 });
    expect(wrong.status).toBe(403);
    expect(await reload(room.id)).toEqual(room);
  });
});
