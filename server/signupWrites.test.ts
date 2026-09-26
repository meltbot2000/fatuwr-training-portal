import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

/**
 * Which sign-up mutations may create a row, and which may only change one.
 *
 * Editing your own sign-up must NEVER insert: a second row for the same session
 * bills the member twice. On 2026-09-26 an admin ended up with two rows for one
 * session ($9 Regular Training + $4.50 Swims only), so these tests pin down the
 * write each mutation performs.
 */

// ── Fake drizzle query builder ────────────────────────────────────────────────
// Records every write so a test can assert on it. `select()` results are
// awaitable directly and after `.where()`, matching how routers.ts reads.
type Write =
  | { kind: "update"; table: string; values: Record<string, any> }
  | { kind: "insert"; table: string; values: any }
  | { kind: "delete"; table: string };

const writes: Write[] = [];
let selectRows: any[] = [];

function rowsResult(rows: any[]): any {
  const p = Promise.resolve(rows);
  return {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
    where: () => rowsResult(rows),
    innerJoin: () => rowsResult(rows),
  };
}

const fakeDb = {
  select: () => ({ from: () => rowsResult(selectRows) }),
  update: (table: any) => ({
    set: (values: Record<string, any>) => ({
      where: async () => { writes.push({ kind: "update", table: String(table), values }); },
    }),
  }),
  insert: (table: any) => ({
    values: async (values: any) => { writes.push({ kind: "insert", table: String(table), values }); },
  }),
  delete: (table: any) => ({
    where: async () => { writes.push({ kind: "delete", table: String(table) }); },
  }),
};

const MY_EMAIL = "member@example.com";

// The row being edited, as stored in the DB.
const EXISTING_ROW = {
  id: 4242,
  name: "Member Example",
  email: MY_EMAIL,
  paymentId: "mem",
  pool: "Queenstown",
  dateOfTraining: "2026-10-04",
  activity: "Regular Training",
  baseFee: 9,
  actualFees: 9,
  memberOnTrainingDate: "Member",
};

const getSignUpsForSession = vi.fn().mockResolvedValue([]);

vi.mock("./googleSheets", () => ({
  getUpcomingSessions: vi.fn().mockResolvedValue([]),
  getSessions: vi.fn().mockResolvedValue([]),
  getSignUpsForSession: (...args: any[]) => getSignUpsForSession(...args),
  getAllSignupsByEmail: vi.fn().mockResolvedValue([]),
  getPayments: vi.fn().mockResolvedValue([]),
  getUsers: vi.fn().mockResolvedValue([]),
  findUserByEmail: vi.fn().mockResolvedValue(null),
  convertDriveUrl: vi.fn().mockImplementation((u: string) => u),
  clearSessionsCache: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: vi.fn(async () => fakeDb),
  upsertUser: vi.fn(),
}));

const { appRouter } = await import("./routers");

function context(clubRole?: string): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "email_member",
      email: MY_EMAIL,
      name: "Member Example",
      paymentId: "mem",
      loginMethod: "email",
      role: "user",
      memberStatus: "Member",
      ...(clubRole ? { clubRole } : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

const editInput = {
  rowId: EXISTING_ROW.id,
  sessionDate: "4 October 2026",
  sessionPool: "Queenstown",
  activity: "Swims only",
  baseFee: 4.5,
  actualFee: 4.5,
};

beforeEach(() => {
  writes.length = 0;
  selectRows = [EXISTING_ROW];
  getSignUpsForSession.mockResolvedValue([]);
});

describe("signups.edit", () => {
  it("changes the activity on the existing row and inserts nothing", async () => {
    await appRouter.createCaller(context()).signups.edit(editInput);

    expect(writes.filter(w => w.kind === "insert")).toEqual([]);
    expect(writes).toHaveLength(1);
    const [write] = writes;
    expect(write.kind).toBe("update");
    expect((write as any).values).toMatchObject({
      activity: "Swims only",
      baseFee: 4.5,
      actualFees: 4.5,
    });
  });

  it("inserts nothing when an admin edits, either", async () => {
    await appRouter.createCaller(context("Admin")).signups.edit({
      ...editInput,
      targetEmail: MY_EMAIL,
      name: "Member Example",
      memberOnTrainingDate: "Member",
      paymentId: "mem",
    });

    expect(writes.filter(w => w.kind === "insert")).toEqual([]);
    expect(writes.filter(w => w.kind === "update")).toHaveLength(1);
  });

  it("refuses to touch a row that belongs to someone else", async () => {
    selectRows = [{ ...EXISTING_ROW, email: "someone.else@example.com" }];

    await expect(
      appRouter.createCaller(context()).signups.edit(editInput)
    ).rejects.toThrow(/does not belong/i);
    expect(writes).toEqual([]);
  });
});

describe("signups.submit", () => {
  it("rejects a second sign-up for a session the member is already in", async () => {
    getSignUpsForSession.mockResolvedValue([{ ...EXISTING_ROW }]);

    await expect(
      appRouter.createCaller(context()).signups.submit({
        sessionRowId: "row-112",
        sessionDate: "4 October 2026",
        sessionPool: "Queenstown",
        name: "Member Example",
        activity: "Swims only",
        fee: 4.5,
        memberOnTrainingDate: "Member",
      })
    ).rejects.toThrow(/already signed up/i);
    expect(writes).toEqual([]);
  });

  // Regression, 2026-09-26: admins were exempt from the duplicate check, so
  // re-submitting the form added a second row instead of being refused.
  it("rejects the duplicate for admins too", async () => {
    getSignUpsForSession.mockResolvedValue([{ ...EXISTING_ROW }]);

    await expect(
      appRouter.createCaller(context("Admin")).signups.submit({
        sessionRowId: "row-112",
        sessionDate: "4 October 2026",
        sessionPool: "Queenstown",
        name: "Member Example",
        activity: "Swims only",
        fee: 4.5,
        memberOnTrainingDate: "Member",
      })
    ).rejects.toThrow(/already signed up/i);
    expect(writes).toEqual([]);
  });

  it("still inserts a first sign-up", async () => {
    await appRouter.createCaller(context()).signups.submit({
      sessionRowId: "row-112",
      sessionDate: "4 October 2026",
      sessionPool: "Queenstown",
      name: "Member Example",
      activity: "Swims only",
      fee: 4.5,
      memberOnTrainingDate: "Member",
    });

    const inserts = writes.filter(w => w.kind === "insert");
    expect(inserts).toHaveLength(1);
    expect((inserts[0] as any).values).toMatchObject({
      email: MY_EMAIL,
      activity: "Swims only",
      actualFees: 4.5,
      dateOfTraining: "2026-10-04",
    });
  });
});

// admin.addSignup is the patching route: it exists precisely so an admin CAN add a
// row that duplicates an existing one (fixing up attendance after the fact).
describe("admin.addSignup", () => {
  it("adds a row even when that person is already signed up", async () => {
    selectRows = [{ rowId: "row-112", trainingDate: "2026-10-04", pool: "Queenstown" }];
    getSignUpsForSession.mockResolvedValue([{ ...EXISTING_ROW }]);

    await appRouter.createCaller(context("Admin")).admin.addSignup({
      rowId: "row-112",
      name: "Member Example",
      email: MY_EMAIL,
      paymentId: "mem",
      activity: "Swims only",
      actualFees: 4.5,
      memberOnTrainingDate: "Member",
    });

    const inserts = writes.filter(w => w.kind === "insert");
    expect(inserts).toHaveLength(1);
    expect((inserts[0] as any).values).toMatchObject({ activity: "Swims only", actualFees: 4.5 });
  });
});
