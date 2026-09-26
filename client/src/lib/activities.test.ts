import { describe, expect, it } from "vitest";
import { normaliseActivity, isAttendanceRow, ACTIVITY_LABELS } from "./activities";

/**
 * Both spellings are live in the database — "First-timer" on 41 rows up to April 2026 and
 * "First Timer" on 19 rows since — because the sign-up form and the edit sheet disagreed.
 * A first-timer showed up under "Other" on the Splits page, and opening their row in the
 * admin edit sheet preselected "Regular Training", so saving charged them.
 */
describe("normaliseActivity", () => {
  it("treats both stored spellings of first timer as the same activity", () => {
    expect(normaliseActivity("First Timer")).toBe("First Timer");
    expect(normaliseActivity("First-timer")).toBe("First Timer");
    expect(normaliseActivity("first timer")).toBe("First Timer");
    expect(normaliseActivity("  FIRST-TIMER  ")).toBe("First Timer");
  });

  it("maps the other three activities", () => {
    expect(normaliseActivity("Regular Training")).toBe("Regular Training");
    expect(normaliseActivity("Swims only")).toBe("Swims only");
    expect(normaliseActivity("Swim only")).toBe("Swims only");
    expect(normaliseActivity("Trainer")).toBe("Trainer");
  });

  it("returns null for anything that is not an attendance activity", () => {
    expect(normaliseActivity("Rain Off Refund")).toBeNull();
    expect(normaliseActivity("Membership Fee")).toBeNull();
    expect(normaliseActivity("")).toBeNull();
    expect(normaliseActivity(null)).toBeNull();
  });
});

describe("isAttendanceRow", () => {
  it("excludes refunds and membership rows from a session roster", () => {
    // A rained-off session carries a refund row per attendee; without this the Splits
    // page lists everyone twice.
    expect(isAttendanceRow("Rain Off Refund")).toBe(false);
    expect(isAttendanceRow("Membership Fee")).toBe(false);
    expect(isAttendanceRow("Trial Membership")).toBe(false);
  });

  it("keeps real attendees, including spellings it does not recognise", () => {
    expect(isAttendanceRow("Regular Training")).toBe(true);
    expect(isAttendanceRow("First Timer")).toBe(true);
    expect(isAttendanceRow("Something New")).toBe(true);
  });
});

describe("labels", () => {
  it("reads 'First timer', not 'First-timer'", () => {
    expect(ACTIVITY_LABELS["First Timer"]).toBe("First timer");
  });
});
