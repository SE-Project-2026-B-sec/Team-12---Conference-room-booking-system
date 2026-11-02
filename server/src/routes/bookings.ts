import { Router } from "express";
import { cancelBooking } from "../services/booking-service.js";
import { prisma } from "../lib/prisma.js";
import { requireSession } from "../middleware/require-session.js";
import { validateBookingRequest } from "../services/booking-validation.js";
import { createBooking } from "../services/booking-service.js";

export const bookingsRouter = Router();

bookingsRouter.post("/", requireSession, async (req, res, next) => {
  try {
    const validation = validateBookingRequest(req.body);
    if (!validation.valid) {
      res.status(400).json({
        error: { code: "BAD_REQUEST", message: "Invalid booking request." },
        fields: validation.errors,
      });
      return;
    }

    // userId comes from the trusted session, never from the request body.
    const userId = req.session.userId as number;
    const result = await createBooking({ userId, ...validation.value });

    if (!result.ok) {
      if (result.reason === "ROOM_NOT_FOUND") {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Room not found." } });
      } else {
        res.status(409).json({
          error: { code: "CONFLICT", message: "The room is already booked for that time." },
        });
      }
      return;
    }

    const { booking } = result;
    res.status(201).json({
      bookingId: booking.id,
      status: booking.status,
      roomId: booking.roomId,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});
bookingsRouter.patch("/:id/cancel", requireSession, async (req, res, next) => {
  try {
    const bookingId = Number(req.params.id);

    if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Booking not found." },
      });
      return;
    }

    // Identity comes from the authenticated session, never the request body.
    const userId = req.session.userId as number;

    const result = await cancelBooking(bookingId, userId);

    if (!result.ok) {
      if (result.reason === "NOT_FOUND") {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Booking not found." },
        });
      } else {
        res.status(409).json({
          error: {
            code: "CONFLICT",
            message: "A booking cannot be cancelled at or after its start time.",
          },
        });
      }
      return;
    }

    res.status(200).json({
      bookingId: result.booking.id,
      status: result.booking.status,
    });
  } catch (error) {
    next(error);
  }
});


// CRBS-25: List bookings belonging to the authenticated user.
bookingsRouter.get("/", requireSession, async (req, res, next) => {
  try {
    const userId = req.session.userId as number;

    const bookings = await prisma.booking.findMany({
      where: { userId },
      select: {
        id: true,
        roomId: true,
        startAt: true,
        endAt: true,
        purpose: true,
        status: true,
        createdAt: true,
        room: {
          select: {
            name: true,
            location: true,
            capacity: true,
          },
        },
      },
      orderBy: [{ startAt: "desc" }, { id: "desc" }],
    });

    res.status(200).json({ bookings });
  } catch (error) {
    next(error);
  }
});

// CRBS-25: Get one booking only if it belongs to the authenticated user.
bookingsRouter.get("/:id", requireSession, async (req, res, next) => {
  try {
    const userId = req.session.userId as number;
    const bookingId = Number(req.params.id);

    if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Booking not found." },
      });
      return;
    }

    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        userId,
      },
      select: {
        id: true,
        roomId: true,
        startAt: true,
        endAt: true,
        purpose: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        room: {
          select: {
            name: true,
            location: true,
            capacity: true,
            facilities: true,
          },
        },
      },
    });

    if (!booking) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Booking not found." },
      });
      return;
    }

    res.status(200).json({ booking });
  } catch (error) {
    next(error);
  }
});
