import { describe, expect, it } from "vitest";
import { issueToken, verifyToken } from "./auth";
import { addDays, todaySgt } from "./config";
import { buildDashboard, periodRange } from "./stats";
import { BadRequest, workoutInput } from "./validate";

const SECRET = "x".repeat(40);

describe("tokens", () => {
  it("round-trips and rejects tampering, wrong secret and expiry", () => {
    const t = issueToken(42, SECRET, 1_000);
    expect(verifyToken(t, SECRET, 2_000)).toBe(42);
    expect(verifyToken(t, "y".repeat(40), 2_000)).toBeNull();
    const [data, mac] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: 1, exp: 9e15 })).toString("base64url");
    expect(verifyToken(`${forged}.${mac}`, SECRET, 2_000)).toBeNull();
    expect(verifyToken(`${data}.${mac}`, SECRET, 1_000 + 91 * 86400_000)).toBeNull();
    expect(verifyToken("", SECRET)).toBeNull();
  });
});

describe("dates", () => {
  it("computes today in Singapore, not UTC", () => {
    // 2026-11-01 17:00 UTC is already 2 Nov in SGT
    expect(todaySgt(new Date("2026-11-01T17:00:00Z"))).toBe("2026-11-02");
    expect(todaySgt(new Date("2026-11-01T15:59:00Z"))).toBe("2026-11-01");
  });
  it("adds days across month/year boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("builds period ranges", () => {
    expect(periodRange("all", "2026-11-01", "2026-09-01")).toEqual({ from: null, to: "2026-11-01" });
    expect(periodRange("prep", "2026-11-01", "2026-09-01")).toEqual({ from: "2026-09-01", to: "2026-11-01" });
    expect(periodRange("4w", "2026-11-01", "2026-09-01")).toEqual({ from: "2026-10-05", to: "2026-11-01" });
  });
});

describe("buildDashboard", () => {
  const members = [
    { id: 1, name: "Ann", image: null, syncedAt: null, syncError: null },
    { id: 2, name: "Ben", image: null, syncedAt: null, syncError: "502 portal_unreachable" },
    { id: 3, name: "Cat", image: null, syncedAt: null, syncError: null },
  ];
  const trainings = [
    { member_id: 1, date: "2026-10-01" }, { member_id: 1, date: "2026-08-01" },
    { member_id: 2, date: "2026-10-02" },
    { member_id: 99, date: "2026-10-02" }, // not in squad
  ];
  const workouts = [
    { member_id: 2, date: "2026-10-03", type: "Swim", duration_min: 45, intensity: 6 },
    { member_id: 2, date: "2026-10-04", type: "Swim", duration_min: 30, intensity: 9 },
    { member_id: 2, date: "2026-10-05", type: "Gym / strength", duration_min: 60, intensity: null },
  ];

  it("counts per member within the range and ranks by total activity", () => {
    const rows = buildDashboard(members, trainings, workouts, { from: "2026-09-01", to: "2026-11-01" });
    expect(rows.map(r => [r.member.name, r.trainings, r.workouts])).toEqual([["Ben", 1, 3], ["Ann", 1, 0], ["Cat", 0, 0]]);
    const ben = rows[0];
    expect(ben.workoutMinutes).toBe(135);
    expect(ben.avgIntensity).toBe(7.5);
    expect(ben.topTypes).toEqual([{ type: "Swim", count: 2 }, { type: "Gym / strength", count: 1 }]);
    expect(ben.lastActive).toBe("2026-10-05");
    expect(ben.syncError).toBe("502 portal_unreachable");
    expect(rows[2].lastActive).toBeNull();
  });

  it("all-time includes older trainings", () => {
    const rows = buildDashboard(members, trainings, workouts, { from: null, to: "2026-11-01" });
    expect(rows.find(r => r.member.id === 1)!.trainings).toBe(2);
  });
});

describe("workoutInput", () => {
  const ok = { date: "2026-10-31", type: "Swim", durationMin: 40, intensity: 7, notes: " 10×50m " };
  it("accepts a valid workout and trims notes", () => {
    expect(workoutInput(ok, "2026-11-01")).toEqual({ date: "2026-10-31", type: "Swim", durationMin: 40, intensity: 7, notes: "10×50m" });
    expect(workoutInput({ ...ok, intensity: "" }, "2026-11-01").intensity).toBeNull();
  });
  it.each([
    [{ date: "2026-11-02" }, /future/],
    [{ date: "2026-02-30" }, /real date/],
    [{ type: "Golf" }, /type/],
    [{ durationMin: 0 }, /durationMin/],
    [{ durationMin: 12.5 }, /durationMin/],
    [{ intensity: 11 }, /intensity/],
    [{ notes: "x".repeat(2001) }, /too long/],
  ])("rejects %o", (patch, msg) => {
    expect(() => workoutInput({ ...ok, ...patch }, "2026-11-01")).toThrow(BadRequest);
    expect(() => workoutInput({ ...ok, ...patch }, "2026-11-01")).toThrow(msg);
  });
});
