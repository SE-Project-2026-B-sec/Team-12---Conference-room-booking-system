
export interface BookingInterval {
  startAt: Date;
  endAt: Date;
}

/**
 * Uses half-open intervals [start, end).
 * Adjacent bookings are allowed.
 */
export function intervalsOverlap(
  requestedStart: Date,
  requestedEnd: Date,
  existing: BookingInterval,
): boolean {
  return (
    existing.startAt < requestedEnd &&
    existing.endAt > requestedStart
  );
}
