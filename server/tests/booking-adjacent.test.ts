
import { describe, expect, it } from "vitest";
import { intervalsOverlap } from "../src/services/booking-overlap.js";

const at = (time: string) => new Date(`2026-10-29T${time}:00+05:30`);

describe("adjacent bookings", () => {
  it("allows the next booking to start exactly when the previous one ends", () => {
    const previousBooking = {
      startAt: at("10:00"),
      endAt: at("11:00"),
    };

    expect(
      intervalsOverlap(at("11:00"), at("12:00"), previousBooking),
    ).toBe(false);
  });

  it("allows the next booking to end exactly when the following booking starts", () => {
    const followingBooking = {
      startAt: at("11:00"),
      endAt: at("12:00"),
    };

    expect(
      intervalsOverlap(at("10:00"), at("11:00"), followingBooking),
    ).toBe(false);
  });
});
