/**
 * Partner API v1 — a small, versioned REST surface for trusted companion apps (first
 * consumer: the workout-log app in /workout-log). Mounted at /api/v1.
 *
 * Why REST and not tRPC: the consumer is a separate service with its own codebase. A
 * plain JSON contract (documented in workout-log/API.md) means it never has to import
 * this app's router types, and this app can change its tRPC internals freely.
 *
 * Auth: every request needs `Authorization: Bearer <WORKOUT_LOG_API_KEY>`. This is a
 * SERVER-TO-SERVER key — it must never reach a browser. If the env var is unset the
 * whole API answers 503, so it is off by default.
 *
 * Data rules:
 *   - Read-only except for OTP codes. Nothing here writes sign-ups, users or payments.
 *   - No money. Fees, balances and payments are never returned.
 *   - No emails or paymentIds in member listings — only what a dashboard shows.
 *   - Login never creates a portal account: unknown emails get 404 no_portal_account.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { eq, inArray, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { users } from "../drizzle/schema";
import * as db from "./db";
import { generateOtp, sendOtpEmail } from "./email";
import { checkSendRateLimit, checkVerifyRateLimit, recordVerifyAttempt } from "./otpRateLimit";
import { getAllSignupsByEmail, getSessions, isPastSignupCutoff } from "./googleSheets";
import { deriveTrainingRecords } from "./trainingRecords";

export const API_VERSION = "1";

type DbUser = typeof users.$inferSelect;

export interface PartnerMember {
  id: number;
  name: string;
  image: string | null;
  memberStatus: string;
  clubRole: string;
}

export function toPartnerMember(u: Pick<DbUser, "id" | "name" | "image" | "memberStatus" | "clubRole">): PartnerMember {
  const image = (u.image || "").trim();
  return {
    id: u.id,
    name: (u.name || "").trim(),
    // Only real URLs. Legacy rows can hold a base64 data URL (MEDIUMTEXT) — megabytes
    // that no dashboard should be shipped.
    image: /^https?:\/\//.test(image) ? image : null,
    memberStatus: u.memberStatus || "Non-Member",
    clubRole: u.clubRole || "",
  };
}

function keysMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireApiKey(getKey: () => string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const expected = getKey();
    if (!expected) {
      res.status(503).json({ error: "partner_api_disabled" });
      return;
    }
    const header = req.headers.authorization || "";
    const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!given || !keysMatch(given, expected)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rateLimitResponse(res: Response, e: unknown): boolean {
  if (e instanceof TRPCError && e.code === "TOO_MANY_REQUESTS") {
    res.status(429).json({ error: "rate_limited", message: e.message });
    return true;
  }
  return false;
}

async function getUserById(id: number): Promise<DbUser | undefined> {
  const d = await db.getDb();
  if (!d) throw new Error("Database unavailable");
  const [u] = await d.select().from(users).where(eq(users.id, id)).limit(1);
  return u;
}

export function createPartnerApiRouter(getKey: () => string = () => process.env.WORKOUT_LOG_API_KEY ?? ""): Router {
  const r = Router();
  r.use(requireApiKey(getKey));

  r.get("/", (_req, res) => {
    res.json({ name: "fatuwr-partner-api", version: API_VERSION });
  });

  // ── Login relay ────────────────────────────────────────────────────────────
  // The companion app has no accounts of its own: it asks the portal to email a code,
  // then asks the portal whether the code is right. Same otp_codes table, same rate
  // limits, same email template as portal login.

  r.post("/auth/otp/send", async (req, res) => {
    const email = String(req.body?.email || "").toLowerCase().trim();
    if (!EMAIL.test(email)) { res.status(400).json({ error: "invalid_email" }); return; }
    try {
      const user = await db.getUserByEmail(email);
      if (!user) { res.status(404).json({ error: "no_portal_account" }); return; }
      checkSendRateLimit(email);
      const code = generateOtp();
      const expiresAt = new Date(Math.floor((Date.now() + 10 * 60 * 1000) / 1000) * 1000);
      await db.createOtp(email, code, expiresAt);
      await sendOtpEmail(email, code);
      res.json({ ok: true });
    } catch (e: any) {
      if (rateLimitResponse(res, e)) return;
      console.error("[PartnerAPI] otp/send failed:", e?.message);
      res.status(500).json({ error: "internal" });
    }
  });

  r.post("/auth/otp/verify", async (req, res) => {
    const email = String(req.body?.email || "").toLowerCase().trim();
    const code = String(req.body?.code || "").trim();
    if (!EMAIL.test(email) || !/^\d{6}$/.test(code)) { res.status(400).json({ error: "invalid_input" }); return; }
    try {
      checkVerifyRateLimit(email);
      const ok = await db.verifyOtp(email, code);
      recordVerifyAttempt(email, ok);
      if (!ok) { res.status(401).json({ error: "invalid_code" }); return; }
      const user = await db.getUserByEmail(email);
      if (!user) { res.status(404).json({ error: "no_portal_account" }); return; }
      res.json({ member: toPartnerMember(user) });
    } catch (e: any) {
      if (rateLimitResponse(res, e)) return;
      console.error("[PartnerAPI] otp/verify failed:", e?.message);
      res.status(500).json({ error: "internal" });
    }
  });

  // ── Members ────────────────────────────────────────────────────────────────

  // GET /members?q=<name substring>   — search (for picking a squad), max 25
  // GET /members?ids=1,2,3            — bulk profile refresh, max 200
  r.get("/members", async (req, res) => {
    try {
      const d = await db.getDb();
      if (!d) { res.status(503).json({ error: "db_unavailable" }); return; }
      const cols = { id: users.id, name: users.name, image: users.image, memberStatus: users.memberStatus, clubRole: users.clubRole };
      const idsParam = String(req.query.ids || "").trim();
      const q = String(req.query.q || "").trim();
      let rows;
      if (idsParam) {
        const ids = idsParam.split(",").map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 200);
        rows = ids.length ? await d.select(cols).from(users).where(inArray(users.id, ids)) : [];
      } else if (q.length >= 2) {
        rows = await d.select(cols).from(users).where(like(users.name, `%${q.replace(/[%_\\]/g, "\\$&")}%`)).limit(25);
      } else {
        res.status(400).json({ error: "q_or_ids_required" });
        return;
      }
      res.json({ members: rows.map(toPartnerMember) });
    } catch (e: any) {
      console.error("[PartnerAPI] members failed:", e?.message);
      res.status(500).json({ error: "internal" });
    }
  });

  r.get("/members/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
    try {
      const u = await getUserById(id);
      if (!u) { res.status(404).json({ error: "not_found" }); return; }
      res.json({ member: toPartnerMember(u) });
    } catch (e: any) {
      console.error("[PartnerAPI] member failed:", e?.message);
      res.status(500).json({ error: "internal" });
    }
  });

  // GET /members/:id/trainings?from=YYYY-MM-DD&to=YYYY-MM-DD
  // Regular-training attendance, derived live (see server/trainingRecords.ts for rules).
  r.get("/members/:id/trainings", async (req, res) => {
    const id = Number(req.params.id);
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
    if ((from && !ISO.test(from)) || (to && !ISO.test(to))) { res.status(400).json({ error: "invalid_date" }); return; }
    try {
      const u = await getUserById(id);
      if (!u) { res.status(404).json({ error: "not_found" }); return; }
      const now = Date.now();
      const [signups, sessions] = await Promise.all([
        // paymentId-primary attribution (SYSTEM.md §8) — same helper the portal's own
        // history screens use, so the two apps can never disagree about ownership.
        u.email ? getAllSignupsByEmail(u.email, undefined, u.paymentId || "") : Promise.resolve([]),
        getSessions(),
      ]);
      // A row without an id came from the Sheets fallback, i.e. the DB read failed — and
      // the Sheet is stale for sign-ups (CLAUDE.md). Refuse rather than serve it: the
      // consumer keeps its last good copy on any non-200.
      if (signups.some(s => !s.id)) {
        res.status(503).json({ error: "db_unavailable" });
        return;
      }
      const records = deriveTrainingRecords(
        signups.map(s => ({ id: s.id as number, pool: s.pool, dateOfTraining: s.dateOfTraining, activity: s.activity })),
        sessions,
        { isOver: (s) => isPastSignupCutoff(s, now), from: from || undefined, to: to || undefined },
      );
      res.json({ member: toPartnerMember(u), records, generatedAt: new Date().toISOString() });
    } catch (e: any) {
      console.error("[PartnerAPI] trainings failed:", e?.message);
      res.status(500).json({ error: "internal" });
    }
  });

  return r;
}
