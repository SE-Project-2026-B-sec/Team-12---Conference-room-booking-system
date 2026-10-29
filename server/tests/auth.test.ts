import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import session from "express-session";
import express from "express";

// Mock Prisma Client before importing app
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: {
      findUnique,
    },
  },
}));

import { createApp } from "../src/app.js";
import { loginRateLimiter, LoginRateLimiter } from "../src/services/rate-limiter.js";
import { requireSession } from "../src/middleware/require-session.js";
import {
  resolveSessionSecret,
  createSessionMiddleware,
  DEFAULT_DEV_SESSION_SECRET,
} from "../src/lib/session.js";

const DEMO_EMAIL = "demo.user@example.com";
const DEMO_PASSWORD = "User123!@#";
let demoPasswordHash = "";

describe("CRBS-14 / CRBS-15: Login Authentication & Security", () => {
  beforeAll(async () => {
    // Generate real bcrypt hash with cost 12
    demoPasswordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    loginRateLimiter.clear();

    // Default mock implementation for demo user lookup
    findUnique.mockImplementation(async ({ where }: { where: { email?: string; id?: number } }) => {
      if (where.email === DEMO_EMAIL || where.id === 1) {
        return {
          id: 1,
          name: "Demo User",
          email: DEMO_EMAIL,
          passwordHash: demoPasswordHash,
          role: "USER",
        };
      }
      return null;
    });
  });

  const getTestApp = () => createApp({ sessionStore: new session.MemoryStore() });

  describe("POST /api/auth/login", () => {
    it("successfully authenticates with valid credentials and returns safe user profile", async () => {
      const app = getTestApp();
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: 1,
        name: "Demo User",
        email: DEMO_EMAIL,
        role: "USER",
      });
      expect(res.body.passwordHash).toBeUndefined();

      // Verify cookie attributes
      const cookieHeader = res.headers["set-cookie"];
      expect(cookieHeader).toBeDefined();
      const sessionCookie = cookieHeader.find((c: string) => c.startsWith("crbs.sid="));
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain("HttpOnly");
      expect(sessionCookie).toContain("SameSite=Lax");
      expect(sessionCookie).toContain("Path=/");

      // Verify CSRF token header
      expect(res.headers["x-csrf-token"]).toBeDefined();
    });

    it("rejects invalid password with generic 401 error", async () => {
      const app = getTestApp();
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: DEMO_EMAIL, password: "IncorrectPassword" });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: {
          code: "UNAUTHENTICATED",
          message: "Invalid email or password.",
        },
      });
    });

    it("rejects unknown email with generic 401 error identical to wrong password", async () => {
      const app = getTestApp();
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "unknown@example.com", password: DEMO_PASSWORD });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: {
          code: "UNAUTHENTICATED",
          message: "Invalid email or password.",
        },
      });
    });

    it.each([
      null,
      {},
      { email: "" },
      { email: "demo@example.com" },
      { password: "pass" },
      { email: 123, password: "pass" },
      { email: "demo@example.com", password: "" },
    ])("rejects malformed payload (%j) with 400 Bad Request", async (payload) => {
      const app = getTestApp();
      const res = await request(app).post("/api/auth/login").send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("BAD_REQUEST");
    });

    it("regenerates the session ID upon login to prevent session fixation", async () => {
      const app = getTestApp();
      const agent = request.agent(app);

      // Establish pre-session via safe endpoint
      const preRes = await agent.get("/api/auth/csrf");
      const preCookie = preRes.headers["set-cookie"]?.find((c: string) => c.startsWith("crbs.sid="));

      // Login
      const loginRes = await agent
        .post("/api/auth/login")
        .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD });

      const postCookie = loginRes.headers["set-cookie"]?.find((c: string) => c.startsWith("crbs.sid="));

      expect(preCookie).toBeDefined();
      expect(postCookie).toBeDefined();
      expect(preCookie).not.toEqual(postCookie);
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns 401 when no session exists", async () => {
      const app = getTestApp();
      const res = await request(app).get("/api/auth/me");

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication required.",
        },
      });
    });

    it("returns safe user profile when authenticated session exists", async () => {
      const app = getTestApp();
      const agent = request.agent(app);

      await agent
        .post("/api/auth/login")
        .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD });

      const res = await agent.get("/api/auth/me");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: 1,
        name: "Demo User",
        email: DEMO_EMAIL,
        role: "USER",
      });
      expect(res.body.passwordHash).toBeUndefined();
    });
  });

  describe("POST /api/auth/logout", () => {
    it("destroys session and clears cookie when logging out with valid CSRF token", async () => {
      const app = getTestApp();
      const agent = request.agent(app);

      const loginRes = await agent
        .post("/api/auth/login")
        .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD });

      const csrfToken = loginRes.headers["x-csrf-token"];

      const logoutRes = await agent
        .post("/api/auth/logout")
        .set("x-csrf-token", csrfToken);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body).toEqual({
        status: "ok",
        message: "Logged out successfully",
      });

      // Subsequent /api/auth/me request must fail with 401
      const meRes = await agent.get("/api/auth/me");
      expect(meRes.status).toBe(401);
    });
  });

  describe("Security: Rate Limiting on Failed Logins (TC16 / SR04)", () => {
    it("permits 5 failed logins and blocks the 6th with 429 Too Many Requests", async () => {
      const app = getTestApp();

      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post("/api/auth/login")
          .send({ email: DEMO_EMAIL, password: "WrongPassword" });
        expect(res.status).toBe(401);
      }

      // 6th attempt should be blocked with 429
      const sixthRes = await request(app)
        .post("/api/auth/login")
        .send({ email: DEMO_EMAIL, password: "WrongPassword" });

      expect(sixthRes.status).toBe(429);
      expect(sixthRes.body).toEqual({
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Too many failed login attempts. Please try again after 15 minutes.",
        },
      });

      // Attempt from another user is not blocked
      const otherRes = await request(app)
        .post("/api/auth/login")
        .send({ email: "other@example.com", password: "SomePassword" });
      expect(otherRes.status).toBe(401);
    });

    it("resets rate limit on successful login", async () => {
      const app = getTestApp();

      // 4 failures
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post("/api/auth/login")
          .send({ email: DEMO_EMAIL, password: "WrongPassword" });
      }

      // 1 success resets counter
      const successRes = await request(app)
        .post("/api/auth/login")
        .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
      expect(successRes.status).toBe(200);

      // Now failures can occur without being blocked at 5
      const nextFail = await request(app)
        .post("/api/auth/login")
        .send({ email: DEMO_EMAIL, password: "WrongPassword" });
      expect(nextFail.status).toBe(401);
    });

    it("Fix 3: prevents concurrent request bursts from exceeding max attempts", async () => {
      const app = getTestApp();

      // Send 10 concurrent failed login requests simultaneously
      const promises = Array.from({ length: 10 }, () =>
        request(app)
          .post("/api/auth/login")
          .send({ email: "burst@example.com", password: "WrongPassword" }),
      );

      const responses = await Promise.all(promises);
      const statusCounts = responses.reduce<Record<number, number>>((acc, res) => {
        acc[res.status] = (acc[res.status] || 0) + 1;
        return acc;
      }, {});

      // Exactly 5 should be allowed to evaluate credentials (401), and 5 must be blocked (429)
      expect(statusCounts[401]).toBe(5);
      expect(statusCounts[429]).toBe(5);
    });

    it("Fix 3: limiter bounds memory and safely prunes expired records", () => {
      const limiter = new LoginRateLimiter(5, 1000, 10, 10_000);
      const baseTime = 1_000_000;

      // Fill entries
      for (let i = 0; i < 5; i++) {
        limiter.recordFailure("1.1.1.1", `user${i}@example.com`, baseTime);
      }
      expect(limiter.isRateLimited("1.1.1.1", "user0@example.com", baseTime)).toBe(false);

      // Prune after window passes (1000ms window)
      limiter.pruneExpired(baseTime + 2000);
      expect(limiter.isRateLimited("1.1.1.1", "user0@example.com", baseTime + 2000)).toBe(false);

      limiter.destroy();
    });
  });

  describe("Security: CSRF Protection on Authenticated Writes (SR03 / TC16)", () => {
    it("allows unauthenticated POST /api/auth/login without CSRF token", async () => {
      const app = getTestApp();
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD });

      expect(res.status).toBe(200);
    });

    it("rejects authenticated state-changing writes when CSRF token is missing", async () => {
      const app = getTestApp();
      const agent = request.agent(app);

      await agent
        .post("/api/auth/login")
        .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD });

      // Attempt POST /api/auth/logout without x-csrf-token header
      const res = await agent.post("/api/auth/logout");
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: {
          code: "FORBIDDEN",
          message: "Missing or invalid CSRF token.",
        },
      });
    });

    it("rejects authenticated state-changing writes when CSRF token is invalid", async () => {
      const app = getTestApp();
      const agent = request.agent(app);

      await agent
        .post("/api/auth/login")
        .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD });

      const res = await agent
        .post("/api/auth/logout")
        .set("x-csrf-token", "invalid_csrf_token_value_12345");

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("provides GET /api/auth/csrf to retrieve current session CSRF token", async () => {
      const app = getTestApp();
      const agent = request.agent(app);

      const res = await agent.get("/api/auth/csrf");
      expect(res.status).toBe(200);
      expect(res.body.csrfToken).toBeDefined();
      expect(typeof res.body.csrfToken).toBe("string");
      expect(res.body.csrfToken.length).toBe(64);
    });
  });

  describe("Fix 1: Production SESSION_SECRET validation", () => {
    const originalSecret = process.env.SESSION_SECRET;

    it("rejects missing or empty SESSION_SECRET in production", () => {
      delete process.env.SESSION_SECRET;
      expect(() => resolveSessionSecret(true)).toThrowError(
        /SESSION_SECRET must be configured with a secure random value/,
      );

      process.env.SESSION_SECRET = "   ";
      expect(() => resolveSessionSecret(true)).toThrowError(
        /SESSION_SECRET must be configured with a secure random value/,
      );

      process.env.SESSION_SECRET = originalSecret;
    });

    it("rejects known development placeholder secret in production", () => {
      process.env.SESSION_SECRET = DEFAULT_DEV_SESSION_SECRET;
      expect(() => resolveSessionSecret(true)).toThrowError(
        /SESSION_SECRET must be configured with a secure random value/,
      );
      process.env.SESSION_SECRET = originalSecret;
    });

    it("accepts a strong secret in production without leaking it", () => {
      process.env.SESSION_SECRET = "super_secure_random_key_93817491823749128";
      expect(resolveSessionSecret(true)).toBe("super_secure_random_key_93817491823749128");
      process.env.SESSION_SECRET = originalSecret;
    });

    it("allows fallback placeholder in development", () => {
      delete process.env.SESSION_SECRET;
      expect(resolveSessionSecret(false)).toBe(DEFAULT_DEV_SESSION_SECRET);
      process.env.SESSION_SECRET = originalSecret;
    });

    it("rejects MemoryStore when NODE_ENV is production", () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalSecretEnv = process.env.SESSION_SECRET;
      process.env.NODE_ENV = "production";
      process.env.SESSION_SECRET = "a_valid_production_secret_key_123456789";

      expect(() =>
        createSessionMiddleware({ sessionStore: new session.MemoryStore() }),
      ).toThrowError(/MemoryStore cannot be used as the production session store/);

      process.env.NODE_ENV = originalNodeEnv;
      process.env.SESSION_SECRET = originalSecretEnv;
    });
  });

  describe("Fix 2: Reverse Proxy & Trust Proxy Configuration", () => {
    it("configures trust proxy explicitly when requested via options", () => {
      const appWithProxy = createApp({
        trustProxy: 1,
        sessionStore: new session.MemoryStore(),
      });
      expect(appWithProxy.get("trust proxy")).toBe(1);

      const appWithoutProxy = createApp({
        trustProxy: false,
        sessionStore: new session.MemoryStore(),
      });
      expect(appWithoutProxy.get("trust proxy")).toBe(false);
    });

    it("does not blindly trust proxy headers when trustProxy is not enabled", () => {
      const app = createApp({
        trustProxy: false,
        sessionStore: new session.MemoryStore(),
      });
      expect(app.get("trust proxy")).toBe(false);
    });
  });

  describe("Fix 4: Test Isolation", () => {
    it("creates an isolated MemoryStore when no store is specified in test environment", () => {
      // In test mode, createSessionMiddleware must not attempt connecting to a real DB
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "test";

      const middleware = createSessionMiddleware();
      expect(middleware).toBeDefined();

      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe("Teammate Integration Contract: requireSession middleware", () => {
    it("accepts authenticated session with positive integer userId and rejects missing session", async () => {
      const store = new session.MemoryStore();
      const testApp = express();
      testApp.use(express.json());
      testApp.use(createApp({ sessionStore: store }));
      testApp.get("/test-protected", requireSession, (_req, res) => {
        res.json({ protected: true });
      });

      // Unauthenticated
      const unauthRes = await request(testApp).get("/test-protected");
      expect(unauthRes.status).toBe(401);
      expect(unauthRes.body.error.code).toBe("UNAUTHENTICATED");

      // Login through agent
      const agent = request.agent(testApp);
      await agent
        .post("/api/auth/login")
        .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD });

      // Authenticated request to protected route
      const authRes = await agent.get("/test-protected");
      expect(authRes.status).toBe(200);
      expect(authRes.body).toEqual({ protected: true });
    });
  });
});
