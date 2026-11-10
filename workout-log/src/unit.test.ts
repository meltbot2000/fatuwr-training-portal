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
    expect(periodRange("year", "2027-02-03", "2026-11-01")).toEqual({ from: "2026-01-01", to: "2026-12-31" }); // calendar 2026 only
    expect(periodRange("year", "2026-11-20", "2026-11-01")).toEqual({ from: "2026-01-01", to: "2026-11-20" }); // capped at today
    expect(periodRange("2026-11", "2026-12-15", "2026-11-01")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodRange("2026-12", "2026-12-15", "2026-11-01")).toEqual({ from: "2026-12-01", to: "2026-12-15" }); // capped at today
    expect(periodRange("2027-02", "2027-03-30", "2026-11-01")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(periodRange("2026-12", "2027-03-30", "2026-11-01").to).toBe("2026-12-31");             // year rollover
    expect(periodRange("2027-02", "2026-11-05", "2026-11-01")).toEqual({ from: "2027-02-01", to: "2027-02-28" }); // future month: whole span
  });
  it("offers Prep, 2026, then Nov–Mar for the Amager Cup", () => {
    const opts = periodOptions("2026-11-01", "2027-04-10", "2026-12-02");
    expect(opts.map(o => o.label)).toEqual(["Prep", "2026", "Nov", "Dec", "Jan", "Feb", "Mar"]);
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

  it("mood = sessions in the last 7 days ÷ 3 per person (2 trainings + 1 extra)", () => {
    // goal 12. Ann 2t+1w (met) · Bo 2t · Cy 1w · Di nothing → 6 sessions = 50% → cruising
    const s = puffSummary(squad, [...tr(1, 2), ...tr(2, 2)], [...tr(1, 1), ...tr(3, 1)], today);
    expect([s.goal, s.sessions, s.pct, s.mood]).toEqual([12, 6, 0.5, "cruising"]);
    expect(s.perPerson).toEqual({ trainings: 2, workouts: 1 });
    expect(s.metCount).toBe(1);
  });
  it("only counts the rolling 7-day window", () => {
    const s = puffSummary(squad, [...tr(1, 5, "2026-12-06"), ...tr(1, 1, "2026-12-07")], [], today);
    expect(s.sessions).toBe(1); // 6 Dec is 8 days ago
    expect(s.window).toEqual({ from: "2026-12-07", to: today });
  });
  it("thresholds: <40% snoozing, 40–79 cruising, 80–99 puffed, 100+ sparkly", () => {
    const five = [m(1, "A"), m(2, "B"), m(3, "C"), m(4, "D"), m(5, "E")];   // goal 15
    const at = (n: number) => puffSummary(five, tr(1, n), [], today).mood;
    expect([at(5), at(6), at(11), at(12), at(14), at(15), at(20)])
      .toEqual(["snoozing", "cruising", "cruising", "puffed", "puffed", "sparkly", "sparkly"]);
  });
  it("tank order: glowing fish (2+ trainings and 1+ extra) furthest right, then by sessions", () => {
    const s = puffSummary(squad,
      [...tr(1, 2), ...tr(2, 4), ...tr(3, 1)],      // Ann 2t, Bo 4t, Cy 1t
      [...tr(1, 1)],                                  // Ann 1 other workout → met both
      today);
    // Bo's 4 trainings = 2 trainings + 2 counted as other workouts (no double counting),
    // so Bo meets both targets too, and with 4 sessions sits right of Ann's 3.
    const byRank = [...s.fish].sort((a, b) => a.rank - b.rank).map(f => `${f.name}:${f.status}`);
    expect(byRank).toEqual(["Di:0", "Cy:1", "Ann:2", "Bo:2"]);
  });
});

