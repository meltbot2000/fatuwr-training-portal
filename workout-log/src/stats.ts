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
 *   "prep"     since the competition's prep start, to today   ("Prep", the default)
 *   "year"     calendar year of the prep start, 1 Jan–31 Dec  ("2026"; capped at today)
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
    { key: "prep", label: "Prep", upcoming: prepStart > today },
    { key: "year", label: prepStart.slice(0, 4), upcoming: false },
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
  if (period === "year") {
    const y = prepStart.slice(0, 4), end = `${y}-12-31`;
    return { from: `${y}-01-01`, to: end < today ? end : today };   // calendar year only
  }
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

/**
 * Weekly targets per person: at least N trainings (incl. trainer sessions) and M other workouts. Set per
 * competition in Admin (competitions.target_trainings / target_workouts); these are the
 * defaults. ONE source for both screens: the Dashboard colours averages green when they
 * meet them, and Puff's team goal / glowing fish use the same numbers.
 */
export interface Targets { trainingsPerWeekMin: number; workoutsPerWeekMin: number }
export const DEFAULT_TARGETS: Targets = { trainingsPerWeekMin: 2, workoutsPerWeekMin: 1 };

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

/** Monday (YYYY-MM-DD) of the Mon–Sun week a date falls in. */
export function mondayOf(iso: string): string {
  const dow = new Date(dayNum(iso) * 86_400_000).getUTCDay();   // 0 = Sun
  return addDays(iso, -((dow + 6) % 7));
}

/**
 * No double counting: in each Mon–Sun week, a person's trainings FIRST fill the training
 * target (`minPerWeek`); only trainings beyond it count as OTHER WORKOUTS (the club's
 * rule: extra UWR sessions are extra work).
 *
 * Callers pass only the trainings INSIDE what's being shown (the chip's period, Puff's
 * 7 days). Splitting whole calendar weeks that stick out of the period was a bug: Mon/Tue
 * trainings before a Wednesday prep start "used up" the target, so the first training
 * inside the period showed as an other workout and trainings read 0.
 * `weekKey` lets Puff treat its rolling 7 days as one week.
 */
export function splitTrainings<T extends { date: string }>(
  rows: T[], minPerWeek: number, weekKey: (date: string) => string = mondayOf,
): { counted: T[]; overflow: T[] } {
  const byWeek = new Map<string, T[]>();
  for (const r of rows) {
    const k = weekKey(r.date);
    (byWeek.get(k) ?? byWeek.set(k, []).get(k)!).push(r);
  }
  const counted: T[] = [], overflow: T[] = [];
  for (const week of byWeek.values()) {
    week.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    week.forEach((r, i) => (i < minPerWeek ? counted : overflow).push(r));
  }
  return { counted, overflow };
}

