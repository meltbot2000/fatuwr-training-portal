import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// Sessions come from the DB-backed getSessions(); attendance on these rows is
// the stale sheet_sessions.attendance column the Data tab used to display.
const SESSION_ROWS = [
  // App-created session: attendance column frozen at 0 since the day it was made.
  { rowIndex: 200, trainingDate: "2026-08-16", day: "Sunday", pool: "CCAB", rowId: "row-a", attendance: 0, venueCost: 100, isClosed: "", trainingTime: "7:45 PM", poolImageUrl: "", memberFee: 10, nonMemberFee: 17, memberSwimFee: 5, nonMemberSwimFee: 10, studentFee: 10, studentSwimFee: 5, trainerFee: 0, notes: "", trainingObjective: "", signUpCloseTime: "", revenue: 0, rainOff: "" },
  // Seeded legacy session: attendance frozen at the count on seeding day.
  { rowIndex: 30, trainingDate: "1 March 2026", day: "Sunday", pool: "CCAB", rowId: "row-b", attendance: 21, venueCost: 100, isClosed: "", trainingTime: "7:45 PM", poolImageUrl: "", memberFee: 10, nonMemberFee: 17, memberSwimFee: 5, nonMemberSwimFee: 10, studentFee: 10, studentSwimFee: 5, trainerFee: 0, notes: "", trainingObjective: "", signUpCloseTime: "", revenue: 0, rainOff: "" },
  // Future session with no sign-ups yet.
  { rowIndex: 300, trainingDate: "2026-12-31", day: "Thursday", pool: "MGS", rowId: "row-c", attendance: 0, venueCost: 100, isClosed: "", trainingTime: "7:45 PM", poolImageUrl: "", memberFee: 10, nonMemberFee: 17, memberSwimFee: 5, nonMemberSwimFee: 10, studentFee: 10, studentSwimFee: 5, trainerFee: 0, notes: "", trainingObjective: "", signUpCloseTime: "", revenue: 0, rainOff: "" },
];

const SIGNUP_ROWS = [
  { dateOfTraining: "2026-08-16", pool: "CCAB", actualFees: 10 },
  { dateOfTraining: "2026-08-16", pool: "CCAB", actualFees: 17 },
  { dateOfTraining: "2026-08-16", pool: "CCAB", actualFees: 5 },
  // Legacy session, stored as "1 March 2026" — three sign-ups now, snapshot said 21.
  { dateOfTraining: "2026-03-01", pool: "CCAB", actualFees: 10 },
  { dateOfTraining: "2026-03-01", pool: "CCAB", actualFees: 10 },
  // Membership / trial rows: no training date, no pool. Must not be counted
  // against any session.
  { dateOfTraining: "", pool: "", actualFees: 80 },
  { dateOfTraining: "", pool: "", actualFees: 10 },
  // Different pool, same date — belongs to no session in this fixture.
  { dateOfTraining: "2026-08-16", pool: "MGS", actualFees: 17 },
];

vi.mock("./googleSheets", () => ({
  getSessions: vi.fn().mockResolvedValue(SESSION_ROWS),
  getUpcomingSessions: vi.fn().mockResolvedValue([]),
  getSignUpsForSession: vi.fn().mockResolvedValue([]),
  findUserByEmail: vi.fn().mockResolvedValue(null),
  convertDriveUrl: vi.fn().mockImplementation((u: string) => u),
  clearSessionsCache: vi.fn(),
  getUsers: vi.fn().mockResolvedValue([]),
  getPayments: vi.fn().mockResolvedValue([]),
  getAllSignupsByEmail: vi.fn().mockResolvedValue([]),
  fetchResourcesTab: vi.fn().mockResolvedValue([]),
}));

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: () => ({ from: async () => SIGNUP_ROWS }),
  }),
  upsertUser: vi.fn(),
}));

const { appRouter } = await import("./routers");

function adminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "email_admin",
      email: "admin@example.com",
      name: "Admin",
      loginMethod: "email",
      role: "user",
      memberStatus: "Member",
      clubRole: "Admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

describe("admin.allSessions — attendance", () => {
  it("derives attendance from sign-ups, not the stale sheet column", async () => {
    const caller = appRouter.createCaller(adminContext());
    const sessions = await caller.admin.allSessions();
    const byId = Object.fromEntries(sessions.map(s => [s.rowId, s]));

    // App-created session: stale column says 0, three people actually signed up.
    expect(byId["row-a"].attendance).toBe(3);
    expect(byId["row-a"].revenue).toBe(32);

    // Legacy session: stale snapshot said 21, live count is 2. Matched despite
    // the "1 March 2026" free-text date format.
    expect(byId["row-b"].attendance).toBe(2);
    expect(byId["row-b"].revenue).toBe(20);

    // No sign-ups yet — genuinely zero.
    expect(byId["row-c"].attendance).toBe(0);
    expect(byId["row-c"].revenue).toBe(0);
  });

  it("never counts membership or trial rows against a session", async () => {
    const caller = appRouter.createCaller(adminContext());
    const sessions = await caller.admin.allSessions();
    const total = sessions.reduce((n, s) => n + s.attendance, 0);
    // 3 + 2 + 0 — the two membership rows and the wrong-pool row are excluded.
    expect(total).toBe(5);
  });
});
