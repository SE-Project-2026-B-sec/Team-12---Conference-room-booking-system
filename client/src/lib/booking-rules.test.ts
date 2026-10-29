import { describe, expect, it } from "vitest";
import { istDate, validatePurpose, validateSearch } from "./booking-rules";
const now = new Date("2026-10-28T19:00:00Z"); // 29 October in IST
const search = { date: "2026-10-29", startTime: "09:00", endTime: "09:30", capacity: "" };
describe("TC05 / TC06 frontend validation", () => {
  it("uses IST dates at UTC midnight boundaries", () => {
    expect(istDate(0, now)).toBe("2026-10-29");
    expect(validateSearch({ ...search, date: "2026-11-28" }, now)).toEqual({});
    expect(validateSearch({ ...search, date: "2026-11-29" }, now).date).toBeTruthy();
  });
  it.each([
    { date: "2026-02-30" }, { date: "2026-10-28" }, { startTime: "08:30" },
    { startTime: "09:15" }, { endTime: "18:30" }, { endTime: "09:00" },
    { endTime: "13:30" }, { capacity: "0" }, { capacity: "1.5" },
  ])("rejects invalid interval/filter %j", (changes) => {
    expect(Object.keys(validateSearch({ ...search, ...changes }, now)).length).toBeGreaterThan(0);
  });
  it("accepts opening/closing and maximum duration boundaries", () => {
    expect(validateSearch(search, now)).toEqual({});
    expect(validateSearch({ ...search, startTime: "14:00", endTime: "18:00" }, now)).toEqual({});
  });
  it("rejects a start exactly now", () => {
    expect(validateSearch(search, new Date("2026-10-29T09:00:00+05:30")).startTime).toBeTruthy();
  });
  it("validates trimmed purpose length", () => {
    expect(validatePurpose("   ")).toBeTruthy(); expect(validatePurpose("x".repeat(201))).toBeTruthy();
    expect(validatePurpose(" a ")).toBeUndefined(); expect(validatePurpose("x".repeat(200))).toBeUndefined();
  });
});
