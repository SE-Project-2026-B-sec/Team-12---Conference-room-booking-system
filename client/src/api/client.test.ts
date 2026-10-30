import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./client";

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200, token?: string) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...(token ? { "x-csrf-token": token } : {}) } });
describe("TC04 / TC16 API cookies and CSRF integration contract", () => {
  it("carries the login response CSRF token on booking and logout writes", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ id: 1 }, 200, "synthetic-token")).mockResolvedValueOnce(json({ bookingId: 1 })).mockResolvedValueOnce(json({ status: "ok" }));
    vi.stubGlobal("fetch", fetcher);
    await api.login("user@example.test", "synthetic-password");
    await api.book(1, { date: "2026-10-30", startTime: "10:00", endTime: "11:00", capacity: "" }, " Planning ");
    const [url, options] = fetcher.mock.calls[1];
    expect(url).toBe("/api/bookings");
    expect(options.credentials).toBe("same-origin");
    expect(options.headers.get("x-csrf-token")).toBe("synthetic-token");
    expect(JSON.parse(options.body)).toEqual({ roomId: 1, date: "2026-10-30", startTime: "10:00", endTime: "11:00", purpose: "Planning" });
    await api.logout();
    expect(fetcher.mock.calls[2][1].headers.get("x-csrf-token")).toBe("synthetic-token");
  });
  it("refreshes the in-memory CSRF token from a restored session", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ id: 1 }, 200, "restored-token")).mockResolvedValueOnce(json({ status: "ok" }));
    vi.stubGlobal("fetch", fetcher);
    await api.me(); await api.logout();
    expect(fetcher.mock.calls[1][1].headers.get("x-csrf-token")).toBe("restored-token");
  });
  it("preserves status and field errors for rejected bookings", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "Invalid input" }, fields: { purpose: "Required" } }, 400)));
    await expect(api.book(1, { date: "", startTime: "", endTime: "", capacity: "" }, "")).rejects.toMatchObject({ status: 400, fields: { purpose: "Required" } });
  });
  it("reports invalid server output safely", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not JSON", { status: 200 })));
    await expect(api.rooms()).rejects.toBeInstanceOf(ApiError);
  });
  it("omits an empty capacity filter", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ rooms: [] })); vi.stubGlobal("fetch", fetcher);
    await api.availability({ date: "2026-10-30", startTime: "10:00", endTime: "11:00", capacity: "" });
    expect(fetcher.mock.calls[0][0]).not.toContain("capacity");
  });
});
