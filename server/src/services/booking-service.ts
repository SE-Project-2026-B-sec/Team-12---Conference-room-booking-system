import { BookingStatus, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export interface CreateBookingInput {
  userId: number;
  roomId: number;
  purpose: string;
  startAt: Date;
  endAt: Date;
}

export type CreateBookingResult =
  | { ok: true; booking: { id: number; status: BookingStatus; roomId: number; startAt: Date; endAt: Date } }
  | { ok: false; reason: "ROOM_NOT_FOUND" | "CONFLICT" };

/** Test-only seam. Production callers never pass it; see tests/booking-atomicity.test.ts. */
export interface CreateBookingTestHooks {
  /** Runs inside the transaction right after the insert; throwing must roll the insert back. */
  afterInsert?: (tx: Prisma.TransactionClient) => Promise<void>;
}

/**
 * Creates a CONFIRMED booking. Inputs must already be validated by validateBookingRequest.
 *
 * Everything happens in ONE transaction: the room row is locked (SELECT ... FOR UPDATE), so
 * concurrent requests for the same room are serialised; the overlap check then runs on the
 * transaction client with half-open intervals [start, end); only then is the row inserted.
 * Any failure rolls the whole transaction back, so no partial booking can remain (FR14).
 * Requests for different rooms do not block each other.
 */
export async function createBooking(
  input: CreateBookingInput,
  hooks: CreateBookingTestHooks = {},
): Promise<CreateBookingResult> {
  const { userId, roomId, purpose, startAt, endAt } = input;

  return prisma.$transaction(async (tx): Promise<CreateBookingResult> => {
    const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Room" WHERE id = ${roomId} FOR UPDATE`;
    if (locked.length === 0) return { ok: false, reason: "ROOM_NOT_FOUND" };

    const conflict = await tx.booking.findFirst({
      where: {
        roomId,
        status: BookingStatus.CONFIRMED,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (conflict) return { ok: false, reason: "CONFLICT" };

    const booking = await tx.booking.create({
      data: { userId, roomId, purpose, startAt, endAt, status: BookingStatus.CONFIRMED },
      select: { id: true, status: true, roomId: true, startAt: true, endAt: true },
    });
    await hooks.afterInsert?.(tx);
    return { ok: true, booking };
  }, {
    maxWait: 10_000,
    timeout: 15_000,
  });
}
export type CancelBookingResult =
  | { ok: true; booking: { id: number; status: BookingStatus } }
  | { ok: false; reason: "NOT_FOUND" | "TOO_LATE" };

/**
 * Cancels a booking only when it belongs to the requesting user
 * and its start time has not been reached.
 *
 * Repeated cancellation is successful (idempotent).
 */
export async function cancelBooking(
  bookingId: number,
  userId: number,
): Promise<CancelBookingResult> {
  const now = new Date();

  // Atomic conditional update prevents cancelling a booking that has started.
  const updated = await prisma.booking.updateMany({
    where: {
      id: bookingId,
      userId,
      status: BookingStatus.CONFIRMED,
      startAt: { gt: now },
    },
    data: { status: BookingStatus.CANCELLED },
  });

  if (updated.count === 1) {
    return {
      ok: true,
      booking: { id: bookingId, status: BookingStatus.CANCELLED },
    };
  }

  // Re-read to distinguish an already-cancelled booking from a missing,
  // unowned, or already-started booking.
  const existing = await prisma.booking.findFirst({
    where: { id: bookingId, userId },
    select: { id: true, status: true, startAt: true },
  });

  if (!existing) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  if (existing.status === BookingStatus.CANCELLED) {
    return {
      ok: true,
      booking: { id: existing.id, status: BookingStatus.CANCELLED },
    };
  }

  if (existing.startAt <= new Date()) {
    return { ok: false, reason: "TOO_LATE" };
  }

  // A concurrent state change occurred; don't report a false success.
  return { ok: false, reason: "TOO_LATE" };
}