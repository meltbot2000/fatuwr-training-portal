import { describe, expect, it } from "vitest";
import { deriveTrainingRecords, toIsoDay } from "./trainingRecords";

const session = (over: Partial<Parameters<typeof deriveTrainingRecords>[1][number]> = {}) => ({
  rowId: "r1", trainingDate: "2026-10-04", trainingTime: "7:45 PM", day: "Sunday",
  pool: "CCAB", rainOff: "", ...over,
});
// The real cutoff is tested in sessionCutoff below; here "over" = everything except rowId "future".
const OPTS = { isOver: (s: { rowId?: string | null }) => s.rowId !== "future" };

describe("deriveTrainingRecords", () => {
  it("counts a sign-up to a closed session", () => {
    const out = deriveTrainingRecords(
      [{ id: 1, pool: "CCAB", dateOfTraining: "2026-10-04", activity: "Regular Training" }],
      [session()], OPTS,
    );
    expect(out).toEqual([{
      signupId: 1, date: "2026-10-04", pool: "CCAB", trainingTime: "7:45 PM", day: "Sunday",
      activity: "Regular Training", sessionId: "r1", rainOff: "",
    }]);
  });

  it("does not count a sign-up until the session is past its sign-up cutoff", () => {
    const out = deriveTrainingRecords(
      [{ id: 1, pool: "CCAB", dateOfTraining: "2026-10-04", activity: "Regular Training" }],
      [session({ rowId: "future" })], OPTS,
    );
    expect(out).toEqual([]);
  });

  it("accepts free-text session dates", () => {
    const out = deriveTrainingRecords(
      [{ id: 2, pool: "ccab ", dateOfTraining: "2026-03-01", activity: "Swims only" }],
      [session({ trainingDate: "1 March 2026" })], OPTS,
    );
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe("2026-03-01");
    expect(out[0].activity).toBe("Swims only");
  });

  it("excludes full rain-offs, keeps half rain-offs flagged", () => {
    const signups = [
      { id: 1, pool: "CCAB", dateOfTraining: "2026-10-04", activity: "Regular Training" },
      { id: 2, pool: "MGS", dateOfTraining: "2026-10-05", activity: "Regular Training" },
    ];
    const out = deriveTrainingRecords(signups, [
      session({ rainOff: "Full Rain Off" }),
      session({ rowId: "r2", pool: "MGS", trainingDate: "2026-10-05", rainOff: "Half Rain Off" }),
    ], OPTS);
    expect(out.map(r => [r.signupId, r.rainOff])).toEqual([[2, "half"]]);
  });

  it("skips refunds, membership rows, and rows matching no session", () => {
    const out = deriveTrainingRecords([
      { id: 1, pool: "CCAB", dateOfTraining: "2026-10-04", activity: "Rain Off Refund" },
      { id: 2, pool: "", dateOfTraining: "", activity: "Membership Fee" },
      { id: 3, pool: "", dateOfTraining: "2026-10-04", activity: "Regular Training" }, // blank pool (SYSTEM.md §13 #7)
      { id: 4, pool: "OTHER", dateOfTraining: "2026-10-04", activity: "Regular Training" },
    ], [session()], OPTS);
    expect(out).toEqual([]);
  });

  it("normalises legacy activity spellings and dedupes duplicate sign-ups", () => {
    const out = deriveTrainingRecords([
      { id: 1, pool: "CCAB", dateOfTraining: "2026-10-04", activity: "First-timer" },
      { id: 9, pool: "CCAB", dateOfTraining: "2026-10-04", activity: "First Timer" },
    ], [session()], OPTS);
    expect(out).toHaveLength(1);
    expect(out[0].activity).toBe("First Timer");
  });

  it("applies from/to and sorts newest first", () => {
    const out = deriveTrainingRecords([
      { id: 1, pool: "CCAB", dateOfTraining: "2026-09-01", activity: "Regular Training" },
      { id: 2, pool: "CCAB", dateOfTraining: "2026-10-01", activity: "Regular Training" },
      { id: 3, pool: "CCAB", dateOfTraining: "2026-11-01", activity: "Regular Training" },
    ], ["2026-09-01", "2026-10-01", "2026-11-01"].map((d, i) => session({ rowId: `r${i}`, trainingDate: d })),
    { ...OPTS, from: "2026-09-15" });
    expect(out.map(r => r.signupId)).toEqual([3, 2]);
  });
});

describe("toIsoDay", () => {
  it("handles ISO, M/D/YYYY and free text without shifting the day", () => {
    expect(toIsoDay("2026-04-19T00:00:00Z")).toBe("2026-04-19");
    expect(toIsoDay("4/9/2026")).toBe("2026-04-09");
    expect(toIsoDay("19 April 2026")).toBe("2026-04-19");
    expect(toIsoDay("")).toBe("");
    expect(toIsoDay("garbage")).toBe("");
  });
});

describe("sign-up cutoff (shared with the sessions list)", async () => {
  const { isPastSignupCutoff } = await import("./googleSheets");
  const s = { trainingDate: "1 November 2026", trainingTime: "7:45 PM – 9:45 PM" };
  // 7:45 PM SGT = 11:45 UTC; cutoff 1 h later = 12:45 UTC
  it("is not over before start + 1 h (SGT), and is over from then on", () => {
    expect(isPastSignupCutoff(s, Date.parse("2026-11-01T12:44:59Z"))).toBe(false);
    expect(isPastSignupCutoff(s, Date.parse("2026-11-01T12:45:00Z"))).toBe(true);
    expect(isPastSignupCutoff({ trainingDate: "2026-11-01", trainingTime: "19:45 - 21:45" }, Date.parse("2026-11-01T12:46:00Z"))).toBe(true);
  });
  it("never counts a session whose date cannot be parsed", () => {
    expect(isPastSignupCutoff({ trainingDate: "TBC" }, Date.now())).toBe(false);
  });
});
