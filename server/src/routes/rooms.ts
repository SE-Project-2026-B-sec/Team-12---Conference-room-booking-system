
import { Router } from "express";
import { BookingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireSession } from "../middleware/require-session.js";

export const roomsRouter = Router();

roomsRouter.get("/rooms", requireSession, async (_req, res, next) => {
  try {
    const rooms = await prisma.room.findMany({
      select: { id: true, name: true, location: true, capacity: true, facilities: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    res.status(200).json(rooms);
  } catch (error) {
    next(error);
  }
});

const TIME_ZONE_OFFSET = "+05:30"; // Asia/Kolkata

roomsRouter.get("/rooms/availability", async (req, res, next) => {
  try {
    const { date, startTime, endTime, capacity } = req.query;

    if (
      typeof date !== "string" ||
      typeof startTime !== "string" ||
      typeof endTime !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime)
    ) {
      res.status(400).json({
        error: {
          code: "BAD_REQUEST",
          message:
            "Provide date as YYYY-MM-DD and startTime/endTime as HH:mm.",
        },
      });
      return;
    }

    // Reject impossible calendar dates, such as 2026-02-30.
    const [year, month, day] = date.split("-").map(Number);
    const calendarDate = new Date(Date.UTC(year, month - 1, day));

    if (
      calendarDate.getUTCFullYear() !== year ||
      calendarDate.getUTCMonth() !== month - 1 ||
      calendarDate.getUTCDate() !== day
    ) {
      res.status(400).json({
        error: {
          code: "BAD_REQUEST",
          message: "Invalid calendar date.",
        },
      });
      return;
    }

    const startAt = new Date(
      `${date}T${startTime}:00${TIME_ZONE_OFFSET}`,
    );
    const endAt = new Date(
      `${date}T${endTime}:00${TIME_ZONE_OFFSET}`,
    );

    if (endAt <= startAt) {
      res.status(400).json({
        error: {
          code: "BAD_REQUEST",
          message: "endTime must be later than startTime.",
        },
      });
      return;
    }

    let minimumCapacity: number | undefined;

    if (capacity !== undefined) {
      if (
        typeof capacity !== "string" ||
        !/^[1-9]\d*$/.test(capacity) ||
        !Number.isSafeInteger(Number(capacity))
      ) {
        res.status(400).json({
          error: {
            code: "BAD_REQUEST",
            message: "capacity must be a positive integer.",
          },
        });
        return;
      }

      minimumCapacity = Number(capacity);
    }

    const rooms = await prisma.room.findMany({
      where: {
        ...(minimumCapacity !== undefined
          ? { capacity: { gte: minimumCapacity } }
          : {}),
        bookings: {
          none: {
            status: BookingStatus.CONFIRMED,
            startAt: { lt: endAt },
            endAt: { gt: startAt },
          },
        },
      },
      select: {
        id: true,
        name: true,
        location: true,
        capacity: true,
        facilities: true,
      },
      orderBy: { name: "asc" },
    });

    res.status(200).json({
      date,
      startTime,
      endTime,
      rooms,
    });
  } catch (error) {
    next(error);
  }
});