import { DEFAULT_TARGETS } from "./stats";
describe("weekly targets (per competition)", () => {
  const today = "2026-12-13";
  const m = (id: number, name: string) => ({ id, name, image: null });
  const tr = (id: number, n: number) => Array.from({ length: n }, () => ({ member_id: id, date: today }));

  it("default to 2 trainings + 1 extra a week", () => {
    expect(DEFAULT_TARGETS).toEqual({ trainingsPerWeekMin: 2, workoutsPerWeekMin: 1 });
  });
  it("a competition's own targets drive Puff's goal and who glows", () => {
    // Ann 3t + 2w. Default (2+1): goal 3, met. Custom 3+2: goal 5, still met. Custom 4+1: not met.
    const squad = [m(1, "Ann")];
    const t = tr(1, 3), w = tr(1, 2);
    const def = puffSummary(squad, t, w, today);
    const c32 = puffSummary(squad, t, w, today, { trainingsPerWeekMin: 3, workoutsPerWeekMin: 2 });
    const c41 = puffSummary(squad, t, w, today, { trainingsPerWeekMin: 4, workoutsPerWeekMin: 1 });
    expect([def.goal, def.fish[0].status, def.perPerson]).toEqual([3, 2, { trainings: 2, workouts: 1 }]);
    expect([c32.goal, c32.fish[0].status, c32.mood]).toEqual([5, 2, "sparkly"]);
    expect([c41.goal, c41.fish[0].status, c41.pct]).toEqual([5, 1, 1]);
  });
});

import { mondayOf, splitTrainings } from "./stats";

describe("no double counting: trainings beyond the weekly minimum count as other workouts", () => {
  it("weeks run Monday to Sunday", () => {
    expect(mondayOf("2026-11-02")).toBe("2026-11-02"); // Mon
    expect(mondayOf("2026-11-08")).toBe("2026-11-02"); // Sun
    expect(mondayOf("2026-11-01")).toBe("2026-10-26"); // Sun → previous Mon
    expect(mondayOf("2027-01-01")).toBe("2026-12-28"); // across the year
  });
  it("first N each week stay trainings, the rest move; earliest first", () => {
    const t = ["2026-11-02", "2026-11-04", "2026-11-06", "2026-11-08", "2026-11-10"].map(date => ({ date }));
    const s = splitTrainings(t, 2);
    expect(s.counted.map(x => x.date)).toEqual(["2026-11-02", "2026-11-04", "2026-11-10"]);
    expect(s.overflow.map(x => x.date)).toEqual(["2026-11-06", "2026-11-08"]);
  });
  it("a big week can't make up for a missed one", () => {
    const t = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map(date => ({ date }));   // 4 in week 1, 0 in week 2
    expect(splitTrainings(t, 2).counted).toHaveLength(2);
  });
  it("Dashboard: 4 trainings + 0 workouts shows 4 + 0, but the target boxes read 2 + 2", () => {
    const m = [{ id: 1, name: "Ann", image: null, syncedAt: null, syncError: null }];
    const tr = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map(date => ({ member_id: 1, date }));
    const rows = buildDashboard(m, tr, [], { from: "2026-11-02", to: "2026-11-08" }, { trainingsPerWeekMin: 2, workoutsPerWeekMin: 1 });
    expect([rows[0].trainings, rows[0].workouts, rows[0].extraTrainings]).toEqual([4, 0, 2]);
    expect(summarise(rows, 1).team).toEqual({ avgTrainingsPerWeek: 2, avgWorkoutsPerWeek: 2 });
  });
  it("trainings fill the training target first, even when the period starts mid-week", () => {
    // Regression: prep starts Wed 4 Nov. Mon+Tue trainings are OUTSIDE the period and must
    // not use up the target, so Wed's training is a training, not an other workout.
    const m = [{ id: 1, name: "Ann", image: null, syncedAt: null, syncError: null }];
    const tr = ["2026-11-02", "2026-11-03", "2026-11-04"].map(date => ({ member_id: 1, date }));
    const [row] = buildDashboard(m, tr, [], { from: "2026-11-04", to: "2026-11-08" }, { trainingsPerWeekMin: 2, workoutsPerWeekMin: 1 });
    expect([row.trainings, row.workouts, row.extraTrainings]).toEqual([1, 0, 0]);
  });
  it("a period of one training never shows it as an other workout", () => {
    const m = [{ id: 1, name: "Ann", image: null, syncedAt: null, syncError: null }];
    const tr = ["2026-10-28", "2026-10-30", "2026-11-01"].map(date => ({ member_id: 1, date }));   // Wed, Fri, Sun
    const [row] = buildDashboard(m, tr, [], { from: "2026-11-01", to: "2026-11-02" }, { trainingsPerWeekMin: 2, workoutsPerWeekMin: 1 });
    expect([row.trainings, row.workouts]).toEqual([1, 0]);
  });
  it("Puff: trainings before the 7-day window don't use up the target", () => {
    const m = [{ id: 1, name: "Ann", image: null }];
    // window = 7–13 Dec; 30 Nov/1 Dec are outside; 8, 9 Dec inside → both are trainings
    const tr = ["2026-11-30", "2026-12-01", "2026-12-08", "2026-12-09"].map(date => ({ member_id: 1, date }));
    const s = puffSummary(m, tr, [], "2026-12-13", { trainingsPerWeekMin: 2, workoutsPerWeekMin: 1 });
    expect([s.fish[0].trainings, s.fish[0].workouts]).toEqual([2, 0]);
  });
  it("Puff: fish show real counts, but extra trainings still make them glow", () => {
    const m = [{ id: 1, name: "Ann", image: null }];
    const tr = ["2026-11-02", "2026-11-03", "2026-11-04"].map(date => ({ member_id: 1, date }));
    const s = puffSummary(m, tr, [], "2026-11-05", { trainingsPerWeekMin: 2, workoutsPerWeekMin: 1 });
    expect([s.fish[0].trainings, s.fish[0].workouts, s.fish[0].status, s.sessions]).toEqual([3, 0, 2, 3]);
  });
});

