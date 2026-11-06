
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

/** Test-only seam. Production callers never pass it. */
export interface CreateBookingTestHooks {
  afterInsert?: (tx: Prisma.TransactionClient) => Promise<void>;
}

export async function createBooking(
  input: CreateBookingInput,
  hooks: CreateBookingTestHooks = {},
): Promise<CreateBookingResult> {
  const { userId, roomId, purpose, startAt, endAt } = input;

  return prisma.$transaction(async (tx): Promise<CreateBookingResult> => {
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Room" WHERE id = ${roomId} FOR UPDATE
    `;

    if (locked.length === 0) {
      return { ok: false, reason: "ROOM_NOT_FOUND" };
    }

    const conflict = await tx.booking.findFirst({
      where: {
        roomId,
        status: BookingStatus.CONFIRMED,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });

    if (conflict) {
      return { ok: false, reason: "CONFLICT" };
    }

    const booking = await tx.booking.create({
      data: { userId, roomId, purpose, startAt, endAt, status: BookingStatus.CONFIRMED },
      select: { id: true, status: true, roomId: true, startAt: true, endAt: true },
    });

    await hooks.afterInsert?.(tx);

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "BOOKING_CREATED",
        entityType: "Booking",
        entityId: String(booking.id),
      },
    });

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

  return prisma.$transaction(async (tx): Promise<CancelBookingResult> => {
    const updated = await tx.booking.updateMany({
      where: {
        id: bookingId,
        userId,
        status: BookingStatus.CONFIRMED,
        startAt: { gt: now },
      },
      data: { status: BookingStatus.CANCELLED },
    });

    if (updated.count === 1) {
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "BOOKING_CANCELLED",
          entityType: "Booking",
          entityId: String(bookingId),
        },
      });

      return {
        ok: true,
        booking: { id: bookingId, status: BookingStatus.CANCELLED },
      };
    }

    const existing = await tx.booking.findFirst({
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

    return { ok: false, reason: "TOO_LATE" };
  }, {
    maxWait: 10_000,
    timeout: 15_000,
  });
}
