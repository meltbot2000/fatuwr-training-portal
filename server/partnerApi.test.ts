import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

const USER = {
  id: 7, openId: "email_x", name: "Mel", email: "mel@example.com", paymentId: "Mel",
  image: "https://pub.example/photos/a.jpg", memberStatus: "Member", clubRole: "Admin",
};

const state = {
  signups: [] as any[],
  verifyOk: true,
};

vi.mock("./db", () => {
  const chain = (rows: any[]) => {
    const p: any = Promise.resolve(rows);
    p.where = () => chain(rows);
    p.limit = () => Promise.resolve(rows);
    return p;
  };
  return {
    getDb: async () => ({ select: () => ({ from: () => chain([USER]) }) }),
    getUserByEmail: async (e: string) => (e === USER.email ? USER : undefined),
    createOtp: vi.fn(async () => {}),
    verifyOtp: vi.fn(async () => state.verifyOk),
  };
});
vi.mock("./email", () => ({ generateOtp: () => "123456", sendOtpEmail: vi.fn(async () => true) }));
vi.mock("./googleSheets", () => ({
  getAllSignupsByEmail: vi.fn(async () => state.signups),
  isPastSignupCutoff: () => true,
  getSessions: vi.fn(async () => [
    { rowId: "r1", trainingDate: "2026-10-04", trainingTime: "7:45 PM", day: "Sunday", pool: "CCAB", isClosed: "Closed", rainOff: "" },
  ]),
}));

const { createPartnerApiRouter } = await import("./partnerApi");

let server: Server;
let base = "";
let key = "secret-key";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createPartnerApiRouter(() => key));
  server = app.listen(0);
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});
afterAll(() => server.close());
beforeEach(() => {
  key = "secret-key";
  state.signups = [];
  state.verifyOk = true;
});

const get = (path: string, k: string | null = "secret-key") =>
  fetch(base + path, { headers: k ? { Authorization: `Bearer ${k}` } : {} });
const post = (path: string, body: unknown) =>
  fetch(base + path, { method: "POST", headers: { Authorization: "Bearer secret-key", "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("partner API auth", () => {
  it("is disabled (503) when no key is configured", async () => {
    key = "";
    expect((await get("/")).status).toBe(503);
  });
  it("rejects missing and wrong keys", async () => {
    expect((await get("/", null)).status).toBe(401);
    expect((await get("/", "nope")).status).toBe(401);
    expect((await get("/")).status).toBe(200);
  });
});

describe("members", () => {
  it("never returns email or paymentId", async () => {
    const res = await get("/members/7");
    const body = await res.json();
    expect(body.member).toEqual({ id: 7, name: "Mel", image: USER.image, memberStatus: "Member", clubRole: "Admin" });
    expect(JSON.stringify(body)).not.toContain("example.com");
  });
  it("requires a search term or ids", async () => {
    expect((await get("/members")).status).toBe(400);
  });
});

describe("trainings", () => {
  it("returns attendance without fees", async () => {
    state.signups = [{ id: 11, pool: "CCAB", dateOfTraining: "2026-10-04", activity: "Regular Training", actualFees: 13 }];
    const body = await (await get("/members/7/trainings")).json();
    expect(body.records).toHaveLength(1);
    expect(body.records[0].signupId).toBe(11);
    // Exact field list — a fee/amount field can't sneak in. (A text search for "13"
    // was flaky: generatedAt is a timestamp and can contain it.)
    expect(Object.keys(body.records[0]).sort()).toEqual(
      ["activity", "date", "day", "pool", "rainOff", "sessionId", "signupId", "trainingTime"]);
    expect(JSON.stringify(body)).not.toMatch(/fee/i);
  });
  it("refuses (503) when sign-ups came from the stale Sheet fallback", async () => {
    state.signups = [{ pool: "CCAB", dateOfTraining: "2026-10-04", activity: "Regular Training" }];
    expect((await get("/members/7/trainings")).status).toBe(503);
  });
  it("validates dates", async () => {
    expect((await get("/members/7/trainings?from=04/10/2026")).status).toBe(400);
  });
});

describe("login relay", () => {
  it("will not send a code to an email with no portal account", async () => {
    expect((await post("/auth/otp/send", { email: "stranger@example.com" })).status).toBe(404);
  });
  it("sends a code to a portal member", async () => {
    expect((await post("/auth/otp/send", { email: "MEL@example.com" })).status).toBe(200);
  });
  it("verifies and returns the member", async () => {
    const body = await (await post("/auth/otp/verify", { email: "mel@example.com", code: "123456" })).json();
    expect(body.member.id).toBe(7);
  });
  it("rejects a wrong code", async () => {
    state.verifyOk = false;
    expect((await post("/auth/otp/verify", { email: "mel@example.com", code: "000000" })).status).toBe(401);
  });
});
