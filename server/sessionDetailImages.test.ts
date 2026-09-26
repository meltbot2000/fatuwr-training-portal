import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

/**
 * Profile images on sessions.detail. This lookup used to read every row of sheet_users
 * and users on every session open; it now asks only for this session's attendees. The
 * things that must not regress:
 *   - users.image wins over sheetUsers.image (several sheetUsers rows hold dead Glide
 *     URLs; reversing the precedence silently reverts those members' photos)
 *   - a blank email never becomes a lookup key (196 sign-up rows have email '', and a
 *     blank key would hand one person's photo to all of them)
 *   - each person gets THEIR OWN image — never a neighbour's
 */

const SESSION = {
  rowIndex: 2, trainingDate: "1 October 2026", day: "Thursday", trainingTime: "7:45 PM",
  pool: "CCAB", poolImageUrl: "", memberFee: 13, nonMemberFee: 17, memberSwimFee: 6.5,
  nonMemberSwimFee: 8.5, studentFee: 10, studentSwimFee: 5, trainerFee: 0, notes: "",
  rowId: "row-1", attendance: 0, isClosed: "", trainingObjective: "", signUpCloseTime: "",
  venueCost: 100, revenue: 0, rainOff: "",
};

let signups: any[] = [];

vi.mock("./googleSheets", () => ({
  getSessions: vi.fn(async () => [SESSION]),
  getUpcomingSessions: vi.fn(async () => []),
  getSignUpsForSession: vi.fn(async () => signups),
  getAllSignupsByEmail: vi.fn(async () => []),
  getPayments: vi.fn(async () => []),
  getUsers: vi.fn(async () => []),
  findUserByEmail: vi.fn(async () => null),
  convertDriveUrl: vi.fn((u: string) => u),
  clearSessionsCache: vi.fn(),
  clearPaymentsCache: vi.fn(),
}));

// Rows keyed by which table the resolver asked for. The two queries are told apart by
// their selected columns: sheet_users asks for userEmail as well, users does not.
const SHEET_USER_ROWS = [
  { email: "ann@example.com", userEmail: "ann@example.com", image: "https://dead-glide/ann.jpg" },
  { email: "bob-old@example.com", userEmail: "bob@example.com", image: "https://dead-glide/bob.jpg" },
];
const USER_ROWS = [
  { email: "ann@example.com", image: "https://r2/ann-live.jpg" },
];

const imageQueries: { table: string; hasWhere: boolean }[] = [];

function chain(rows: any[], rec: { table: string; hasWhere: boolean }): any {
  const p = Promise.resolve(rows);
  return {
    then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p),
    where: () => { rec.hasWhere = true; return chain(rows, rec); },
    limit: (n: number) => chain(rows.slice(0, n), rec),
  };
}

const fakeDb = {
  select: (cols?: Record<string, unknown>) => ({
    from: () => {
      const keys = cols ? Object.keys(cols) : [];
      const table = keys.includes("userEmail") ? "sheet_users" : keys.includes("image") ? "users" : "other";
      const rec = { table, hasWhere: false };
      if (table !== "other") imageQueries.push(rec);
      return chain(table === "sheet_users" ? SHEET_USER_ROWS : table === "users" ? USER_ROWS : [], rec);
    },
  }),
};

vi.mock("./db", () => ({ getDb: vi.fn(async () => fakeDb), upsertUser: vi.fn() }));

const { appRouter } = await import("./routers");

function publicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

const signup = (name: string, email: string) => ({
  id: 1, name, email, paymentId: "x", activity: "Regular Training",
  memberOnTrainingDate: "Member", baseFee: 13, actualFees: 13,
});

beforeEach(() => { imageQueries.length = 0; signups = []; });

describe("sessions.detail profile images", () => {
  it("prefers users.image over the legacy sheet_users image", async () => {
    signups = [signup("Ann", "ann@example.com")];
    const detail = await appRouter.createCaller(publicContext()).sessions.detail({ rowId: "row-1" });
    expect(detail.signups[0].image).toBe("https://r2/ann-live.jpg");
  });

  it("finds an image via sheet_users.userEmail when the primary email differs", async () => {
    signups = [signup("Bob", "bob@example.com")];
    const detail = await appRouter.createCaller(publicContext()).sessions.detail({ rowId: "row-1" });
    expect(detail.signups[0].image).toBe("https://dead-glide/bob.jpg");
  });

  it("asks only for this session's attendees, never the whole table", async () => {
    signups = [signup("Ann", "ann@example.com")];
    await appRouter.createCaller(publicContext()).sessions.detail({ rowId: "row-1" });
    expect(imageQueries.length).toBe(2);
    expect(imageQueries.every(q => q.hasWhere)).toBe(true);
  });

  it("makes no image query at all for a session with no sign-ups", async () => {
    signups = [];
    const detail = await appRouter.createCaller(publicContext()).sessions.detail({ rowId: "row-1" });
    expect(detail.signups).toEqual([]);
    expect(imageQueries).toEqual([]);
  });

  it("gives a blank-email attendee no image, and never someone else's", async () => {
    signups = [signup("Ann", "ann@example.com"), signup("Walk-in", "")];
    const detail = await appRouter.createCaller(publicContext()).sessions.detail({ rowId: "row-1" });
    const byName = Object.fromEntries(detail.signups.map(s => [s.name, s.image]));
    expect(byName["Walk-in"]).toBe("");
    expect(byName["Ann"]).toBe("https://r2/ann-live.jpg");
  });

  it("keeps each attendee's own image", async () => {
    signups = [signup("Ann", "ann@example.com"), signup("Bob", "bob@example.com")];
    const detail = await appRouter.createCaller(publicContext()).sessions.detail({ rowId: "row-1" });
    const byName = Object.fromEntries(detail.signups.map(s => [s.name, s.image]));
    expect(byName["Ann"]).toBe("https://r2/ann-live.jpg");
    expect(byName["Bob"]).toBe("https://dead-glide/bob.jpg");
  });
});
