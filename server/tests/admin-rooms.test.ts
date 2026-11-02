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

const room = (over: Record<string, unknown> = {}) => ({
  name: `${PREFIX} ${randomUUID().slice(0, 6)}`,
  location: "Test wing",
  capacity: 8,
  facilities: ["Projector", "Whiteboard"],
  ...over,
});
const testRoomCount = () => prisma.room.count({ where: { name: { startsWith: PREFIX } } });

beforeAll(async () => {
  const table = await prisma.$queryRaw<{ t: string | null }[]>`SELECT to_regclass('public."Room"')::text AS t`;
  if (!table[0]?.t) throw new Error("Test database has no schema. Run: npm run test:db:prepare");
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

afterEach(async () => {
  loginRateLimiter.clear();
  await prisma.room.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("TC13 / admin creates a room", () => {
  it("TC13: valid create returns 201, appears in GET /api/rooms and is stored once", async () => {
    const { agent, csrf } = await signIn("ADMIN");
    const payload = room({ name: `  ${PREFIX} Main  `, location: " Floor 2 ", facilities: [" Projector ", "TV"] });
    const res = await agent.post("/api/admin/rooms").set("x-csrf-token", csrf).send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      name: `${PREFIX} Main`,
      location: "Floor 2",
      capacity: 8,
      facilities: ["Projector", "TV"],
    });

    const list = await agent.get("/api/rooms");
    expect(list.status).toBe(200);
    expect(list.body).toContainEqual(res.body);
    expect(await testRoomCount()).toBe(1);
    expect(await prisma.room.count({ where: { id: res.body.id } })).toBe(1);
  });

  it("TC13: facilities default to [] and unknown fields are ignored", async () => {
    const { agent, csrf } = await signIn("ADMIN");
    const { facilities: _omit, ...noFacilities } = room();
    void _omit;
    const res = await agent
      .post("/api/admin/rooms")
      .set("x-csrf-token", csrf)
      .send({ ...noFacilities, id: 1, createdAt: "2000-01-01", bogus: true });
    expect(res.status).toBe(201);
    expect(res.body.facilities).toEqual([]);
    expect(Object.keys(res.body).sort()).toEqual(["capacity", "facilities", "id", "location", "name"]);
    expect(res.body.id).not.toBe(1);
  });

  it("TC13: a role supplied in the body is ignored", async () => {
    const { agent, csrf } = await signIn("USER");
    const res = await agent.post("/api/admin/rooms").set("x-csrf-token", csrf).send({ ...room(), role: "ADMIN" });
    expect(res.status).toBe(403);
    expect(await testRoomCount()).toBe(0);
  });

  it.each([
    ["missing name", { name: undefined }, "name"],
    ["blank name", { name: "   " }, "name"],
    ["name over 100 characters", { name: "x".repeat(101) }, "name"],
    ["non-string name", { name: 5 }, "name"],
    ["missing location", { location: undefined }, "location"],
    ["blank location", { location: " " }, "location"],
    ["missing capacity", { capacity: undefined }, "capacity"],
    ["capacity 0", { capacity: 0 }, "capacity"],
    ["negative capacity", { capacity: -3 }, "capacity"],
    ["decimal capacity", { capacity: 2.5 }, "capacity"],
    ["string capacity", { capacity: "8" }, "capacity"],
    ["facilities not an array", { facilities: "Projector" }, "facilities"],
    ["facilities with a non-string", { facilities: ["TV", 3] }, "facilities"],
    ["facilities with an empty entry", { facilities: ["TV", "  "] }, "facilities"],
  ])("TC13: %s returns 400 and persists nothing", async (_label, over, field) => {
    const { agent, csrf } = await signIn("ADMIN");
    const res = await agent.post("/api/admin/rooms").set("x-csrf-token", csrf).send(room(over));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(res.body.fields).toHaveProperty(field);
    expect(await testRoomCount()).toBe(0);
  });
});

describe("TC14 / admin-only access", () => {
  it("TC14: a regular user gets 403 and nothing is created", async () => {
    const { agent, csrf } = await signIn("USER");
    const res = await agent.post("/api/admin/rooms").set("x-csrf-token", csrf).send(room());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await testRoomCount()).toBe(0);
  });

  it("TC14: no session returns 401 and nothing is created", async () => {
    const res = await request(createApp({ sessionStore: new session.MemoryStore() }))
      .post("/api/admin/rooms")
      .send(room());
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(await testRoomCount()).toBe(0);
  });

  it("TC14: missing or wrong CSRF token is rejected with 403 and nothing is created", async () => {
    const { agent } = await signIn("ADMIN");
    const missing = await agent.post("/api/admin/rooms").send(room());
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe("FORBIDDEN");
    const wrong = await agent.post("/api/admin/rooms").set("x-csrf-token", "nope").send(room());
    expect(wrong.status).toBe(403);
    expect(await testRoomCount()).toBe(0);
  });
});
