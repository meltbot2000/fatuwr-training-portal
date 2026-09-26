import { describe, expect, it, vi, beforeEach, afterAll, afterEach } from "vitest";

vi.useFakeTimers({ shouldAdvanceTime: true });

/**
 * Reads of sheet_signups: what gets filtered where, and when the Google Sheet may be
 * consulted. Two standing rules are pinned here:
 *
 *  1. The POOL is filtered in SQL, the DATE is filtered in JS. dateOfTraining is stored
 *     in mixed formats while sheet_sessions.trainingDate is 100% free text, so an SQL
 *     date match drops rows (SYSTEM.md §9 Bug 1, 2026-04-25).
 *  2. "No sign-ups for this session" must NEVER fall through to the Sheet. The Sheet is
 *     stale for sign-ups (CLAUDE.md), so falling through resurrects deleted sign-ups and
 *     runs the duplicate check against stale data. Only a genuinely empty TABLE may.
 */

type Recorded = { cols: string[] | null; hasWhere: boolean; hasLimit: boolean; params: unknown[] };

/**
 * Pull the bound values out of a drizzle condition so a test can assert WHAT was filtered,
 * not merely that something was. Without this the fake cannot tell the indexed
 * pool+date query apart from the whole-pool read.
 */
function collectParams(node: any, out: unknown[] = []): unknown[] {
  if (node == null || typeof node !== "object") return out;
  if ("value" in node && typeof node.value !== "object") out.push(node.value);
  for (const key of ["queryChunks", "chunks", "params"]) {
    if (Array.isArray(node[key])) for (const child of node[key]) collectParams(child, out);
  }
  if (Array.isArray(node)) for (const child of node) collectParams(child, out);
  return out;
}
const queries: Recorded[] = [];
let tableRows: any[] = [];
// When set, a WHERE-filtered query yields this instead of every row — lets a test say
// "the table has rows, but none match this filter", which is a different case from
// "the table is empty" and must behave differently.
let filteredRows: any[] | null = null;

function chain(rows: any[], rec: Recorded): any {
  const p = Promise.resolve(rows);
  return {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
    where: (pred: any) => {
      rec.hasWhere = true;
      rec.params.push(...collectParams(pred));
      return chain(filteredRows ?? rows, rec);
    },
    limit: (n: number) => { rec.hasLimit = true; return chain(rows.slice(0, n), rec); },
  };
}

// How many rows the ISO-format probe reports. 0 => every stored date is ISO => the fast
// indexed path is allowed.
let nonIsoRowCount = 0;
let probeRan = 0;

const fakeDb = {
  execute: async () => { probeRan++; return [[{ n: nonIsoRowCount }], []]; },
  select: (cols?: Record<string, unknown>) => ({
    from: () => {
      const rec: Recorded = { cols: cols ? Object.keys(cols) : null, hasWhere: false, hasLimit: false, params: [] };
      queries.push(rec);
      return chain(tableRows, rec);
    },
  }),
};

vi.mock("./db", () => ({
  getDb: vi.fn(async () => fakeDb),
  upsertUser: vi.fn(),
}));

// Any attempt to reach the Google Sheet must fail loudly: these tests assert on WHETHER
// the Sheet is consulted, so a real network call would make them meaningless.
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  throw new Error("SHEETS_CONSULTED");
}) as typeof fetch;
afterAll(() => { globalThis.fetch = originalFetch; });

const { getSignUpsForSession, getAllSignupsByEmail, clearSessionsCache } = await import("./googleSheets");

