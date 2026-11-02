import { Router, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/require-admin.js";

export const adminRoomsRouter = Router();

const ROOM_SELECT = { id: true, name: true, location: true, capacity: true, facilities: true } as const;

const NAME_MAX = 100; // matches Room.name VarChar(100)
const LOCATION_MAX = 200; // matches Room.location VarChar(200)
const FACILITY_MAX = 100;
const FACILITIES_MAX = 50;
const CAPACITY_MAX = 10_000;

type RoomFields = { name?: string; location?: string; capacity?: number; facilities?: string[] };

function validText(value: unknown, field: string, max: number, errors: Record<string, string>) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < 1 || text.length > max) {
    errors[field] = `${field} is required and must be 1 to ${max} characters.`;
    return undefined;
  }
  return text;
}

/**
 * Shared by create and update. With partial = true only the fields present in the body are
 * validated; with partial = false name, location and capacity are required and
 * facilities defaults to [].
 */
function validateRoomFields(raw: unknown, partial: boolean) {
  const body: Record<string, unknown> =
    typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const errors: Record<string, string> = {};
  const value: RoomFields = {};
  const wanted = (field: string) => !partial || body[field] !== undefined;

  if (wanted("name")) value.name = validText(body.name, "name", NAME_MAX, errors);
  if (wanted("location")) value.location = validText(body.location, "location", LOCATION_MAX, errors);

  if (wanted("capacity")) {
    const capacity = body.capacity;
    if (typeof capacity !== "number" || !Number.isSafeInteger(capacity) || capacity < 1 || capacity > CAPACITY_MAX) {
      errors.capacity = `capacity must be a whole number from 1 to ${CAPACITY_MAX}.`;
    } else {
      value.capacity = capacity;
    }
  }

  if (body.facilities !== undefined) {
    const list = body.facilities;
    if (!Array.isArray(list) || list.length > FACILITIES_MAX) {
      errors.facilities = `facilities must be an array of at most ${FACILITIES_MAX} strings.`;
    } else if (list.some((f) => typeof f !== "string" || f.trim().length < 1 || f.trim().length > FACILITY_MAX)) {
      errors.facilities = `Each facility must be a non-empty string of at most ${FACILITY_MAX} characters.`;
    } else {
      value.facilities = (list as string[]).map((f) => f.trim());
    }
  } else if (!partial) {
    value.facilities = [];
  }

  return { errors, value };
}

function badRequest(res: Response, fields: Record<string, string>) {
  res.status(400).json({ error: { code: "BAD_REQUEST", message: "Invalid room details." }, fields });
}

adminRoomsRouter.post("/", requireAdmin, async (req, res, next) => {
  try {
    const { errors, value } = validateRoomFields(req.body, false);
    if (Object.keys(errors).length > 0) return badRequest(res, errors);

    const room = await prisma.room.create({
      data: {
        name: value.name as string,
        location: value.location as string,
        capacity: value.capacity as number,
        facilities: value.facilities as string[],
      },
      select: ROOM_SELECT,
    });
    res.status(201).json(room);
  } catch (error) {
    next(error);
  }
});

adminRoomsRouter.patch("/:id", requireAdmin, async (req, res, next) => {
  try {
    const rawId = String(req.params.id);
    if (!/^[1-9]\d{0,9}$/.test(rawId) || Number(rawId) > 2_147_483_647) {
      return badRequest(res, { id: "id must be a positive integer." });
    }
    const id = Number(rawId);

    const { errors, value } = validateRoomFields(req.body, true);
    if (Object.keys(errors).length > 0) return badRequest(res, errors);
    if (Object.keys(value).length === 0) {
      return badRequest(res, { body: "Provide at least one of name, location, capacity or facilities." });
    }

    if (!(await prisma.room.findUnique({ where: { id }, select: { id: true } }))) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Room not found." } });
      return;
    }

    // Only the rooms row is updated; bookings are never touched.
    const room = await prisma.room.update({ where: { id }, data: value, select: ROOM_SELECT });
    res.status(200).json(room);
  } catch (error) {
    next(error);
  }
});