describe("Puff never counts sessions from before prep started", () => {
  const m = [{ id: 1, name: "Ann", image: null }, { id: 2, name: "Bo", image: null }];
  it("window starts at prep start in the first week, goal scaled to the days", () => {
    // prep starts Sun 1 Nov; today Mon 2 Nov. Oct sessions must not count.
    const tr = ["2026-10-28", "2026-10-30", "2026-11-01"].map(date => ({ member_id: 1, date }));
    const s = puffSummary(m, tr, [{ member_id: 1, date: "2026-10-31" }], "2026-11-02",
      { trainingsPerWeekMin: 2, workoutsPerWeekMin: 1 }, "2026-11-01");
    expect(s.window).toEqual({ from: "2026-11-01", to: "2026-11-02" });
    expect([s.days, s.sincePrepStart, s.sessions]).toEqual([2, true, 1]);
    expect(s.goal).toBeCloseTo(2 * 3 * 2 / 7, 1);   // 2 people × 3 sessions × 2/7 of a week
    expect(s.fish.find(f => f.name === "Ann")!.status).toBe(1);   // 1 training, not glowing
  });
  it("after the first week it's the normal last 7 days", () => {
    const s = puffSummary(m, [], [], "2026-11-20", { trainingsPerWeekMin: 2, workoutsPerWeekMin: 1 }, "2026-11-01");
    expect([s.window.from, s.days, s.sincePrepStart, s.goal]).toEqual(["2026-11-14", 7, false, 6]);
  });
});

describe("tank ties", () => {
  const T = { trainingsPerWeekMin: 2, workoutsPerWeekMin: 1 };
  const ranks = (s: ReturnType<typeof puffSummary>) => Object.fromEntries(s.fish.map(f => [f.name, f.rank]));
  it("same sessions in the 7 days: more trainings wins", () => {
    const m = [{ id: 1, name: "Ann", image: null }, { id: 2, name: "Zoe", image: null }];
    const s = puffSummary(m, [{ member_id: 2, date: "2026-11-08" }], [{ member_id: 1, date: "2026-11-09" }], "2026-11-10", T, "2026-11-01");
    expect(ranks(s)).toEqual({ Ann: 0, Zoe: 1 });
  });
  it("same sessions and trainings: more other workouts since prep start wins, not the name", () => {
    const m = [{ id: 1, name: "Melanie", image: null }, { id: 2, name: "Annabel", image: null }];
    const tr = [{ member_id: 1, date: "2026-11-10" }, { member_id: 2, date: "2026-11-08" }];
    const wo = [{ member_id: 1, date: "2026-11-02" }];   // before the 7 days, after prep start
    const s = puffSummary(m, tr, wo, "2026-11-11", T, "2026-11-01");
    expect(ranks(s)).toEqual({ Annabel: 0, Melanie: 1 });
    expect(s.fish.map(f => [f.name, f.trainings, f.workouts, f.workoutsSincePrep])).toEqual([["Melanie", 1, 0, 1], ["Annabel", 1, 0, 0]]);
  });
});