// Shaped like the live table: ISO dates on app-written rows, free text on seeded ones,
// slash dates only on membership rows, and blank-pool membership/trial rows.
const ROWS = [
  { id: 1, name: "Ann",  email: "ann@example.com",  paymentId: "ann",  pool: "CCAB",       dateOfTraining: "2026-10-01", activity: "Regular Training", baseFee: 13, actualFees: 13, memberOnTrainingDate: "Member",     dateTimeOfSignUp: "", activityValue: "" },
  { id: 2, name: "Bob",  email: "bob@example.com",  paymentId: "bob",  pool: "CCAB",       dateOfTraining: "1 October 2026", activity: "Swims only", baseFee: 6.5, actualFees: 6.5, memberOnTrainingDate: "Member", dateTimeOfSignUp: "", activityValue: "" },
  { id: 3, name: "Cal",  email: "cal@example.com",  paymentId: "cal",  pool: "MGS",        dateOfTraining: "2026-10-01", activity: "Regular Training", baseFee: 13, actualFees: 13, memberOnTrainingDate: "Member",     dateTimeOfSignUp: "", activityValue: "" },
  { id: 4, name: "Dee",  email: "dee@example.com",  paymentId: "dee",  pool: "Queenstown", dateOfTraining: "2026-10-04", activity: "Swims only",      baseFee: 4.5, actualFees: 4.5, memberOnTrainingDate: "Member",   dateTimeOfSignUp: "", activityValue: "" },
  // Membership rows: blank pool, slash date. Must never attach to a training session.
  { id: 5, name: "Eve",  email: "eve@example.com",  paymentId: "eve",  pool: "",           dateOfTraining: "01/10/2026", activity: "Membership Fee",   baseFee: 47, actualFees: 47, memberOnTrainingDate: "Member",     dateTimeOfSignUp: "", activityValue: "" },
  { id: 6, name: "Fay",  email: "fay@example.com",  paymentId: "fay",  pool: "",           dateOfTraining: "",           activity: "Trial Membership", baseFee: 10, actualFees: 10, memberOnTrainingDate: "Non-Member", dateTimeOfSignUp: "", activityValue: "" },
];

beforeEach(() => {
  queries.length = 0;
  tableRows = ROWS;
  filteredRows = null;
  nonIsoRowCount = 0;
  probeRan = 0;
  clearSessionsCache();
  // the ISO probe caches for 10 minutes, so each test needs a fresh module state
  vi.setSystemTime(new Date(Date.now() + 11 * 60 * 1000));
});

describe("getSignUpsForSession", () => {
  it("matches an ISO sign-up date against a free-text session date (Bug 1 guard)", async () => {
    const rows = await getSignUpsForSession("1 October 2026", "CCAB", { fresh: true });
    expect(rows.map(r => r.name).sort()).toEqual(["Ann", "Bob"]);
  });

  it("filters the pool in SQL, not only in JS", async () => {
    await getSignUpsForSession("1 October 2026", "CCAB", { fresh: true });
    // A regression to `SELECT *` over the whole table would show up as a query with no
    // WHERE clause — that is the 285KB read this change exists to remove.
    expect(queries[0].hasWhere).toBe(true);
  });

  it("never attaches blank-pool membership or trial rows to a session", async () => {
    const rows = await getSignUpsForSession("1 October 2026", "CCAB", { fresh: true });
    expect(rows.some(r => r.activity === "Membership Fee")).toBe(false);
    expect(rows.some(r => r.activity === "Trial Membership")).toBe(false);
  });

  it("returns [] for a session nobody signed up for, WITHOUT consulting the Sheet", async () => {
    // The pool exists but this date has no sign-ups — the normal state of every future
    // session. Consulting the stale Sheet here would resurrect deleted sign-ups.
    const rows = await getSignUpsForSession("25 December 2026", "CCAB", { fresh: true });
    expect(rows).toEqual([]);
  });

  it("returns [] for a brand-new pool with no sign-ups yet, WITHOUT consulting the Sheet", async () => {
    const rows = await getSignUpsForSession("1 October 2026", "Bishan", { fresh: true });
    expect(rows).toEqual([]);
  });

  it("still falls back to the Sheet when the table is genuinely empty (cold start)", async () => {
    tableRows = [];
    // Proves the cold-start path is intact: the Sheets fetch is attempted and our stub
    // makes it fail. If the fallback had been dropped this would resolve to [] instead.
    await expect(getSignUpsForSession("1 October 2026", "CCAB", { fresh: true })).rejects.toThrow();
  });

  it("serves a second read of the same session from cache", async () => {
    await getSignUpsForSession("1 October 2026", "CCAB");
    const afterFirst = queries.length;
    const rows = await getSignUpsForSession("1 October 2026", "CCAB");
    expect(queries.length).toBe(afterFirst); // no further DB work
    expect(rows.map(r => r.name).sort()).toEqual(["Ann", "Bob"]);
  });

  it("does not serve one session's roster for another", async () => {
    await getSignUpsForSession("1 October 2026", "CCAB");
    const mgs = await getSignUpsForSession("1 October 2026", "MGS");
    expect(mgs.map(r => r.name)).toEqual(["Cal"]);
  });

  it("re-reads after a mutation busts the cache", async () => {
    await getSignUpsForSession("1 October 2026", "CCAB");
    const afterFirst = queries.length;
    clearSessionsCache();
    await getSignUpsForSession("1 October 2026", "CCAB");
    expect(queries.length).toBeGreaterThan(afterFirst);
  });

  it("bypasses the cache when asked for fresh data (the duplicate check)", async () => {
    await getSignUpsForSession("1 October 2026", "CCAB");
    const afterFirst = queries.length;
    await getSignUpsForSession("1 October 2026", "CCAB", { fresh: true });
    expect(queries.length).toBeGreaterThan(afterFirst);
  });
});

