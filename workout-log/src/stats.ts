/**
 * Dashboard numbers. Derived at read time from training_records + workouts; nothing
 * here is stored (portal CLAUDE.md: counts are derived, not stored).
 */
import { addDays } from "./config";

export const WORKOUT_TYPES = [
  "Run",
  "Swim",
  "Gym/Strength",
  "HIIT",
  "Mobility",
  "Others",
] as const;

export type Period = "all" | "prep" | "4w";
export const PERIODS: Period[] = ["all", "prep", "4w"];

export interface Range { from: string | null; to: string }

export function periodRange(period: Period, today: string, prepStart: string): Range {
  if (period === "prep") return { from: prepStart, to: today };
  if (period === "4w") return { from: addDays(today, -27), to: today }; // 28 days incl. today
  return { from: null, to: today };
}

export const inRange = (date: string, r: Range) => (!r.from || date >= r.from) && date <= r.to;

export interface MemberLite { id: number; name: string; image: string | null; syncedAt: string | null; syncError: string | null }
export interface TrainingLite { member_id: number; date: string }
export interface WorkoutLite { member_id: number; date: string; type: string; duration_min: number; intensity: number | null }

export interface DashboardRow {
  member: { id: number; name: string; image: string | null };
  trainings: number;
  workouts: number;
  workoutMinutes: number;
  avgIntensity: number | null;
  topTypes: { type: string; count: number }[];
  lastActive: string | null;
  syncedAt: string | null;
  syncError: string | null;
}

export function buildDashboard(
  members: MemberLite[],
  trainings: TrainingLite[],
  workouts: WorkoutLite[],
  range: Range,
): DashboardRow[] {
  const rows = new Map<number, DashboardRow & { _rpe: number[]; _types: Map<string, number> }>();
  for (const m of members) {
    rows.set(m.id, {
      member: { id: m.id, name: m.name, image: m.image },
      trainings: 0, workouts: 0, workoutMinutes: 0, avgIntensity: null, topTypes: [], lastActive: null,
      syncedAt: m.syncedAt, syncError: m.syncError, _rpe: [], _types: new Map(),
    });
  }
  const touch = (r: DashboardRow, date: string) => { if (!r.lastActive || date > r.lastActive) r.lastActive = date; };

  for (const t of trainings) {
    const r = rows.get(t.member_id);
    if (!r || !inRange(t.date, range)) continue;
    r.trainings++;
    touch(r, t.date);
  }
  for (const w of workouts) {
    const r = rows.get(w.member_id);
    if (!r || !inRange(w.date, range)) continue;
    r.workouts++;
    r.workoutMinutes += w.duration_min;
    if (w.intensity != null) r._rpe.push(w.intensity);
    r._types.set(w.type, (r._types.get(w.type) || 0) + 1);
    touch(r, w.date);
  }

  return [...rows.values()]
    .map(({ _rpe, _types, ...r }) => ({
      ...r,
      avgIntensity: _rpe.length ? Math.round((_rpe.reduce((a, b) => a + b, 0) / _rpe.length) * 10) / 10 : null,
      topTypes: [..._types.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([type, count]) => ({ type, count })),
    }))
    .sort((a, b) =>
      (b.trainings + b.workouts) - (a.trainings + a.workouts) ||
      a.member.name.localeCompare(b.member.name));
}
