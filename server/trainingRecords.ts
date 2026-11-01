/**
 * Training records — "which regular trainings did this person attend?"
 *
 * This is what the partner API (/api/v1/members/:id/trainings) serves to the workout-log
 * app. It is derived at read time from sheet_signups + sheet_sessions, never stored
 * (CLAUDE.md: counts are derived, not stored — see Bug 17).
 *
 * There is no check-in data in this system, so "attended" means "signed up", with these
 * rules:
 *   1. The sign-up must match a session by pool + date (the same key admin.allSessions
 *      and the rain-off flow use). Membership / trial fee rows carry no pool and match
 *      nothing; refunds are excluded by isAttendanceRow().
 *   2. The session must be OVER for sign-ups — past the portal's own sign-up cutoff
 *      (1 h after start, SGT; isPastSignupCutoff in googleSheets.ts, the same rule that
 *      drops a session off the sign-up list). The caller passes that test in as
 *      `isOver`, which keeps this module pure. The admin "close sign-ups" flag
 *      (isClosed) is NOT used: it is a sign-up control, not a sign that training happened.
 *   3. A FULL rain-off is excluded — nobody trained. A HALF rain-off still counts (people
 *      were in the water) and is flagged so the consumer can show it.
 *
 * Pure function: no DB, no Sheets — the caller passes rows in. That keeps the rule
 * testable and identical wherever it is used.
 */
import { isAttendanceRow, normaliseActivity } from "../client/src/lib/activities";

export interface TrainingRecord {
  /** sheet_signups.id — stable DB PK, safe to use as an upsert key downstream. */
  signupId: number;
  /** ISO YYYY-MM-DD */
  date: string;
  pool: string;
  trainingTime: string;
  day: string;
  /** Canonical activity name ("Regular Training", "Swims only", "Trainer", "First Timer"), or the raw value if unrecognised. */
  activity: string;
  /** sheet_sessions.rowId of the matched session. */
  sessionId: string;
  /** "" normally; "half" when the session was half rained off. */
  rainOff: "" | "half";
}

export interface SignupLike {
  id: number;
  pool?: string | null;
  dateOfTraining?: string | null;
  activity?: string | null;
}

export interface SessionLike {
  rowId?: string | null;
  trainingDate: string;
  trainingTime?: string | null;
  day?: string | null;
  pool?: string | null;
  rainOff?: string | null;
}

/**
 * Any stored date → YYYY-MM-DD. Same contract as toIsoDate() in routers.ts /
 * googleSheets.ts, including the Bug 19 rule: read back LOCAL components, never
 * toISOString(), or free-text dates shift a day east of UTC.
 */
export function toIsoDay(raw: string | null | undefined): string {
  const s = (raw || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const date = new Date(s);
  if (!isNaN(date.getTime())) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return "";
}

const key = (pool: string | null | undefined, isoDate: string) =>
  `${(pool || "").trim().toLowerCase()}|${isoDate}`;

export function deriveTrainingRecords(
  signups: SignupLike[],
  sessions: SessionLike[],
  opts: { isOver: (s: SessionLike) => boolean; from?: string; to?: string },
): TrainingRecord[] {
  const byKey = new Map<string, SessionLike>();
  for (const s of sessions) {
    const iso = toIsoDay(s.trainingDate);
    if (!iso || !(s.pool || "").trim()) continue;
    const k = key(s.pool, iso);
    // Two sessions on the same pool+date cannot be told apart from a sign-up row (it
    // stores no time). Keep the first.
    if (!byKey.has(k)) byKey.set(k, s);
  }

  const seen = new Set<string>();
  const out: TrainingRecord[] = [];
  for (const su of signups) {
    if (!isAttendanceRow(su.activity)) continue;
    const iso = toIsoDay(su.dateOfTraining);
    if (!iso || !(su.pool || "").trim()) continue;
    if (opts.from && iso < opts.from) continue;
    if (opts.to && iso > opts.to) continue;

    const session = byKey.get(key(su.pool, iso));
    if (!session || !opts.isOver(session)) continue;
    const rain = (session.rainOff || "").trim().toLowerCase();
    if (rain.startsWith("full")) continue;

    // One attendance per person per session, even if a duplicate sign-up row exists
    // (Bug 20 produced some) — a person cannot attend the same session twice.
    const dedupe = key(su.pool, iso);
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    out.push({
      signupId: su.id,
      date: iso,
      pool: (session.pool || "").trim(),
      trainingTime: (session.trainingTime || "").trim(),
      day: (session.day || "").trim(),
      activity: normaliseActivity(su.activity) ?? (su.activity || "").trim(),
      sessionId: (session.rowId || "").trim(),
      rainOff: rain.startsWith("half") ? "half" : "",
    });
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}