/** splitTrainings for many people at once (rows carry member_id). */
export function splitByMember<T extends { member_id: number; date: string }>(
  rows: T[], minPerWeek: number, weekKey: (date: string) => string = mondayOf,
) {
  const byMember = new Map<number, T[]>();
  for (const r of rows) (byMember.get(r.member_id) ?? byMember.set(r.member_id, []).get(r.member_id)!).push(r);
  const counted: T[] = [], overflow: T[] = [];
  for (const list of byMember.values()) {
    const s = splitTrainings(list, minPerWeek, weekKey);
    counted.push(...s.counted); overflow.push(...s.overflow);
  }
  return { counted, overflow };
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
  /** includes trainingsAsOther */
  workouts: number;
  /** trainings beyond the weekly minimum, counted as other workouts */
  trainingsAsOther: number;
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
  targets: Targets = DEFAULT_TARGETS,
): DashboardRow[] {
  const rows = new Map<number, DashboardRow & { _rpe: number[]; _types: Map<string, number> }>();
  for (const m of members) {
    rows.set(m.id, {
      member: { id: m.id, name: m.name, image: m.image },
      trainings: 0, workouts: 0, trainingsAsOther: 0, workoutMinutes: 0, avgIntensity: null, topTypes: [], lastActive: null,
      syncedAt: m.syncedAt, syncError: m.syncError, _rpe: [], _types: new Map(),
    });
  }
  const touch = (r: DashboardRow, date: string) => { if (!r.lastActive || date > r.lastActive) r.lastActive = date; };

  // Only trainings inside the period take part (see splitTrainings for why).
  const { counted, overflow } = splitByMember(trainings.filter(t => inRange(t.date, range)), targets.trainingsPerWeekMin);
  for (const t of counted) {
    const r = rows.get(t.member_id);
    if (!r || !inRange(t.date, range)) continue;
    r.trainings++;
    touch(r, t.date);
  }
  // Trainings beyond the weekly minimum count as other workouts (no double counting).
  for (const t of overflow) {
    const r = rows.get(t.member_id);
    if (!r || !inRange(t.date, range)) continue;
    r.workouts++;
    r.trainingsAsOther++;
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

// ── Puff ─────────────────────────────────────────────────────────────────────────
/**
 * Puff's mood = how the whole squad did over the LAST 7 DAYS (rolling, so Puff doesn't
 * fall asleep every Monday): sessions logged ÷ team goal, where the goal per person is
 * the competition's weekly targets (default 2 trainings + 1 other workout).
 */
export const PUFF = {
  windowDays: 7,
  // mood thresholds on sessions ÷ goal
  moods: [
    { key: "snoozing", label: "Snoozing", from: 0 },
    { key: "cruising", label: "Cruising", from: 0.4 },
    { key: "puffed", label: "Puffed up!", from: 0.8 },
    { key: "sparkly", label: "Sparkly!", from: 1 },
  ],
} as const;

export interface PuffFish {
  id: number; name: string; image: string | null;
  trainings: number; workouts: number; sessions: number;
  /** 0 nothing yet · 1 some sessions · 2 met both weekly targets */
  status: 0 | 1 | 2;
  /** 0 = least active … n-1 = most active; the tank places fish left → right by this */
  rank: number;
}

export function puffSummary(
  members: { id: number; name: string; image: string | null }[],
  trainings: TrainingLite[],
  workouts: { member_id: number; date: string }[],
  today: string,
  targets: Targets = DEFAULT_TARGETS,
) {
  const from = addDays(today, -(PUFF.windowDays - 1));
  const win = { from, to: today };
  // Same no-double-counting rule as the Dashboard, with the rolling 7 days as the week:
  // trainings fill the training target first, any beyond it count as other workouts.
  const { counted, overflow } = splitByMember(trainings.filter(t => inRange(t.date, win)), targets.trainingsPerWeekMin, () => "window");
  const fish = members.map(m => {
    const t = counted.filter(x => x.member_id === m.id && inRange(x.date, win)).length;
    const w = workouts.filter(x => x.member_id === m.id && inRange(x.date, win)).length
            + overflow.filter(x => x.member_id === m.id && inRange(x.date, win)).length;
    const met = t >= targets.trainingsPerWeekMin && w >= targets.workoutsPerWeekMin;
    return { id: m.id, name: m.name, image: m.image, trainings: t, workouts: w, sessions: t + w,
             status: (met ? 2 : t + w > 0 ? 1 : 0) as 0 | 1 | 2, rank: 0 };
  });
  // Least → most: status first (glowing fish end up furthest right), then sessions, then
  // trainings; name keeps ties stable.
  [...fish]
    .sort((a, b) => a.status - b.status || a.sessions - b.sessions || a.trainings - b.trainings || b.name.localeCompare(a.name))
    .forEach((f, i) => { f.rank = i; });

  const goal = members.length * (targets.trainingsPerWeekMin + targets.workoutsPerWeekMin);
  const sessions = fish.reduce((a, f) => a + f.sessions, 0);
  const pct = goal ? sessions / goal : 0;
  const mood = [...PUFF.moods].reverse().find(m => pct >= m.from)!;
  return {
    window: win, goal, sessions, pct: Math.round(pct * 100) / 100,
    perPerson: { trainings: targets.trainingsPerWeekMin, workouts: targets.workoutsPerWeekMin },
    mood: mood.key, moodLabel: mood.label,
    metCount: fish.filter(f => f.status === 2).length,
    thresholds: PUFF.moods.map(m => ({ key: m.key, label: m.label, from: m.from })),
    fish,
  };
}
