import { WORKOUT_TYPES } from "./stats";

export class BadRequest extends Error {}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isoDate(v: unknown, field: string): string {
  const s = String(v ?? "").trim();
  if (!ISO.test(s)) throw new BadRequest(`${field} must be YYYY-MM-DD`);
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new BadRequest(`${field} is not a real date`);
  }
  return s;
}

export function intIn(v: unknown, field: string, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequest(`${field} must be a whole number from ${min} to ${max}`);
  return n;
}

export function text(v: unknown, field: string, max: number, opts: { required?: boolean } = {}): string {
  const s = String(v ?? "").trim();
  if (opts.required && !s) throw new BadRequest(`${field} is required`);
  if (s.length > max) throw new BadRequest(`${field} is too long (max ${max})`);
  return s;
}

export interface WorkoutInput { date: string; type: string; durationMin: number; intensity: number | null; notes: string }

export function workoutInput(body: any, today: string): WorkoutInput {
  const date = isoDate(body?.date, "date");
  if (date > today) throw new BadRequest("The date can't be in the future");
  const type = String(body?.type ?? "");
  if (!(WORKOUT_TYPES as readonly string[]).includes(type)) throw new BadRequest("Pick a workout type from the list");
  const durationMin = intIn(body?.durationMin, "Duration (minutes)", 1, 600);
  const intensity = body?.intensity === null || body?.intensity === undefined || body?.intensity === ""
    ? null : intIn(body.intensity, "intensity", 1, 10);
  const notes = text(body?.notes, "notes", 2000);
  return { date, type, durationMin, intensity, notes };
}
