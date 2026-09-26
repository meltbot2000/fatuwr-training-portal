import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// Mock Google Sheets module
vi.mock("./googleSheets", () => ({
  getUpcomingSessions: vi.fn().mockResolvedValue([
    {
      rowIndex: 2,
      trainingDate: "31 March 2026",
      day: "Tuesday",
      trainingTime: "7:45 PM",
      pool: "MGS",
      poolImageUrl: "https://drive.google.com/open?id=abc123",
      memberFee: 10,
      nonMemberFee: 17,
      memberSwimFee: 5,
      nonMemberSwimFee: 10,
      studentFee: 10,
      studentSwimFee: 5,
      trainerFee: 0,
      notes: "",
      rowId: "row-1",
      attendance: 5,
      isClosed: "",
      trainingObjective: "Endurance",
      signUpCloseTime: "",
    },
  ]),
  getSessions: vi.fn().mockResolvedValue([
    {
      rowIndex: 2,
      trainingDate: "31 March 2026",
      day: "Tuesday",
      trainingTime: "7:45 PM",
      pool: "MGS",
      poolImageUrl: "https://drive.google.com/open?id=abc123",
      memberFee: 10,
      nonMemberFee: 17,
      memberSwimFee: 5,
      nonMemberSwimFee: 10,
      studentFee: 10,
      studentSwimFee: 5,
      trainerFee: 0,
      notes: "",
      rowId: "row-1",
      attendance: 5,
      isClosed: "",
      trainingObjective: "Endurance",
      signUpCloseTime: "",
    },
  ]),
  // Shaped like a real row: every field the resolver reads is present, and email is
  // always a string (the DB mapper and the Sheets fallback both coalesce null -> "").
  getSignUpsForSession: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "John",
      email: "john@example.com",
      paymentId: "john",
      activity: "Regular Training",
      memberOnTrainingDate: "Member",
      baseFee: 10,
      actualFees: 10,
    },
  ]),
  findUserByEmail: vi.fn().mockResolvedValue(null),
  convertDriveUrl: vi.fn().mockImplementation((url: string) => {
    const match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
    return url;
  }),
  clearSessionsCache: vi.fn(),
}));

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "email_test123",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "email",
      role: "user",
      memberStatus: "Non-Member",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("sessions.list", () => {
  it("returns upcoming sessions with converted image URLs", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const sessions = await caller.sessions.list();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].trainingDate).toBe("31 March 2026");
    expect(sessions[0].pool).toBe("MGS");
    // The list ships only what the card renders — fees come from sessions.detail.
    expect(sessions[0].poolImageUrl).toBe("https://drive.google.com/thumbnail?id=abc123&sz=w800");
    expect((sessions[0] as any).memberFee).toBeUndefined();
  });
});

describe("sessions.detail", () => {
  it("returns session detail with signups to a signed-in member", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const detail = await caller.sessions.detail({ rowId: "row-1" });

    expect(detail.trainingDate).toBe("31 March 2026");
    expect(detail.pool).toBe("MGS");
    expect(detail.signups).toHaveLength(1);
    expect(detail.signups[0].name).toBe("John");
  });

  it("withholds the roster from a signed-out visitor but still reports the count", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const detail = await caller.sessions.detail({ rowId: "row-1" });

    expect(detail.signups).toEqual([]);
    expect(detail.signupCount).toBe(1);
  });

  it("throws NOT_FOUND for invalid rowId", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.sessions.detail({ rowId: "nonexistent" })).rejects.toThrow();
  });
});

describe("sessions.refresh", () => {
  it("clears the sessions cache", async () => {
    // refresh is protected now — an anonymous caller must not be able to bust the caches
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.sessions.refresh();

    expect(result.success).toBe(true);
  });
});

describe("auth.me", () => {
  it("returns null for unauthenticated user", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();

    expect(result).toBeNull();
  });

  it("returns user for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();

    expect(result).not.toBeNull();
    expect(result?.email).toBe("test@example.com");
    expect(result?.name).toBe("Test User");
  });
});

describe("auth.logout", () => {
  it("clears the session cookie", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(ctx.res.clearCookie).toHaveBeenCalledWith(
      COOKIE_NAME,
      expect.objectContaining({ maxAge: -1 })
    );
  });
});

describe("profile.get", () => {
  it("returns profile for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const profile = await caller.profile.get();

    expect(profile.email).toBe("test@example.com");
    expect(profile.name).toBe("Test User");
    expect(profile.memberStatus).toBe("Non-Member");
  });

  it("throws for unauthenticated user", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.profile.get()).rejects.toThrow();
  });
});
