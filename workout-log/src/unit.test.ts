import { describe, expect, it } from "vitest";
import { issueToken, verifyToken } from "./auth";
import { addDays, todaySgt } from "./config";
import { buildDashboard, parsePeriod, periodOptions, periodRange, summarise, weeksElapsed } from "./stats";
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
    expect(periodRange("2027-02", "2026-11-05", "2026-11-01")).toEqual({ from: "2027-02-01", to: "2027-02-28" }); // future month: whole span
  });
  it("offers Since prep start, Since <year>, then Nov–Mar for the Amager Cup", () => {
    const opts = periodOptions("2026-11-01", "2027-04-10", "2026-12-02");
    expect(opts.map(o => o.label)).toEqual(["Since prep start", "Since 2026", "Nov", "Dec", "Jan", "Feb", "Mar"]);
    expect(opts.filter(o => o.upcoming).map(o => o.label)).toEqual(["Jan", "Feb", "Mar"]);
    expect(parsePeriod("2026-12", opts)).toBe("2026-12");
    expect(parsePeriod("2027-02", opts)).toBe("2027-02"); // upcoming months are selectable
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
    [{ type: "Golf" }, /workout type/],
    [{ type: "Cardio" }, /workout type/],         // removed 2026-11-01
    [{ durationMin: 0 }, /Duration/],
    [{ durationMin: 12.5 }, /Duration/],
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

describe("weekly averages", () => {
  it("averages over elapsed weeks, at least one, none for a future range", () => {
    expect(weeksElapsed({ from: "2026-11-01", to: "2026-11-14" }, "2026-11-14")).toBe(2);
    expect(weeksElapsed({ from: "2026-11-01", to: "2026-11-02" }, "2026-11-02")).toBe(1);      // floor of one week
    expect(weeksElapsed({ from: "2026-11-01", to: "2026-11-30" }, "2026-11-14")).toBe(2);      // month in progress
    expect(weeksElapsed({ from: "2027-02-01", to: "2027-02-28" }, "2026-11-14")).toBeNull();   // not started
  });
  it("team average is per person per week", () => {
    // 3 people, 2 weeks: 6 + 4 + 2 = 12 trainings → 4 per person → 2.0/week
    expect(summarise([{ trainings: 6, workouts: 2 }, { trainings: 4, workouts: 0 }, { trainings: 2, workouts: 1 }], 2))
      .toEqual({ weeks: 2, team: { avgTrainingsPerWeek: 2, avgWorkoutsPerWeek: 0.5 } });
    expect(summarise([], 2).team).toEqual({ avgTrainingsPerWeek: null, avgWorkoutsPerWeek: null });
    expect(summarise([{ trainings: 1, workouts: 1 }], null).team.avgTrainingsPerWeek).toBeNull();
  });
});

describe("squad order (best to worst)", () => {
  it("most sessions first, then more trainings, then name", () => {
    const m = (id: number, name: string) => ({ id, name, image: null, syncedAt: null, syncError: null });
    const t = (id: number, n: number) => Array.from({ length: n }, () => ({ member_id: id, date: "2026-11-10" }));
    const w = (id: number, n: number) => Array.from({ length: n }, () => ({ member_id: id, date: "2026-11-10", type: "Run", duration_min: 30, intensity: null }));
    const rows = buildDashboard(
      [m(1, "Zed"), m(2, "Amy"), m(3, "Bea"), m(4, "Cy")],
      [...t(1, 1), ...t(2, 3), ...t(3, 3)],
      [...w(1, 3), ...w(2, 1), ...w(3, 1), ...w(4, 1)],
      { from: "2026-11-01", to: "2026-11-30" });
    // Zed 1+3=4, Amy 3+1=4, Bea 3+1=4, Cy 0+1=1 → Amy & Bea (3 trainings) before Zed (1), by name
    expect(rows.map(r => r.member.name)).toEqual(["Amy", "Bea", "Zed", "Cy"]);
  });
});

import { puffSummary } from "./stats";

describe("Puff", () => {
  const today = "2026-12-13";
  const m = (id: number, name: string) => ({ id, name, image: null });
  const tr = (id: number, n: number, date = today) => Array.from({ length: n }, () => ({ member_id: id, date }));
  const squad = [m(1, "Ann"), m(2, "Bo"), m(3, "Cy"), m(4, "Di")];

  it("mood = sessions in the last 7 days ÷ 4 per person", () => {
    // goal 16. Ann 3t+1w (met) · Bo 2t · Cy 1w · Di nothing → 7 sessions = 44% → cruising
    const s = puffSummary(squad, [...tr(1, 3), ...tr(2, 2)], [...tr(1, 1), ...tr(3, 1)], today);
    expect([s.goal, s.sessions, s.pct, s.mood]).toEqual([16, 7, 0.44, "cruising"]);
    expect(s.metCount).toBe(1);
  });
  it("only counts the rolling 7-day window", () => {
    const s = puffSummary(squad, [...tr(1, 5, "2026-12-06"), ...tr(1, 1, "2026-12-07")], [], today);
    expect(s.sessions).toBe(1); // 6 Dec is 8 days ago
    expect(s.window).toEqual({ from: "2026-12-07", to: today });
  });
  it("thresholds: <40% snoozing, 40–79 cruising, 80–99 puffed, 100+ sparkly", () => {
    const at = (n: number) => puffSummary([m(1, "A")], tr(1, n), [], today).mood;   // goal 4
    expect([at(1), at(2), at(3), at(4), at(6)]).toEqual(["snoozing", "cruising", "cruising", "sparkly", "sparkly"]);
    expect(puffSummary([m(1, "A"), m(2, "B"), m(3, "C"), m(4, "D"), m(5, "E")], tr(1, 17), [], today).mood).toBe("puffed"); // 17/20 = 85%
  });
  it("tank order: glowing fish furthest right, then by sessions", () => {
    const s = puffSummary(squad,
      [...tr(1, 3), ...tr(2, 4), ...tr(3, 1)],      // Ann 3t, Bo 4t (no extra → not met), Cy 1t
      [...tr(1, 1)],                                  // Ann met both
      today);
    const byRank = [...s.fish].sort((a, b) => a.rank - b.rank).map(f => `${f.name}:${f.status}`);
    expect(byRank).toEqual(["Di:0", "Cy:1", "Bo:1", "Ann:2"]);
  });
});
