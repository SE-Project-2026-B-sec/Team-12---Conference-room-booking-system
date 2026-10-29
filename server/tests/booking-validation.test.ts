import { describe, expect, it } from "vitest";
import { validateBookingRequest } from "../src/services/booking-validation.js";

const now = new Date("2026-10-29T08:00:00+05:30");
const valid = { roomId: 1, date: "2026-10-29", startTime: "09:00", endTime: "09:30", purpose: "Team meeting" };
const validate = (changes: Record<string, unknown> = {}, clock = now) => validateBookingRequest({ ...valid, ...changes }, clock);

describe("TC05 / required booking input", () => {
  it.each([null, undefined, [], "booking", 1])("rejects a non-object payload (%s)", (body) => {
    expect(validateBookingRequest(body, now).valid).toBe(false);
  });
  it.each([undefined, "1", 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects an invalid room ID (%s)", (roomId) => {
    expect(validate({ roomId }).valid).toBe(false);
  });
  it.each([undefined, "", "   ", 1, "x".repeat(201)])("rejects an invalid purpose", (purpose) => {
    expect(validate({ purpose }).valid).toBe(false);
  });
  it("trims purpose and accepts both length limits", () => {
    expect(validate({ purpose: " a " })).toMatchObject({ valid: true, value: { purpose: "a" } });
    expect(validate({ purpose: "x".repeat(200) }).valid).toBe(true);
  });
  it.each([undefined, "2026-2-03", "2026-02-30", "2026-13-01", "2026-00-01", "2026-10-00", "2027-02-29"])('rejects malformed/impossible date %s', (date) => {
    expect(validate({ date }).valid).toBe(false);
  });
  it.each(["9:00", "24:00", "09:60", "09:00:00", "", null])("rejects malformed start/end time %s", (time) => {
    expect(validate({ startTime: time }).valid).toBe(false);
    expect(validate({ endTime: time }).valid).toBe(false);
  });
});

describe("TC06 / operating hours and booking boundaries", () => {
  it("accepts 09:00 start, 18:00 end and both duration limits", () => {
    expect(validate().valid).toBe(true);
    expect(validate({ startTime: "17:30", endTime: "18:00" }).valid).toBe(true);
    expect(validate({ startTime: "14:00", endTime: "18:00" }).valid).toBe(true);
  });
  it.each([
    { startTime: "08:30" }, { endTime: "18:30" },
    { startTime: "09:15" }, { endTime: "10:15" },
    { startTime: "09:00", endTime: "09:00" },
    { startTime: "10:00", endTime: "09:30" },
    { startTime: "09:00", endTime: "13:30" },
    { startTime: "17:30", endTime: "09:00" },
  ])("rejects invalid interval %j", (interval) => {
    expect(validate(interval).valid).toBe(false);
  });
  it("rejects starts exactly now and in the past", () => {
    expect(validate({}, new Date("2026-10-29T09:00:00+05:30")).valid).toBe(false);
    expect(validate({}, new Date("2026-10-29T09:00:01+05:30")).valid).toBe(false);
  });
  it("compares the 30-day limit using IST calendar dates", () => {
    const nearMidnight = new Date("2026-10-28T19:00:00Z"); // 29 October 00:30 IST
    expect(validate({ date: "2026-11-28" }, nearMidnight).valid).toBe(true);
    expect(validate({ date: "2026-11-29" }, nearMidnight).valid).toBe(false);
    expect(validate({ date: "2026-10-28" }, nearMidnight).valid).toBe(false);
  });
  it("handles month/year boundaries and valid leap days", () => {
    expect(validate({ date: "2027-01-01" }, new Date("2026-12-31T08:00:00+05:30")).valid).toBe(true);
    expect(validate({ date: "2028-02-29" }, new Date("2028-02-28T08:00:00+05:30")).valid).toBe(true);
  });
  it("returns UTC instants independent of the server timezone", () => {
    const result = validate();
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.startAt.toISOString()).toBe("2026-10-29T03:30:00.000Z");
      expect(result.value.endAt.toISOString()).toBe("2026-10-29T04:00:00.000Z");
    }
  });
  it("ignores client-supplied user/status values and does not mutate input", () => {
    const input = Object.freeze({ ...valid, userId: 999, status: "CANCELLED" });
    const result = validateBookingRequest(input, now);
    if (!result.valid) throw new Error("Expected valid input");
    expect(Object.keys(result.value).sort()).toEqual(["endAt", "purpose", "roomId", "startAt"]);
    expect(input.status).toBe("CANCELLED");
  });
});
