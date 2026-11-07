import "./helpers/test-db.js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import session from "express-session";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { loginRateLimiter } from "../src/services/rate-limiter.js";

const PASSWORD = "Test-Pass-123!";
let passwordHash = "";

const createdUserIds: number[] = [];
const createdRoomIds: number[] = [];

function istDate(days: number): string {
  const ms = Date.now() + 330 * 60_000 + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function assertStandardError(body: unknown, expectedCode: string): void {
  expect(body).toBeTypeOf("object");
  expect(body).not.toBeNull();
  const resBody = body as { error?: { code?: unknown; message?: unknown } };
  expect(resBody.error).toBeTypeOf("object");
  expect(resBody.error).not.toBeNull();
  expect(resBody.error?.code).toBe(expectedCode);
  expect(typeof resBody.error?.message).toBe("string");
  expect((resBody.error?.message as string).trim().length).toBeGreaterThan(0);
}

async function setupUser(role: "USER" | "ADMIN" = "USER") {
  const tag = randomUUID();
  const user = await prisma.user.create({
    data: { name: `Test ${role}`, email: `${tag}@example.test`, passwordHash, role },
  });
  createdUserIds.push(user.id);

  const room = await prisma.room.create({
    data: { name: `Room ${tag.slice(0, 8)}`, location: "West Wing", capacity: 10, facilities: [] },
  });
  createdRoomIds.push(room.id);

  const agent = request.agent(createApp({ sessionStore: new session.MemoryStore() }));
  const login = await agent.post("/api/auth/login").send({ email: user.email, password: PASSWORD });
  expect(login.status).toBe(200);
  const csrf = login.headers["x-csrf-token"] as string;

  return { agent, user, room, csrf };
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

describe("CRBS-33 / [FR15] Consistent Safe Error Responses", () => {
  describe("HTTP 400 Bad Request", () => {
    it("returns 400 with standard error for malformed JSON body", async () => {
      const app = createApp({ sessionStore: new session.MemoryStore() });
      const res = await request(app)
        .post("/api/auth/login")
        .set("Content-Type", "application/json")
        .send('{"email": "broken-json');

      expect(res.status).toBe(400);
      assertStandardError(res.body, "BAD_REQUEST");
      expect(res.body.error.message).toBe("Malformed JSON body");
    });

    it("returns 400 with standard error for missing/empty login fields", async () => {
      const app = createApp({ sessionStore: new session.MemoryStore() });
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "", password: "" });

      expect(res.status).toBe(400);
      assertStandardError(res.body, "BAD_REQUEST");
      expect(res.body.error.message).toBe("Email and password cannot be empty.");
    });

    it("returns 400 with standard error for invalid date/time query parameters in availability search", async () => {
      const app = createApp({ sessionStore: new session.MemoryStore() });
      const res = await request(app)
        .get("/api/rooms/availability")
        .query({ date: "not-a-date", startTime: "10:00", endTime: "11:00" });

      expect(res.status).toBe(400);
      assertStandardError(res.body, "BAD_REQUEST");
      expect(res.body.error.message).toContain("YYYY-MM-DD");
    });

    it("returns 400 with standard error and preserves field-level validation errors", async () => {
      const { agent, room, csrf } = await setupUser();
      const res = await agent
        .post("/api/bookings")
        .set("x-csrf-token", csrf)
        .send({ roomId: room.id, date: "invalid-date", startTime: "99:99", endTime: "11:00", purpose: "" });

      expect(res.status).toBe(400);
      assertStandardError(res.body, "BAD_REQUEST");
      expect(res.body.error.message).toBe("Invalid booking request.");
      expect(res.body.fields).toBeTypeOf("object");
      expect(res.body.fields.date).toBeDefined();
    });

    it("returns 400 with standard error on admin room creation with invalid fields", async () => {
      const { agent, csrf } = await setupUser("ADMIN");
      const res = await agent
        .post("/api/admin/rooms")
        .set("x-csrf-token", csrf)
        .send({ name: "", location: "", capacity: -5 });

      expect(res.status).toBe(400);
      assertStandardError(res.body, "BAD_REQUEST");
      expect(res.body.error.message).toBe("Invalid room details.");
      expect(res.body.fields).toBeTypeOf("object");
    });
  });

  describe("HTTP 401 Unauthenticated", () => {
    it("returns 401 with standard error when accessing protected route without session", async () => {
      const app = createApp({ sessionStore: new session.MemoryStore() });
      const res = await request(app).get("/api/rooms");

      expect(res.status).toBe(401);
      assertStandardError(res.body, "UNAUTHENTICATED");
      expect(res.body.error.message).toBe("Sign in to view rooms.");
    });

    it("returns 401 with standard error for invalid login credentials", async () => {
      const app = createApp({ sessionStore: new session.MemoryStore() });
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "nonexistent@example.com", password: "WrongPassword123!" });

      expect(res.status).toBe(401);
      assertStandardError(res.body, "UNAUTHENTICATED");
      expect(res.body.error.message).toBe("Invalid email or password.");
    });

    it("returns 401 with standard error when accessing /api/auth/me without session", async () => {
      const app = createApp({ sessionStore: new session.MemoryStore() });
      const res = await request(app).get("/api/auth/me");

      expect(res.status).toBe(401);
      assertStandardError(res.body, "UNAUTHENTICATED");
      expect(res.body.error.message).toBe("Authentication required.");
    });

    it("returns 401 with standard error when creating a booking without session", async () => {
      const app = createApp({ sessionStore: new session.MemoryStore() });
      const res = await request(app)
        .post("/api/bookings")
        .send({ roomId: 1, date: istDate(2), startTime: "10:00", endTime: "11:00", purpose: "Planning" });

      expect(res.status).toBe(401);
      assertStandardError(res.body, "UNAUTHENTICATED");
    });
  });

  describe("HTTP 403 Forbidden", () => {
    it("returns 403 with standard error when authenticated write lacks CSRF token", async () => {
      const { agent, room } = await setupUser();
      const res = await agent
        .post("/api/bookings")
        .send({ roomId: room.id, date: istDate(2), startTime: "10:00", endTime: "11:00", purpose: "No CSRF" });

      expect(res.status).toBe(403);
      assertStandardError(res.body, "FORBIDDEN");
      expect(res.body.error.message).toBe("Missing or invalid CSRF token.");
    });

    it("returns 403 with standard error when authenticated write has invalid CSRF token", async () => {
      const { agent, room } = await setupUser();
      const res = await agent
        .post("/api/bookings")
        .set("x-csrf-token", "invalid-fake-token-value")
        .send({ roomId: room.id, date: istDate(2), startTime: "10:00", endTime: "11:00", purpose: "Bad CSRF" });

      expect(res.status).toBe(403);
      assertStandardError(res.body, "FORBIDDEN");
      expect(res.body.error.message).toBe("Missing or invalid CSRF token.");
    });

    it("returns 403 with standard error when non-admin user attempts admin operations", async () => {
      const { agent, csrf } = await setupUser("USER");
      const res = await agent
        .post("/api/admin/rooms")
        .set("x-csrf-token", csrf)
        .send({ name: "Admin Only Room", location: "Floor 3", capacity: 12 });

      expect(res.status).toBe(403);
      assertStandardError(res.body, "FORBIDDEN");
      expect(res.body.error.message).toBe("Administrator access is required.");
    });
  });

  describe("HTTP 404 Not Found", () => {
    it("returns 404 with standard error for nonexistent API route", async () => {
      const app = createApp({ sessionStore: new session.MemoryStore() });
      const res = await request(app).get("/api/nonexistent-route-xyz");

      expect(res.status).toBe(404);
      assertStandardError(res.body, "NOT_FOUND");
      expect(res.body.error.message).toBe("Resource not found");
    });

    it("returns 404 with standard error when booking an unknown room ID", async () => {
      const { agent, csrf } = await setupUser();
      const res = await agent
        .post("/api/bookings")
        .set("x-csrf-token", csrf)
        .send({ roomId: 999_999, date: istDate(2), startTime: "10:00", endTime: "11:00", purpose: "Unknown Room" });

      expect(res.status).toBe(404);
      assertStandardError(res.body, "NOT_FOUND");
      expect(res.body.error.message).toBe("Room not found.");
    });

    it("returns 404 with standard error when retrieving an unknown booking ID", async () => {
      const { agent } = await setupUser();
      const res = await agent.get("/api/bookings/999999");

      expect(res.status).toBe(404);
      assertStandardError(res.body, "NOT_FOUND");
      expect(res.body.error.message).toBe("Booking not found.");
    });

    it("returns 404 with standard error when updating a nonexistent room as admin", async () => {
      const { agent, csrf } = await setupUser("ADMIN");
      const res = await agent
        .patch("/api/admin/rooms/999999")
        .set("x-csrf-token", csrf)
        .send({ name: "Updated Name" });

      expect(res.status).toBe(404);
      assertStandardError(res.body, "NOT_FOUND");
      expect(res.body.error.message).toBe("Room not found.");
    });
  });

  describe("HTTP 409 Conflict", () => {
    it("returns 409 with standard error when attempting to book an overlapping time slot", async () => {
      const { agent, room, csrf } = await setupUser();
      const date = istDate(4);

      const first = await agent
        .post("/api/bookings")
        .set("x-csrf-token", csrf)
        .send({ roomId: room.id, date, startTime: "10:00", endTime: "11:00", purpose: "Meeting 1" });
      expect(first.status).toBe(201);

      const second = await agent
        .post("/api/bookings")
        .set("x-csrf-token", csrf)
        .send({ roomId: room.id, date, startTime: "10:30", endTime: "11:30", purpose: "Overlapping Meeting" });

      expect(second.status).toBe(409);
      assertStandardError(second.body, "CONFLICT");
      expect(second.body.error.message).toBe("The room is already booked for that time.");
    });

    it("returns 409 with standard error when attempting to cancel a booking past its start time", async () => {
      const { agent, user, room, csrf } = await setupUser();

      // Create a booking directly in database whose start time is in the past
      const pastStart = new Date(Date.now() - 3600 * 1000);
      const pastEnd = new Date(Date.now() + 1800 * 1000);
      const booking = await prisma.booking.create({
        data: {
          userId: user.id,
          roomId: room.id,
          startAt: pastStart,
          endAt: pastEnd,
          purpose: "Past Booking",
        },
      });

      const res = await agent
        .patch(`/api/bookings/${booking.id}/cancel`)
        .set("x-csrf-token", csrf);

      expect(res.status).toBe(409);
      assertStandardError(res.body, "CONFLICT");
      expect(res.body.error.message).toBe("A booking cannot be cancelled at or after its start time.");
    });
  });

  describe("HTTP 500 Internal Server Error & Leak Prevention", () => {
    it("returns generic 500 without leaking stack traces or internal details via controlled test-only fault route", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const sensitiveError = new Error("FATAL pg_hba.conf error: database 'prod_crbs' auth failed for user 'postgres' at /app/server/src/secret-config.ts:42 (SQL: SELECT * FROM password_hashes)");

      const app = createApp({
        sessionStore: new session.MemoryStore(),
        testFaultRoute: () => {
          throw sensitiveError;
        },
      });

      const res = await request(app).get("/api/test-fault");
      consoleSpy.mockRestore();

      expect(res.status).toBe(500);
      assertStandardError(res.body, "INTERNAL_ERROR");
      expect(res.body.error.message).toBe("Something went wrong");

      // Verify strict leak prevention: no stack trace, no SQL, no filesystem paths, no exception message
      const responseText = JSON.stringify(res.body);
      expect(responseText).not.toContain("FATAL");
      expect(responseText).not.toContain("pg_hba");
      expect(responseText).not.toContain("prod_crbs");
      expect(responseText).not.toContain("postgres");
      expect(responseText).not.toContain("secret-config");
      expect(responseText).not.toContain("SELECT");
      expect(responseText).not.toContain("password_hashes");
      expect(responseText).not.toContain("stack");
      expect(responseText).not.toContain(".ts");
      expect(responseText).not.toContain(".js");
      expect(res.body.stack).toBeUndefined();
    });

    it("returns generic 500 without leaking internal details when injected failure occurs in existing route", async () => {
      const { agent } = await setupUser();
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const dbSpy = vi.spyOn(prisma.room, "findMany").mockRejectedValueOnce(
        new Error("PrismaClientKnownRequestError: column Room.internal_secret does not exist in table public.Room at C:\\db\\query.ts:10")
      );

      const res = await agent.get("/api/rooms");
      dbSpy.mockRestore();
      consoleSpy.mockRestore();

      expect(res.status).toBe(500);
      assertStandardError(res.body, "INTERNAL_ERROR");
      expect(res.body.error.message).toBe("Something went wrong");

      const responseText = JSON.stringify(res.body);
      expect(responseText).not.toContain("PrismaClientKnownRequestError");
      expect(responseText).not.toContain("internal_secret");
      expect(responseText).not.toContain("public.Room");
      expect(responseText).not.toContain("query.ts");
      expect(res.body.stack).toBeUndefined();
    });

    it("verifies production createApp does not expose test-only fault route (returns 404)", async () => {
      const prodApp = createApp({ sessionStore: new session.MemoryStore() });
      const res = await request(prodApp).get("/api/test-fault");

      expect(res.status).toBe(404);
      assertStandardError(res.body, "NOT_FOUND");
    });

    it("verifies internal error handler logs error internally to console.error safely without client leak", async () => {
      let loggedError: unknown = null;
      const consoleSpy = vi.spyOn(console, "error").mockImplementation((err) => {
        loggedError = err;
      });

      const uniqueInternalMsg = `simulated_internal_failure_${randomUUID()}`;
      const app = createApp({
        sessionStore: new session.MemoryStore(),
        testFaultRoute: () => {
          throw new Error(uniqueInternalMsg);
        },
      });

      const res = await request(app).get("/api/test-fault");
      consoleSpy.mockRestore();

      expect(res.status).toBe(500);
      // The internal logger captured the error object
      expect(loggedError).toBeInstanceOf(Error);
      expect((loggedError as Error).message).toBe(uniqueInternalMsg);

      // The client received strictly sanitized output
      expect(JSON.stringify(res.body)).not.toContain(uniqueInternalMsg);
      expect(res.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    });
  });
});

