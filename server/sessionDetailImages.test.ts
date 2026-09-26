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
  getUpcomingSessions: vi.fn(async () => [SESSION]),
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
    // sessions.list aggregates signup counts in SQL
    groupBy: () => chain(rows, rec),
    orderBy: () => chain(rows, rec),
    innerJoin: () => chain(rows, rec),
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

/**
 * sessions.detail is a PUBLIC procedure and its URL ships in the JS bundle, so what it
 * returns is what a stranger can read. Verified 2026-09-26 that an unauthenticated curl
 * returned 24 attendees with names, emails, paymentIds and fees plus venueCost/revenue/pnl.
 */
describe("sessions.detail redaction", () => {
  const ATTENDEES = [
    signup("Ann", "ann@example.com"),
    { ...signup("Zed", "zed@example.com"), id: 99, paymentId: "zed", actualFees: 17, memberOnTrainingDate: "Non-Member" },
  ];

  function ctxFor(user: any): TrpcContext {
    return {
      user,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
    } as unknown as TrpcContext;
  }
  const member = (email: string, clubRole?: string) => ctxFor({
    id: 1, openId: "email_x", email, name: "X", loginMethod: "email", role: "user",
    memberStatus: "Member", ...(clubRole ? { clubRole } : {}),
    createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
  });

  it("gives a signed-out visitor names only — no emails, ids, payment refs or fees", async () => {
    signups = ATTENDEES;
    const d = await appRouter.createCaller(publicContext()).sessions.detail({ rowId: "row-1" });
    expect(d.signups.map(s => s.name)).toEqual(["Ann", "Zed"]);
    for (const s of d.signups) {
      expect(s.email).toBe("");
      expect(s.paymentId).toBe("");
      expect(s.id).toBeNull();
      expect(s.actualFees).toBe(0);
      expect(s.memberOnTrainingDate).toBe("");
    }
  });

  it("hides the club's finances from a signed-out visitor", async () => {
    signups = ATTENDEES;
    const d = await appRouter.createCaller(publicContext()).sessions.detail({ rowId: "row-1" });
    expect(d.venueCost).toBeUndefined();
    expect(d.revenue).toBeUndefined();
    expect(d.pnl).toBeUndefined();
  });

  it("hides the club's finances from an ordinary signed-in member too", async () => {
    signups = ATTENDEES;
    const d = await appRouter.createCaller(member("ann@example.com")).sessions.detail({ rowId: "row-1" });
    expect(d.venueCost).toBeUndefined();
    expect(d.revenue).toBeUndefined();
  });

  it("lets a member see their OWN row in full but not anyone else's", async () => {
    signups = ATTENDEES;
    const d = await appRouter.createCaller(member("ann@example.com")).sessions.detail({ rowId: "row-1" });
    const ann = d.signups.find(s => s.name === "Ann")!;
    const zed = d.signups.find(s => s.name === "Zed")!;
    // Own row: they need id + fee to edit it, and email to recognise themselves.
    expect(ann.email).toBe("ann@example.com");
    expect(ann.id).toBe(1);
    expect(ann.actualFees).toBe(13);
    // Someone else's row: name and activity only.
    expect(zed.email).toBe("");
    expect(zed.paymentId).toBe("");
    expect(zed.actualFees).toBe(0);
    expect(zed.id).toBeNull();
  });

  it("still gives staff everything — the admin sheet and Splits depend on it", async () => {
    signups = ATTENDEES;
    for (const role of ["Admin", "Helper"]) {
      const d = await appRouter.createCaller(member("staff@example.com", role)).sessions.detail({ rowId: "row-1" });
      const zed = d.signups.find(s => s.name === "Zed")!;
      expect(zed.email).toBe("zed@example.com");
      expect(zed.paymentId).toBe("zed");
      expect(zed.actualFees).toBe(17);
      expect(zed.id).toBe(99);
      expect(d.venueCost).toBe(100);
      expect(d.revenue).toBe(30);
    }
  });

  it("keeps showing everyone's photo — the roster is meant to display those", async () => {
    signups = ATTENDEES;
    const d = await appRouter.createCaller(publicContext()).sessions.detail({ rowId: "row-1" });
    expect(d.signups.find(s => s.name === "Ann")!.image).toBe("https://r2/ann-live.jpg");
  });
});

/**
 * sessions.list is public too, and it was returning venueCost on every session. Without
 * these, deleting the redaction from the list endpoint breaks nothing in the suite.
 */
describe("sessions.list redaction", () => {
  function listCtx(user: any): TrpcContext {
    return {
      user,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
    } as unknown as TrpcContext;
  }
  const staff = (role: string) => listCtx({
    id: 1, openId: "email_s", email: "staff@example.com", name: "S", loginMethod: "email",
    role: "user", memberStatus: "Member", clubRole: role,
    createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
  });

  it("hides venueCost and revenue from a signed-out visitor", async () => {
    const list = await appRouter.createCaller(publicContext()).sessions.list();
    expect(list).toHaveLength(1);
    expect(list[0].venueCost).toBeUndefined();
    expect(list[0].revenue).toBeUndefined();
  });

  it("hides them from an ordinary signed-in member", async () => {
    const member = listCtx({
      id: 2, openId: "email_m", email: "member@example.com", name: "M", loginMethod: "email",
      role: "user", memberStatus: "Member",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    });
    const list = await appRouter.createCaller(member).sessions.list();
    expect(list[0].venueCost).toBeUndefined();
    expect(list[0].revenue).toBeUndefined();
  });

  it("still shows them to staff", async () => {
    for (const role of ["Admin", "Helper"]) {
      const list = await appRouter.createCaller(staff(role)).sessions.list();
      expect(list[0].venueCost).toBe(100);
    }
  });

  it("keeps the fields members actually need", async () => {
    const list = await appRouter.createCaller(publicContext()).sessions.list();
    expect(list[0].pool).toBe("CCAB");
    expect(list[0].memberFee).toBe(13);
    expect(list[0].trainingDate).toBe("1 October 2026");
    expect(typeof list[0].signupCount).toBe("number");
  });
});
