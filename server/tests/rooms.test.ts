import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("../src/lib/prisma.js", () => ({ prisma: { room: { findMany } } }));
import { roomsRouter } from "../src/routes/rooms.js";

// Only test code creates this session; no client header can authenticate a request.
function appWithSession(userId?: unknown) {
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, { session: { userId } });
    next();
  });
  app.use("/api", roomsRouter);
  const errors: ErrorRequestHandler = (_error, _req, res, _next) => {
    void _error; void _req; void _next;
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  };
  app.use(errors);
  return app;
}

describe("TC01 / FR02 GET /api/rooms", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns every room's public details including an empty facilities list", async () => {
    const rooms = [
      { id: 1, name: "Room A", location: "Block A", capacity: 10, facilities: ["Projector"] },
      { id: 2, name: "Room B", location: "Block B", capacity: 6, facilities: [] },
    ];
    findMany.mockResolvedValue(rooms);
    const response = await request(appWithSession(1)).get("/api/rooms");
    expect(response.status).toBe(200);
    expect(response.body).toEqual(rooms);
    expect(findMany).toHaveBeenCalledWith({
      select: { id: true, name: true, location: true, capacity: true, facilities: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  });

  it("returns an empty array when no rooms exist", async () => {
    findMany.mockResolvedValue([]);
    const response = await request(appWithSession(1)).get("/api/rooms");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it.each([undefined, null, 0, -1, "1", 1.5])("rejects missing/invalid sessions (%s) without querying rooms", async (id) => {
    const response = await request(appWithSession(id)).get("/api/rooms");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("passes database failures to the error handler without exposing internals", async () => {
    findMany.mockRejectedValue(new Error("private database credentials"));
    const response = await request(appWithSession(1)).get("/api/rooms");
    expect(response.status).toBe(500);
    expect(response.text).not.toContain("credentials");
  });
});
