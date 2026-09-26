/**
 * Activity names, in one place.
 *
 * Two spellings of the same thing are live in the database: "First-timer" on 41 rows
 * written up to April 2026, and "First Timer" on 19 rows written since — because the
 * sign-up form and the edit sheet disagreed. That disagreement had two visible effects:
 * a first-timer fell into the Splits page's "Other" bucket, and opening the admin edit
 * sheet on their row preselected "Regular Training", so saving it silently charged them.
 *
 * Everything the UI does with an activity should go through normaliseActivity(), so any
 * historical spelling lands in the right place regardless of what is stored.
 */

export const ACTIVITIES = ["Regular Training", "Swims only", "Trainer", "First Timer"] as const;
export type Activity = (typeof ACTIVITIES)[number];

/** What people read. The stored value stays canonical; only this changes wording. */
export const ACTIVITY_LABELS: Record<Activity, string> = {
  "Regular Training": "Regular Training",
  "Swims only": "Swims only",
  "Trainer": "Trainer",
  "First Timer": "First timer",
};

// Accounting rows that live in sheet_signups but are not people at a session: refunds
// attached to a rained-off session, and membership/trial fees (which carry no pool).
const NON_ATTENDANCE = new Set(["rain off refund", "membership fee", "trial membership"]);

const ALIASES: Record<string, Activity> = {
  "regular training": "Regular Training",
  "regular": "Regular Training",
  "training": "Regular Training",
  "swims only": "Swims only",
  "swim only": "Swims only",
  "swims": "Swims only",
  "trainer": "Trainer",
  "first timer": "First Timer",
  "first-timer": "First Timer",
  "firsttimer": "First Timer",
  "first time": "First Timer",
};

/**
 * Map a stored activity to its canonical name, or null if it is not one of the four
 * attendance activities (an unknown value, or an accounting row).
 */
export function normaliseActivity(raw: string | null | undefined): Activity | null {
  const key = (raw || "").toLowerCase().trim().replace(/\s+/g, " ");
  return ALIASES[key] ?? null;
}

/** Is this row a person attending, rather than a refund or a membership fee? */
export function isAttendanceRow(raw: string | null | undefined): boolean {
  const key = (raw || "").toLowerCase().trim().replace(/\s+/g, " ");
  return !NON_ATTENDANCE.has(key);
}
