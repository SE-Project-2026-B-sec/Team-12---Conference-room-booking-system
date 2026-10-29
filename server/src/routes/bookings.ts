import { Router } from "express";
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
