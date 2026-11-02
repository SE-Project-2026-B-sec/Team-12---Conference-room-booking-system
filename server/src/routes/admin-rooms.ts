import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/require-admin.js";

export const adminRoomsRouter = Router();

const ROOM_SELECT = { id: true, name: true, location: true, capacity: true, facilities: true } as const;

const NAME_MAX = 100; // matches Room.name VarChar(100)
const LOCATION_MAX = 200; // matches Room.location VarChar(200)
const FACILITY_MAX = 100;
const FACILITIES_MAX = 50;
const CAPACITY_MAX = 10_000;

function requiredText(value: unknown, field: string, max: number, errors: Record<string, string>) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < 1 || text.length > max) {
    errors[field] = `${field} is required and must be 1 to ${max} characters.`;
  }
  return text;
}

adminRoomsRouter.post("/", requireAdmin, async (req, res, next) => {
  try {
    const body: Record<string, unknown> =
      typeof req.body === "object" && req.body !== null && !Array.isArray(req.body) ? req.body : {};
    const errors: Record<string, string> = {};

    const name = requiredText(body.name, "name", NAME_MAX, errors);
    const location = requiredText(body.location, "location", LOCATION_MAX, errors);

    const capacity = body.capacity;
    if (typeof capacity !== "number" || !Number.isSafeInteger(capacity) || capacity < 1 || capacity > CAPACITY_MAX) {
      errors.capacity = `capacity must be a whole number from 1 to ${CAPACITY_MAX}.`;
    }

    let facilities: string[] = [];
    if (body.facilities !== undefined) {
      const raw = body.facilities;
      if (!Array.isArray(raw) || raw.length > FACILITIES_MAX) {
        errors.facilities = `facilities must be an array of at most ${FACILITIES_MAX} strings.`;
      } else if (
        raw.some((f) => typeof f !== "string" || f.trim().length < 1 || f.trim().length > FACILITY_MAX)
      ) {
        errors.facilities = `Each facility must be a non-empty string of at most ${FACILITY_MAX} characters.`;
      } else {
        facilities = (raw as string[]).map((f) => f.trim());
      }
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({
        error: { code: "BAD_REQUEST", message: "Invalid room details." },
        fields: errors,
      });
      return;
    }

    const room = await prisma.room.create({
      data: { name, location, capacity: capacity as number, facilities },
      select: ROOM_SELECT,
    });
    res.status(201).json(room);
  } catch (error) {
    next(error);
  }
});
