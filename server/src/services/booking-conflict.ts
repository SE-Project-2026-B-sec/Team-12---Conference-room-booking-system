
import { BookingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/**
 * Returns an existing confirmed booking that overlaps
 * the requested interval, or null if there is no conflict.
 * Adjacent bookings are allowed.
 */
export async function findBookingConflict(
  roomId: number,
  startAt: Date,
  endAt: Date,
) {
  if (
    !Number.isInteger(roomId) ||
    roomId <= 0 ||
    Number.isNaN(startAt.getTime()) ||
    Number.isNaN(endAt.getTime()) ||
    endAt <= startAt
  ) {
    throw new Error("Invalid room or booking time interval.");
  }

  return prisma.booking.findFirst({
    where: {
      roomId,
      status: BookingStatus.CONFIRMED,
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: {
      id: true,
      roomId: true,
      startAt: true,
      endAt: true,
      status: true,
    },
  });
}