describe("getAllSignupsByEmail", () => {
  it("returns [] for a member with no sign-ups without scanning the whole table", async () => {
    filteredRows = [];                    // nothing matches them, but the table has rows
    const rows = await getAllSignupsByEmail("newbie@example.com", undefined, "newbie");
    // Previously this fell through to `SELECT * FROM sheet_signups` (~285KB) on every
    // page load for every new member. Now the only follow-up is a LIMIT 1 probe.
    expect(rows).toEqual([]);
    const unbounded = queries.filter(q => !q.hasWhere && !q.hasLimit);
    expect(unbounded).toEqual([]);
  });
});

describe("getSignUpsForSession — how the date gets filtered", () => {
  it("matches pool AND date in SQL when every stored date is ISO", async () => {
    nonIsoRowCount = 0;
    const rows = await getSignUpsForSession("1 October 2026", "CCAB", { fresh: true });
    expect(rows.map(r => r.name).sort()).toEqual(["Ann", "Bob"]);
    // The indexed path: both the pool and the normalised date are bound into the query,
    // so the DB returns ~20 rows instead of every row for the pool.
    const params = queries.flatMap(q => q.params);
    expect(params).toContain("CCAB");
    expect(params).toContain("2026-10-01");
    expect(probeRan).toBeGreaterThan(0);
  });

  it("falls back to the whole-pool read when any row's date is not ISO", async () => {
    nonIsoRowCount = 3;
    const rows = await getSignUpsForSession("1 October 2026", "CCAB", { fresh: true });
    // Same answer — the JS date comparison still runs and still catches "1 October 2026".
    expect(rows.map(r => r.name).sort()).toEqual(["Ann", "Bob"]);
    const params = queries.flatMap(q => q.params);
    expect(params).toContain("CCAB");
    expect(params).not.toContain("2026-10-01");
  });

  it("takes the safe path for a session date it cannot normalise", async () => {
    nonIsoRowCount = 0;
    await getSignUpsForSession("sometime next week", "CCAB", { fresh: true });
    const params = queries.flatMap(q => q.params);
    expect(params).toContain("CCAB");
    expect(params).not.toContain("sometime next week");
  });

  it("caches the probe instead of running it on every read", async () => {
    await getSignUpsForSession("1 October 2026", "CCAB", { fresh: true });
    const after = probeRan;
    await getSignUpsForSession("3 October 2026", "MGS", { fresh: true });
    expect(probeRan).toBe(after);
  });
});
