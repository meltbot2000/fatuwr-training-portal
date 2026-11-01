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
 *              Every month is selectable; one that hasn't started yet simply has no
 *              data yet ("upcoming": the UI says when it starts).
 */
export type Period = string;
export const DEFAULT_PERIOD = "prep";

export interface Range { from: string | null; to: string }
export interface PeriodOption { key: string; label: string; upcoming: boolean }

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
    { key: "prep", label: "Since prep start", upcoming: prepStart > today },
    { key: "year", label: `Since ${prepStart.slice(0, 4)}`, upcoming: false },
    ...monthKeys(prepStart, competitionDate).map(k => ({
      key: k,
      label: MONTHS[Number(k.slice(5)) - 1],
      upcoming: `${k}-01` > today,
    })),
  ];
}

/** A requested period if it is one of the options, else the default. */
export function parsePeriod(v: unknown, options: PeriodOption[]): Period {
  const hit = options.find(o => o.key === String(v ?? ""));
  return hit ? hit.key : DEFAULT_PERIOD;
}

export function periodRange(period: Period, today: string, prepStart: string): Range {
  if (period === "year") return { from: `${prepStart.slice(0, 4)}-01-01`, to: today };
  const m = MONTH_KEY.exec(period);
  if (m) {
    const [y, mo] = [Number(m[1]), Number(m[2])];
    const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
    const last = addDays(next, -1);
    // A month still in progress ends today; one that hasn't started keeps its whole span
    // (it just has no data yet).
    const from = `${period}-01`;
    return { from, to: from > today ? last : last < today ? last : today };
  }
  return { from: prepStart, to: today }; // "prep"
}

/** Targets for an individual's weekly averages (green when met, red when not). */
export const TARGETS = { trainingsPerWeekAbove: 2, workoutsPerWeekMin: 1 };

const dayNum = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86_400_000; };

/**
 * Weeks to average over: the part of the range up to today, never less than one week
 * (otherwise one training in the first two days of prep reads as 3.5/week).
 * null when the range hasn't started — no averages for a future month.
 */
export function weeksElapsed(range: Range, today: string): number | null {
  if (!range.from) return null;
  const end = range.to < today ? range.to : today;
  const days = dayNum(end) - dayNum(range.from) + 1;
  return days <= 0 ? null : Math.max(1, days / 7);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
export const perWeek = (total: number, weeks: number | null) => (weeks ? round1(total / weeks) : null);

export interface Summary {
  weeks: number | null;
  team: { avgTrainingsPerWeek: number | null; avgWorkoutsPerWeek: number | null };
}

/** Team = per person per week, averaged over the whole squad. */
export function summarise(rows: { trainings: number; workouts: number }[], weeks: number | null): Summary {
  const n = rows.length;
  const t = rows.reduce((a, r) => a + r.trainings, 0);
  const w = rows.reduce((a, r) => a + r.workouts, 0);
  return {
    weeks: weeks === null ? null : round1(weeks),
    team: {
      avgTrainingsPerWeek: n ? perWeek(t / n, weeks) : null,
      avgWorkoutsPerWeek: n ? perWeek(w / n, weeks) : null,
    },
  };
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
    // Best to worst for the selected period: most sessions overall, then more regular
    // trainings (the main target), then name so ties stay in a stable order.
    .sort((a, b) =>
      (b.trainings + b.workouts) - (a.trainings + a.workouts) ||
      b.trainings - a.trainings ||
      a.member.name.localeCompare(b.member.name));
}
