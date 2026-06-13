import { describe, expect, it, vi } from "vitest";
import { generatePaymentId, appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Unit tests for generatePaymentId ────────────────────────────────────────

describe("generatePaymentId", () => {
  it("returns first name when not taken", () => {
    expect(generatePaymentId("John Doe", new Set())).toBe("john");
  });

  it("returns first name + last initial when first name is taken", () => {
    expect(generatePaymentId("John Doe", new Set(["john"]))).toBe("johnd");
  });

  it("returns first name + full last name when initial is also taken", () => {
    expect(generatePaymentId("John Doe", new Set(["john", "johnd"]))).toBe("johndoe");
  });

  it("appends a number when both first name and full name are taken", () => {
    const taken = new Set(["john", "johnd", "johndoe"]);
    expect(generatePaymentId("John Doe", taken)).toBe("johndoe1");
  });

  it("increments the number until a slot is free", () => {
    const taken = new Set(["john", "johnd", "johndoe", "johndoe1", "johndoe2"]);
    expect(generatePaymentId("John Doe", taken)).toBe("johndoe3");
  });

  it("strips non-alpha characters from the name", () => {
    expect(generatePaymentId("O'Brien123 Smith!", new Set())).toBe("obrien");
  });

  it("falls back to 'user' for a blank name", () => {
    expect(generatePaymentId("", new Set())).toBe("user");
  });

  it("handles single-word names with no last name", () => {
    expect(generatePaymentId("Samuel", new Set())).toBe("samuel");
  });

  it("appends a number for single-word names when first name is taken", () => {
    expect(generatePaymentId("Samuel", new Set(["samuel"]))).toBe("samuel1");
  });
});

// ─── Integration test: bug fix (users table vs sheetUsers table) ──────────────
//
// The bug: getUsers() reads sheetUsers (Google Sheets mirror). Portal-native users
// are only written to the users table. A second signup with the same first name
// received a duplicate paymentId because the first user wasn't in sheetUsers.
//
// Fix: getExistingPaymentIds() now also queries the users table; both sources
// are unioned before calling generatePaymentId.

vi.mock("./googleSheets", () => ({
  getUpcomingSessions: vi.fn().mockResolvedValue([]),
  getSessions: vi.fn().mockResolvedValue([]),
  getSignUpsForSession: vi.fn().mockResolvedValue([]),
  findUserByEmail: vi.fn().mockResolvedValue(null),
  convertDriveUrl: vi.fn().mockImplementation((url: string) => url),
  clearSessionsCache: vi.fn(),
  getUsers: vi.fn().mockResolvedValue([]),   // sheetUsers: Samuel NOT here
  getPayments: vi.fn().mockResolvedValue([]),
  getAllSignupsByEmail: vi.fn().mockResolvedValue([]),
}));

vi.mock("./db", () => ({
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(null),
  getUserByEmail: vi.fn().mockResolvedValue(null),
  getDb: vi.fn().mockResolvedValue(null),
  getExistingPaymentIds: vi.fn().mockResolvedValue(["samuel"]), // Samuel IS in users table
  createOtp: vi.fn().mockResolvedValue(undefined),
  getLatestOtp: vi.fn().mockResolvedValue(null),
  verifyOtp: vi.fn().mockResolvedValue(false),
}));

import * as dbModule from "./db";
import * as googleSheetsModule from "./googleSheets";

function makeAuthCtx(overrides: Partial<NonNullable<TrpcContext["user"]>> = {}): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "email_newuser",
      email: "newsamuel@example.com",
      name: "New User",
      loginMethod: "email",
      role: "user",
      memberStatus: "Non-Member",
      paymentId: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...overrides,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("auth.completeProfile — paymentId uniqueness across both tables", () => {
  it("does not assign 'samuel' when it already exists only in the users table", async () => {
    vi.mocked(googleSheetsModule.getUsers).mockResolvedValue([]);
    vi.mocked(dbModule.getExistingPaymentIds).mockResolvedValue(["samuel"]);

    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.auth.completeProfile({ name: "Samuel" });

    expect(result.success).toBe(true);
    expect(result.paymentId).not.toBe("samuel");
  });

  it("assigns 'samuel' when it is not present in either table", async () => {
    vi.mocked(googleSheetsModule.getUsers).mockResolvedValue([]);
    vi.mocked(dbModule.getExistingPaymentIds).mockResolvedValue([]);

    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.auth.completeProfile({ name: "Samuel" });

    expect(result.paymentId).toBe("samuel");
  });

  it("does not treat the current user's own paymentId as a conflict", async () => {
    // User already holds "samuel" from their initial email-derived slug;
    // completing their profile as "Samuel" should keep the same ID.
    vi.mocked(googleSheetsModule.getUsers).mockResolvedValue([]);
    vi.mocked(dbModule.getExistingPaymentIds).mockResolvedValue(["samuel"]);

    const caller = appRouter.createCaller(makeAuthCtx({ paymentId: "samuel" }));
    const result = await caller.auth.completeProfile({ name: "Samuel" });

    expect(result.paymentId).toBe("samuel");
  });
});
