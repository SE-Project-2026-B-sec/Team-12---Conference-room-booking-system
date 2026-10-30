import "./helpers/test-db.js";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";

const tag = randomUUID();
const email = `rooms-${tag}@example.test`;
const password = "Synthetic-test-only!";
let userId: number;
const roomIds: number[] = [];
const app = createApp();

beforeAll(async () => {
  const user = await prisma.user.create({ data: { name: "TC01 User", email, passwordHash: await bcrypt.hash(password, 4) } });
  userId = user.id;
  for (const name of ["B", "A", "A"]) {
    const room = await prisma.room.create({ data: { name: `TC01 ${tag} ${name}`, location: "Test Block", capacity: 8, facilities: name === "A" ? [] : ["Whiteboard"] } });
    roomIds.push(room.id);
  }
});

afterAll(async () => {
  await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("TC01 / FR02 real room-listing API", () => {
  it("returns the public fields and stable name/ID order after real login", async () => {
    const agent = request.agent(app);
    expect((await agent.post("/api/auth/login").send({ email, password })).status).toBe(200);
    const response = await agent.get("/api/rooms");
    expect(response.status).toBe(200);
    const expected = await prisma.room.findMany({
      select: { id: true, name: true, location: true, capacity: true, facilities: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    expect(response.body).toEqual(expected);
    const fixtures = response.body.filter((room: { id: number }) => roomIds.includes(room.id));
    expect(fixtures).toHaveLength(3);
    expect(fixtures[0].facilities).toEqual([]);
    expect(Object.keys(fixtures[0]).sort()).toEqual(["capacity", "facilities", "id", "location", "name"]);
  });

  it("rejects an unauthenticated request", async () => {
    expect((await request(app).get("/api/rooms")).status).toBe(401);
  });

  it("rejects the former session after logout", async () => {
    const agent = request.agent(app);
    const login = await agent.post("/api/auth/login").send({ email, password });
    expect(login.status).toBe(200);
    expect((await agent.post("/api/auth/logout").set("x-csrf-token", login.headers["x-csrf-token"])).status).toBe(200);
    expect((await agent.get("/api/rooms")).status).toBe(401);
  });
});
