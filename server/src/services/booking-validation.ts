export interface ValidatedBooking {
  roomId: number;
  purpose: string;
  startAt: Date;
  endAt: Date;
}

export type BookingValidationResult =
  | { valid: true; value: ValidatedBooking }
  | { valid: false; errors: Record<string, string> };

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** FR06 / TC05-TC06. Pure validation; auth, room lookup and atomic conflict checks belong to the endpoint. */
export function validateBookingRequest(input: unknown, now = new Date()): BookingValidationResult {
  if (!Number.isFinite(now.getTime())) throw new Error("Validation clock must be a valid date.");
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { valid: false, errors: { request: "Provide a booking object." } };
  }
  const body = input as Record<string, unknown>;
  const errors: Record<string, string> = {};
  if (typeof body.roomId !== "number" || !Number.isSafeInteger(body.roomId) || body.roomId <= 0) {
    errors.roomId = "Choose a valid room.";
  }
  const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";
  if (purpose.length < 1 || purpose.length > 200) {
    errors.purpose = "Purpose must contain 1 to 200 characters after trimming.";
  }

  let dateAtMidnight: Date | undefined;
  if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    const parsed = new Date(`${body.date}T00:00:00.000Z`);
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === body.date) {
      dateAtMidnight = parsed;
    }
  }
  if (!dateAtMidnight) errors.date = "Provide a real calendar date as YYYY-MM-DD.";

  const minutes = (value: unknown, field: string): number | undefined => {
    if (typeof value !== "string" || !TIME.test(value)) {
      errors[field] = "Use HH:mm in 24-hour format.";
      return undefined;
    }
    const [hours, mins] = value.split(":").map(Number);
    if (mins % 30 !== 0) errors[field] = "Use a 30-minute boundary (:00 or :30).";
    return hours * 60 + mins;
  };
  const startMinutes = minutes(body.startTime, "startTime");
  const endMinutes = minutes(body.endTime, "endTime");

  if (startMinutes !== undefined && endMinutes !== undefined) {
    if (startMinutes < 9 * 60 || startMinutes >= 18 * 60) {
      errors.startTime = "Start must be between 09:00 and 17:30 IST.";
    }
    if (endMinutes > 18 * 60 || endMinutes <= 9 * 60) {
      errors.endTime = "End must be between 09:30 and 18:00 IST.";
    }
    const duration = endMinutes - startMinutes;
    if (duration < 30 || duration > 240) {
      errors.duration = "Bookings must last 30 to 240 minutes within the same day.";
    }
  }

  let startAt: Date | undefined;
  let endAt: Date | undefined;
  if (dateAtMidnight) {
    // Compare calendar days in IST, not the machine timezone or a rolling 720-hour window.
    const localToday = Math.floor((now.getTime() + IST_OFFSET_MS) / DAY_MS);
    const dayAhead = dateAtMidnight.getTime() / DAY_MS - localToday;
    if (dayAhead < 0 || dayAhead > 30) errors.date = "Choose a date from today through 30 calendar days ahead (IST).";
    if (startMinutes !== undefined && endMinutes !== undefined) {
      startAt = new Date(dateAtMidnight.getTime() + startMinutes * 60_000 - IST_OFFSET_MS);
      endAt = new Date(dateAtMidnight.getTime() + endMinutes * 60_000 - IST_OFFSET_MS);
      if (startAt.getTime() <= now.getTime()) errors.startTime = "Start time must be in the future (IST).";
    }
  }
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    value: { roomId: body.roomId as number, purpose, startAt: startAt!, endAt: endAt! },
  };
}
