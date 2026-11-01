import { describe, expect, it } from "vitest";
import { issueToken, verifyToken } from "./auth";
import { addDays, todaySgt } from "./config";
import { buildDashboard, parsePeriod, periodOptions, periodRange } from "./stats";
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
    expect(periodRange("prep", "2026-12-15", "2026-11-01")).toEqual({ from: "2026-11-01", to: "2026-12-15" });
    expect(periodRange("year", "2027-02-03", "2026-11-01")).toEqual({ from: "2026-01-01", to: "2027-02-03" });
    expect(periodRange("2026-11", "2026-12-15", "2026-11-01")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodRange("2026-12", "2026-12-15", "2026-11-01")).toEqual({ from: "2026-12-01", to: "2026-12-15" }); // capped at today
    expect(periodRange("2027-02", "2027-03-30", "2026-11-01")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(periodRange("2026-12", "2027-03-30", "2026-11-01").to).toBe("2026-12-31");             // year rollover
  });
  it("offers Since prep start, Since <year>, then Nov–Mar for the Amager Cup", () => {
    const opts = periodOptions("2026-11-01", "2027-04-10", "2026-12-02");
    expect(opts.map(o => o.label)).toEqual(["Since prep start", "Since 2026", "Nov", "Dec", "Jan", "Feb", "Mar"]);
    expect(opts.filter(o => o.disabled).map(o => o.label)).toEqual(["Jan", "Feb", "Mar"]);
    expect(parsePeriod("2026-12", opts)).toBe("2026-12");
    expect(parsePeriod("2027-02", opts)).toBe("prep"); // not started yet
    expect(parsePeriod("all", opts)).toBe("prep");     // retired choice
    expect(parsePeriod(undefined, opts)).toBe("prep");
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
    { member_id: 2, date: "2026-10-05", type: "Gym/Strength", duration_min: 60, intensity: null },
  ];

  it("counts per member within the range and ranks by total activity", () => {
    const rows = buildDashboard(members, trainings, workouts, { from: "2026-09-01", to: "2026-11-01" });
    expect(rows.map(r => [r.member.name, r.trainings, r.workouts])).toEqual([["Ben", 1, 3], ["Ann", 1, 0], ["Cat", 0, 0]]);
    const ben = rows[0];
    expect(ben.workoutMinutes).toBe(135);
    expect(ben.avgIntensity).toBe(7.5);
    expect(ben.topTypes).toEqual([{ type: "Swim", count: 2 }, { type: "Gym/Strength", count: 1 }]);
    expect(ben.lastActive).toBe("2026-10-05");
    expect(ben.syncError).toBe("502 portal_unreachable");
    expect(rows[2].lastActive).toBeNull();
  });

  it("all-time includes older trainings", () => {
    const rows = buildDashboard(members, trainings, workouts, { from: null, to: "2026-11-01" });
    expect(rows.find(r => r.member.id === 1)!.trainings).toBe(2);
  });
});

describe("workout types", () => {
  it("are exactly the club's list, in order", async () => {
    const { WORKOUT_TYPES } = await import("./stats");
    expect([...WORKOUT_TYPES]).toEqual(["Run", "Swim", "Gym/Strength", "HIIT", "Mobility", "Others"]);
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
    [{ type: "Cardio" }, /type/],         // removed 2026-11-01
    [{ durationMin: 0 }, /durationMin/],
    [{ durationMin: 12.5 }, /durationMin/],
    [{ intensity: 11 }, /intensity/],
    [{ notes: "x".repeat(2001) }, /too long/],
  ])("rejects %o", (patch, msg) => {
    expect(() => workoutInput({ ...ok, ...patch }, "2026-11-01")).toThrow(BadRequest);
    expect(() => workoutInput({ ...ok, ...patch }, "2026-11-01")).toThrow(msg);
  });
});

import { matchInvite } from "./invites";

describe("matchInvite", () => {
  const members = [
    { id: 1, name: "Rei Tan" }, { id: 2, name: "Andrei Lim" }, { id: 3, name: "Reina Ho" },
    { id: 4, name: "Melanie Tan" }, { id: 5, name: "Melanie Goh" }, { id: 6, name: "Génevieve  Ong" },
    { id: 7, name: "Gaya" },
  ];
  it("matches on first name only, not substrings", () => {
    expect(matchInvite("Rei", members).map(m => m.id)).toEqual([1]);
  });
  it("returns every candidate when ambiguous", () => {
    expect(matchInvite("melanie", members).map(m => m.id)).toEqual([4, 5]);
  });
  it("ignores accents, case, extra spaces; matches whole single-word names", () => {
    expect(matchInvite("Genevieve", members).map(m => m.id)).toEqual([6]);
    expect(matchInvite("Genevieve Ong", members).map(m => m.id)).toEqual([6]);
    expect(matchInvite("GAYA", members).map(m => m.id)).toEqual([7]);
  });
  it("no match for unknown names", () => {
    expect(matchInvite("Dylia", members)).toEqual([]);
  });
});

import { describeSyncError, isTransient } from "./sync";
import { PortalError } from "./portal";

describe("sync errors", () => {
  it("retries portal 5xx and MySQL deadlocks, not 4xx", () => {
    expect(isTransient(new PortalError(502, "portal_unreachable"))).toBe(true);
    expect(isTransient(new PortalError(503, "db_unavailable"))).toBe(true);
    expect(isTransient(new PortalError(404, "not_found"))).toBe(false);
    expect(isTransient(new PortalError(401, "unauthorized"))).toBe(false);
    expect(isTransient({ errno: 1213 })).toBe(true);
    expect(isTransient(new Error("boom"))).toBe(false);
  });
  it("explains the error in plain English, keeping the raw code", () => {
    expect(describeSyncError(new PortalError(401, "unauthorized"))).toMatch(/^401 unauthorized: .*PORTAL_API_KEY/);
    expect(describeSyncError(new PortalError(404, "not_found"))).toMatch(/no portal account/);
    expect(describeSyncError(Object.assign(new Error("Deadlock found"), { code: "ER_LOCK_DEADLOCK" }))).toBe("local: ER_LOCK_DEADLOCK Deadlock found");
  });
});

import { clip } from "./db";

describe("clip (sync never fails on an over-long portal value)", () => {
  it("clips to the column width and handles empty values", () => {
    expect(clip("x".repeat(300), 256)).toHaveLength(256);
    expect(clip("Sunday", 256)).toBe("Sunday");
    expect(clip(null, 10)).toBe("");
    expect(clip(undefined, 10)).toBe("");
  });
});
