import type { Search } from "../api/client";

const DAY = 86_400_000;
const IST = 330 * 60_000;
export function istDate(days = 0, now = new Date()): string {
  return new Date(now.getTime() + IST + days * DAY).toISOString().slice(0, 10);
}
export const timeOptions = Array.from({ length: 19 }, (_, i) => {
  const total = 9 * 60 + i * 30;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
});
/** UI feedback only. The server remains authoritative for rules and overlaps. */
export function validateSearch(search: Search, now = new Date()): Record<string, string> {
  const errors: Record<string, string> = {};
  const midnight = new Date(`${search.date}T00:00:00Z`);
  const realDate = /^\d{4}-\d{2}-\d{2}$/.test(search.date) && Number.isFinite(midnight.getTime()) && midnight.toISOString().slice(0, 10) === search.date;
  if (!realDate || search.date < istDate(0, now) || search.date > istDate(30, now)) errors.date = "Choose a date from today through 30 days ahead (IST).";
  if (!timeOptions.slice(0, -1).includes(search.startTime)) errors.startTime = "Choose a start between 09:00 and 17:30.";
  if (!timeOptions.slice(1).includes(search.endTime)) errors.endTime = "Choose an end between 09:30 and 18:00.";
  const start = new Date(`${search.date}T${search.startTime}:00+05:30`);
  const end = new Date(`${search.date}T${search.endTime}:00+05:30`);
  const duration = (end.getTime() - start.getTime()) / 60_000;
  if (!Number.isFinite(duration) || duration < 30 || duration > 240) errors.endTime = "Choose an end 30 to 240 minutes after the start.";
  if (Number.isFinite(start.getTime()) && start.getTime() <= now.getTime()) errors.startTime = "Start time must be in the future (IST).";
  if (search.capacity && (!/^[1-9]\d*$/.test(search.capacity) || !Number.isSafeInteger(Number(search.capacity)))) errors.capacity = "Enter a positive whole number.";
  return errors;
}
export function validatePurpose(purpose: string): string | undefined {
  const length = purpose.trim().length;
  return length < 1 || length > 200 ? "Enter a meeting purpose of 1–200 characters." : undefined;
}
