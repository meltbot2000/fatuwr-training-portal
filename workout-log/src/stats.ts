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

/**
 * Dashboard periods (the chips):
 *   "prep"     since the competition's prep start   (default)
 *   "year"     since 1 Jan of the prep-start year    ("Since 2026")
 *   "YYYY-MM"  one calendar month, for every month from the prep-start month up to the
 *              month BEFORE the competition (Amager Cup: Nov, Dec, Jan, Feb, Mar).
 *              Months that haven't started yet are listed but disabled.
 */
export type Period = string;
export const DEFAULT_PERIOD = "prep";

export interface Range { from: string | null; to: string }
export interface PeriodOption { key: string; label: string; disabled: boolean }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_KEY = /^(\d{4})-(\d{2})$/;

function monthKeys(prepStart: string, competitionDate: string): string[] {
  const keys: string[] = [];
  let [y, m] = prepStart.slice(0, 7).split("-").map(Number);
  const end = competitionDate.slice(0, 7);
  for (let i = 0; i < 24; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key >= end) break;
    keys.push(key);
    m === 12 ? (y++, m = 1) : m++;
  }
  return keys;
}

export function periodOptions(prepStart: string, competitionDate: string, today: string): PeriodOption[] {
  return [
    { key: "prep", label: "Since prep start", disabled: false },
    { key: "year", label: `Since ${prepStart.slice(0, 4)}`, disabled: false },
    ...monthKeys(prepStart, competitionDate).map(k => ({
      key: k,
      label: MONTHS[Number(k.slice(5)) - 1],
      disabled: `${k}-01` > today,
    })),
  ];
}

/** A requested period if it is one of the (enabled) options, else the default. */
export function parsePeriod(v: unknown, options: PeriodOption[]): Period {
  const hit = options.find(o => o.key === String(v ?? ""));
  return hit && !hit.disabled ? hit.key : DEFAULT_PERIOD;
}

export function periodRange(period: Period, today: string, prepStart: string): Range {
  if (period === "year") return { from: `${prepStart.slice(0, 4)}-01-01`, to: today };
  const m = MONTH_KEY.exec(period);
  if (m) {
    const [y, mo] = [Number(m[1]), Number(m[2])];
    const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
    const last = addDays(next, -1);
    return { from: `${period}-01`, to: last < today ? last : today };
  }
  return { from: prepStart, to: today }; // "prep"
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
