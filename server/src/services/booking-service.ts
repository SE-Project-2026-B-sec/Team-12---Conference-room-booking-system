import { BookingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { findBookingConflict } from "./booking-conflict.js";

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

/** Creates a CONFIRMED booking. Inputs must already be validated by validateBookingRequest. */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const { userId, roomId, purpose, startAt, endAt } = input;

  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true } });
  if (!room) return { ok: false, reason: "ROOM_NOT_FOUND" };

  // TODO(CRBS-20/CRBS-31/CRBS-32): this pre-check is not race-safe; a DB-level lock/constraint
  // closes the concurrent-request race in Sprint 2.
  if (await findBookingConflict(roomId, startAt, endAt)) return { ok: false, reason: "CONFLICT" };

  const booking = await prisma.$transaction((tx) =>
    tx.booking.create({
      data: { userId, roomId, purpose, startAt, endAt, status: BookingStatus.CONFIRMED },
      select: { id: true, status: true, roomId: true, startAt: true, endAt: true },
    }),
  );
  return { ok: true, booking };
}
