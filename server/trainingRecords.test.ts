import { describe, expect, it } from "vitest";
import { deriveTrainingRecords, toIsoDay } from "./trainingRecords";

const session = (over: Partial<Parameters<typeof deriveTrainingRecords>[1][number]> = {}) => ({
  rowId: "r1", trainingDate: "2026-10-04", trainingTime: "7:45 PM", day: "Sunday",
  pool: "CCAB", isClosed: "Closed", rainOff: "", ...over,
});

describe("deriveTrainingRecords", () => {
  it("counts a sign-up to a closed session", () => {
    const out = deriveTrainingRecords(
      [{ id: 1, pool: "CCAB", dateOfTraining: "2026-10-04", activity: "Regular Training" }],
      [session()],
    );
    expect(out).toEqual([{
      signupId: 1, date: "2026-10-04", pool: "CCAB", trainingTime: "7:45 PM", day: "Sunday",
      activity: "Regular Training", sessionId: "r1", rainOff: "",
    }]);
  });

  it("does not count a sign-up until the session is closed", () => {
    const out = deriveTrainingRecords(
      [{ id: 1, pool: "CCAB", dateOfTraining: "2026-10-04", activity: "Regular Training" }],
      [session({ isClosed: "" })],
    );
    expect(out).toEqual([]);
  });

  it("accepts the seeded 'TRUE' closed marker and free-text session dates", () => {
    const out = deriveTrainingRecords(
      [{ id: 2, pool: "ccab ", dateOfTraining: "2026-03-01", activity: "Swims only" }],
      [session({ trainingDate: "1 March 2026", isClosed: "TRUE" })],
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
    ]);
    expect(out.map(r => [r.signupId, r.rainOff])).toEqual([[2, "half"]]);
  });

  it("skips refunds, membership rows, and rows matching no session", () => {
    const out = deriveTrainingRecords([
      { id: 1, pool: "CCAB", dateOfTraining: "2026-10-04", activity: "Rain Off Refund" },
      { id: 2, pool: "", dateOfTraining: "", activity: "Membership Fee" },
      { id: 3, pool: "", dateOfTraining: "2026-10-04", activity: "Regular Training" }, // blank pool (SYSTEM.md §13 #7)
      { id: 4, pool: "OTHER", dateOfTraining: "2026-10-04", activity: "Regular Training" },
    ], [session()]);
    expect(out).toEqual([]);
  });

  it("normalises legacy activity spellings and dedupes duplicate sign-ups", () => {
    const out = deriveTrainingRecords([
      { id: 1, pool: "CCAB", dateOfTraining: "2026-10-04", activity: "First-timer" },
      { id: 9, pool: "CCAB", dateOfTraining: "2026-10-04", activity: "First Timer" },
    ], [session()]);
    expect(out).toHaveLength(1);
    expect(out[0].activity).toBe("First Timer");
  });

  it("applies from/to and sorts newest first", () => {
    const out = deriveTrainingRecords([
      { id: 1, pool: "CCAB", dateOfTraining: "2026-09-01", activity: "Regular Training" },
      { id: 2, pool: "CCAB", dateOfTraining: "2026-10-01", activity: "Regular Training" },
      { id: 3, pool: "CCAB", dateOfTraining: "2026-11-01", activity: "Regular Training" },
    ], ["2026-09-01", "2026-10-01", "2026-11-01"].map((d, i) => session({ rowId: `r${i}`, trainingDate: d })),
    { from: "2026-09-15" });
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
