import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

/**
 * If a sheetUser has memberStatus "Trial" but their trialEndDate is already in
 * the past, treat them as "Non-Member" so the expiry job doesn't have to run
 * first and cause a brief incorrect state on login.
 */
function resolveSheetMemberStatus(memberStatus: string, trialEndDate: string): string {
  if (memberStatus !== "Trial") return memberStatus;
  if (!trialEndDate || trialEndDate === "NA" || trialEndDate === "N/A") return memberStatus;
  // Parse DD/MM/YYYY or YYYY-MM-DD or M/D/YYYY
  let end: Date | null = null;
  const ddmm = trialEndDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmm) { const [, d, m, y] = ddmm.map(Number); end = new Date(y, m - 1, d); }
  else { const mdy = trialEndDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (mdy) { const [, m, d, y] = mdy.map(Number); end = new Date(y, m - 1, d); } }
  if (!end) { const iso = new Date(trialEndDate); if (!isNaN(iso.getTime())) end = iso; }
  if (!end) return memberStatus;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return end < today ? "Non-Member" : memberStatus;
}

// ─── OTP rate limiter (in-memory) ────────────────────────────────────────────
// sendOtp: max 1 send per email per 60 s
// verifyOtp: max 5 failed attempts per email per 10 min, then locked
interface SendBucket { lastSent: number }
interface VerifyBucket { attempts: number; windowStart: number; locked: boolean }
const otpSendMap   = new Map<string, SendBucket>();
const otpVerifyMap = new Map<string, VerifyBucket>();
const SEND_COOLDOWN_MS    = 60_000;         // 60 s between sends
const VERIFY_WINDOW_MS    = 10 * 60_000;    // 10-minute window
const VERIFY_MAX_ATTEMPTS = 5;

function checkSendRateLimit(email: string): void {
  const now = Date.now();
  const bucket = otpSendMap.get(email);
  if (bucket && now - bucket.lastSent < SEND_COOLDOWN_MS) {
    const secsLeft = Math.ceil((SEND_COOLDOWN_MS - (now - bucket.lastSent)) / 1000);
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Please wait ${secsLeft}s before requesting another code.` });
  }
  otpSendMap.set(email, { lastSent: now });
}

function recordVerifyAttempt(email: string, success: boolean): void {
  const now = Date.now();
  let bucket = otpVerifyMap.get(email);
  if (!bucket || now - bucket.windowStart > VERIFY_WINDOW_MS) {
    bucket = { attempts: 0, windowStart: now, locked: false };
  }
  if (success) { otpVerifyMap.delete(email); return; }
  bucket.attempts += 1;
  if (bucket.attempts >= VERIFY_MAX_ATTEMPTS) bucket.locked = true;
  otpVerifyMap.set(email, bucket);
}

function checkVerifyRateLimit(email: string): void {
  const now = Date.now();
  const bucket = otpVerifyMap.get(email);
  if (!bucket) return;
  // Reset window if expired
  if (now - bucket.windowStart > VERIFY_WINDOW_MS) { otpVerifyMap.delete(email); return; }
  if (bucket.locked) {
    const minsLeft = Math.ceil((VERIFY_WINDOW_MS - (now - bucket.windowStart)) / 60_000);
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Too many failed attempts. Try again in ${minsLeft} minute(s).` });
  }
}
// ─────────────────────────────────────────────────────────────────────────────
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { generateOtp, sendOtpEmail } from "./email";
import {
  getUpcomingSessions,
  getSessions,
  getSignUpsForSession,
  getAllSignupsByEmail,
  getPayments,
  getUsers,
  findUserByEmail,
  convertDriveUrl,
  clearSessionsCache,
} from "./googleSheets";
import * as appsScript from "./appsScript";
import { syncTab, forceSyncTab } from "./sync";
import { maybeUpload, replaceOldDriveFile, extractDriveFileId, deleteFromDrive, uploadToDrive, isDataUrl as isDriveDataUrl } from "./driveUpload";
import { nanoid } from "nanoid";
import { eq, and, sql, max, asc, or } from "drizzle-orm";
import { sheetSignups, sheetSessions, sheetUsers, sheetPayments, announcements, merchItems, videos, users, otpCodes } from "../drizzle/schema";

/**
 * Normalise any date string to YYYY-MM-DD so SQL-stored dates and Sheets-sourced
 * dates (M/D/YYYY) can be compared consistently.
 */
function toIsoDate(raw: string): string {
  if (!raw) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const mdyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const date = new Date(raw);
  if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return raw;
}

/**
 * Parses a date string that may be in either:
 *   - M/D/YYYY  (what the Google Sheets API returns for date cells, e.g. "1/16/2026")
 *   - DD/MM/YYYY (what the app writes when setting trial dates, e.g. "16/01/2026")
 * Uses JS Date constructor first (handles M/D/YYYY), then falls back to manual DD/MM/YYYY.
 * Ambiguous cases like "3/10/2026" are resolved as M/D/YYYY (the dominant format from Sheets).
 */
function parseFlexDate(str: string): Date | null {
  if (!str || str === "NA") return null;
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  // Fallback: try DD/MM/YYYY
  const parts = str.split("/").map(Number);
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    const [dd, mm, yy] = parts;
    const d2 = new Date(yy, mm - 1, dd);
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

/**
 * Normalises a date string from the Sheets API (M/D/YYYY) to DD/MM/YYYY
 * so the DB consistently stores DD/MM/YYYY and frontend parseDDMMYYYY works correctly.
 * Returns the input unchanged if it's already DD/MM/YYYY or unrecognised.
 */
function normalizeToddmmyyyy(str: string): string {
  if (!str || str === "NA") return str;
  const d = parseFlexDate(str);
  if (!d) return str;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/**
 * Returns all payment rows that belong to a given user, using a two-pass strategy:
 *  Pass 1 — rows where col G email matches the user's email directly
 *  Pass 2 — rows where col G is absent/empty (carry-over rows without email lookup)
 *            matched by the PaymentID Match ref (col F) extracted from Pass 1
 *  Pass 3 — rows where GAS lookup failed (col F and G both empty) but col E reference
 *            contains the user's paymentId in Maybank format "OTHR-{paymentId}) from..."
 *            or as an exact match (user typed only their paymentId as the reference)
 *
 * This handles the "PATCH Carry over from 2025" rows and GAS lookup failures.
 */
function extractPaymentIdFromReference(reference: string): string {
  // Maybank PayNow format: "OTHR-mel) from TAN LI WEN MELANIE on 14 Apr..."
  const othrMatch = reference.match(/OTHR[-_](\w+)[)]/i);
  if (othrMatch) return othrMatch[1].toLowerCase();
  // Fallback: treat the whole reference as the paymentId (user typed only their ID)
  return reference.toLowerCase().trim();
}

async function getMyPayments(email: string, allPayments?: Awaited<ReturnType<typeof getPayments>>, userPaymentId?: string) {
  const payments = allPayments ?? await getPayments();
  const normUserPayId = (userPaymentId || "").toLowerCase().trim();

  // Seed the user's known paymentId refs with their own ID.
  // Then expand by collecting any paymentIds found on email-matched rows
  // (handles cases where the user has multiple ref variants).
  const myRefs = new Set<string>();
  if (normUserPayId) myRefs.add(normUserPayId);
  payments
    .filter(p => (p.email || "").toLowerCase().trim() === email)
    .map(p => (p.paymentId || "").toLowerCase().trim())
    .filter(Boolean)
    .forEach(id => myRefs.add(id));

  const result = payments.filter(p => {
    const rowPayId  = (p.paymentId  || "").toLowerCase().trim();
    const rowEmail  = (p.email      || "").toLowerCase().trim();

    // If the row has a paymentId, ownership is determined by paymentId alone.
    // This catches credits/year-start entries that have no email but do have a paymentId.
    if (rowPayId) return myRefs.has(rowPayId);

    // No paymentId — fall back to email match.
    if (rowEmail) return rowEmail === email;

    // Neither email nor paymentId: try extracting paymentId from reference text (col E).
    if (p.reference && normUserPayId) {
      return extractPaymentIdFromReference(p.reference) === normUserPayId;
    }

    return false;
  });

  // Rebuild myPaymentRefs from all matched rows so callers can use it for sign-up matching.
  const myPaymentRefs = new Set(result.map(p => (p.paymentId || "").toLowerCase().trim()).filter(Boolean));
  if (normUserPayId) myPaymentRefs.add(normUserPayId);

  return { myPayments: result, myPaymentRefs };
}

function generatePaymentId(name: string, existingIds: Set<string>): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstName = clean(parts[0] || "") || "user";
  const lastName  = parts.length > 1 ? clean(parts[parts.length - 1]) : "";

  // Step 1: first name only
  if (!existingIds.has(firstName)) return firstName;
  // Step 2: first name + first initial of last name
  if (lastName) {
    const withInitial = firstName + lastName[0];
    if (!existingIds.has(withInitial)) return withInitial;
  }
  // Step 3: first name + full last name
  const withSurname = lastName ? firstName + lastName : firstName;
  if (withSurname !== firstName && !existingIds.has(withSurname)) return withSurname;
  // Step 4: append number starting at 1
  const base = withSurname !== firstName ? withSurname : firstName;
  for (let n = 1; n <= 999; n++) {
    const candidate = `${base}${n}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  return `${firstName}${nanoid(4)}`;
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(async (opts) => {
      const user = opts.ctx.user;
      if (!user) return user;
      // Auto-demote expired trial members to Non-Member
      if (user.memberStatus === "Trial" && user.trialEndDate && user.trialEndDate !== "NA") {
        const endDate = parseFlexDate(user.trialEndDate);
        if (endDate) {
          endDate.setHours(23, 59, 59, 999);
          if (endDate < new Date()) {
            await db.upsertUser({ openId: user.openId, memberStatus: "Non-Member" });
            return { ...user, memberStatus: "Non-Member" };
          }
        }
      }
      return user;
    }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    sendOtp: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const { email } = input;
        checkSendRateLimit(email.toLowerCase().trim());
        const code = generateOtp();
        // Truncate to second precision — MySQL TIMESTAMP doesn't support milliseconds
        const expiresAt = new Date(Math.floor((Date.now() + 10 * 60 * 1000) / 1000) * 1000);
        await db.createOtp(email.toLowerCase().trim(), code, expiresAt);
        await sendOtpEmail(email, code);
        return { success: true, message: "Verification code sent" };
      }),

    verifyOtp: publicProcedure
      .input(z.object({
        email: z.string().email(),
        code: z.string().length(6),
      }))
      .mutation(async ({ input, ctx }) => {
        const email = input.email.toLowerCase().trim();
        const { code } = input;

        checkVerifyRateLimit(email);
        const isValid = await db.verifyOtp(email, code);
        if (!isValid) {
          recordVerifyAttempt(email, false);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid or expired code. Please try again.",
          });
        }
        recordVerifyAttempt(email, true);

        let user = await db.getUserByEmail(email);
        let isNewUser = false;

        let sheetUser = null;
        try {
          sheetUser = await findUserByEmail(email);
        } catch (err: any) {
          console.error("[Auth] Could not fetch sheet user:", err.message);
        }
        console.log("[Auth] sheetUser found:", JSON.stringify(sheetUser));

        if (!user) {
          // ── New user: create DB record ──────────────────────────────
          isNewUser = true;
          const openId = `email_${nanoid(16)}`;
          const name = sheetUser?.name || email.split("@")[0];

          let paymentId = sheetUser?.paymentId ?? "";
          if (!paymentId) {
            let allUsers: { paymentId: string }[] = [];
            try {
              allUsers = await getUsers();
            } catch (err: any) {
              console.error("[Auth] Could not fetch users for paymentId uniqueness check:", err.message);
            }
            const existingIds = new Set(allUsers.map(u => (u.paymentId || "").toLowerCase().trim()).filter(Boolean));
            paymentId = generatePaymentId(name, existingIds);
          }

          await db.upsertUser({
            openId,
            email,
            name,
            loginMethod: "email",
            memberStatus: resolveSheetMemberStatus(sheetUser?.memberStatus || "Non-Member", sheetUser?.trialEndDate ?? ""),
            paymentId,
            clubRole: sheetUser?.clubRole ?? "",
            trialStartDate: sheetUser?.trialStartDate ?? "",
            trialEndDate: sheetUser?.trialEndDate ?? "",
            lastSignedIn: new Date(),
          });
          user = await db.getUserByEmail(email);

          // GAS createUser is deferred — called from auth.completeProfile after
          // the user provides their real name, phone, and DOB in the onboarding step.
        }

        // ── Always sync sheet → DB on every login (new AND existing users) ──
        // This ensures admin changes in the sheet (e.g. Non-Member → Member)
        // take effect immediately on next login without any manual intervention.
        if (user && sheetUser) {
          console.log(`[Auth] Syncing sheet data for ${email}: memberStatus=${sheetUser.memberStatus}, clubRole=${sheetUser.clubRole}, paymentId=${sheetUser.paymentId}`);
          await db.upsertUser({
            openId: user.openId,
            lastSignedIn: new Date(),
            memberStatus: resolveSheetMemberStatus(sheetUser.memberStatus || "Non-Member", sheetUser.trialEndDate ?? ""),
            clubRole: sheetUser.clubRole ?? "",
            paymentId: sheetUser.paymentId || user.paymentId || "",
            trialStartDate: normalizeToddmmyyyy(sheetUser.trialStartDate ?? ""),
            trialEndDate: normalizeToddmmyyyy(sheetUser.trialEndDate ?? ""),
          });
          user = await db.getUserByEmail(email);
        } else if (user) {
          await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
          user = await db.getUserByEmail(email);
        }

        console.log("[Auth] DB user after upsert:", JSON.stringify(user));

        if (!user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create user account" });
        }

        const token = await sdk.createSessionToken(user.openId, {
          expiresInMs: ONE_YEAR_MS,
          name: user.name || "",
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return {
          success: true,
          isNewUser,
          // needsProfileCompletion: new users who have no sheet record must complete
          // their profile (name/phone/DOB) before being fully onboarded.
          needsProfileCompletion: isNewUser && !sheetUser,
          // Also return token in body so client can store it when CDN strips Set-Cookie
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            memberStatus: user.memberStatus,
            clubRole: user.clubRole ?? "",
            paymentId: user.paymentId ?? "",
            trialStartDate: user.trialStartDate ?? "",
            trialEndDate: user.trialEndDate ?? "",
          },
        };
      }),

    completeProfile: protectedProcedure
      .input(z.object({
        name: z.string().min(1, "Name is required"),
        phone: z.string().optional(),
        dob: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = ctx.user;
        const { name, phone, dob } = input;

        // Generate a unique paymentId from the real name
        let allUsers: { paymentId: string }[] = [];
        try {
          allUsers = await getUsers();
        } catch (err: any) {
          console.error("[Auth] completeProfile: could not fetch users:", err.message);
        }
        const existingIds = new Set(
          allUsers
            .map(u => (u.paymentId || "").toLowerCase().trim())
            .filter(id => id && id !== (user.paymentId || "").toLowerCase().trim())
        );
        const paymentId = generatePaymentId(name, existingIds);

        // Update DB with real name and new paymentId
        await db.upsertUser({ openId: user.openId, name, paymentId });

        // Upsert into sheet_users (DB-primary)
        const usersDb = await db.getDb();
        if (usersDb) {
          const profileEmail = (user.email ?? "").toLowerCase().trim();
          const existing = await usersDb
            .select({ id: sheetUsers.id })
            .from(sheetUsers)
            .where(or(eq(sheetUsers.email, profileEmail), eq(sheetUsers.userEmail, profileEmail)))
            .limit(1);
          if (existing.length > 0) {
            await usersDb.update(sheetUsers)
              .set({ name, paymentId, sheetId: paymentId })
              .where(or(eq(sheetUsers.email, profileEmail), eq(sheetUsers.userEmail, profileEmail)));
          } else {
            await usersDb.insert(sheetUsers).values({
              sheetId: paymentId,
              name,
              userEmail: user.email ?? "",
              email: (user.email ?? "").toLowerCase().trim(),
              image: "",
              paymentId,
              memberStatus: "Non-Member",
              clubRole: "",
              trialStartDate: "",
              trialEndDate: "",
            });
          }
        }

        return { success: true, paymentId };
      }),
  }),

  sessions: router({
    list: publicProcedure.query(async () => {
      const sessions = await getUpcomingSessions();
      // Attach live signup counts from DB
      const sessionDb = await db.getDb();
      let signupCounts: Record<string, number> = {};
      if (sessionDb) {
        const counts = await sessionDb
          .select({ dateOfTraining: sheetSignups.dateOfTraining, pool: sheetSignups.pool, count: sql<number>`count(*)` })
          .from(sheetSignups)
          .groupBy(sheetSignups.dateOfTraining, sheetSignups.pool);
        for (const row of counts) {
          const key = `${toIsoDate(row.dateOfTraining ?? "")}|${(row.pool ?? "").trim()}`;
          signupCounts[key] = (signupCounts[key] ?? 0) + Number(row.count);
        }
      }
      return sessions.map(s => ({
        ...s,
        poolImageUrl: convertDriveUrl(s.poolImageUrl),
        signupCount: signupCounts[`${toIsoDate(s.trainingDate)}|${(s.pool ?? "").trim()}`] ?? 0,
      }));
    }),

    detail: publicProcedure
      .input(z.object({ rowId: z.string() }))
      .query(async ({ input }) => {
        const allSessions = await getSessions();
        const session = allSessions.find(s => s.rowId === input.rowId);

        if (!session) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
        }

        const signups = await getSignUpsForSession(session.trainingDate, session.pool);
        const revenue = signups.reduce((sum, su) => sum + (su.actualFees ?? 0), 0);
        const pnl = revenue - (session.venueCost ?? 0);

        // Batch-fetch profile images for all signed-up users.
        // Primary source: users.image (local store). Fallback: sheetUsers.image (legacy Glide URLs).
        let imageByEmail: Record<string, string> = {};
        try {
          const sessionDb = await db.getDb();
          if (sessionDb) {
            // Seed with sheetUsers legacy images first (lower priority)
            const sheetUserRows = await sessionDb.select({ email: sheetUsers.email, userEmail: sheetUsers.userEmail, image: sheetUsers.image }).from(sheetUsers);
            for (const u of sheetUserRows) {
              const img = u.image || "";
              if (img && u.email)     imageByEmail[u.email.toLowerCase().trim()]     = img;
              if (img && u.userEmail) imageByEmail[u.userEmail.toLowerCase().trim()] = img;
            }
            // Overwrite with users.image (higher priority — locally stored photos)
            const authUserRows = await sessionDb.select({ email: users.email, image: users.image }).from(users);
            for (const u of authUserRows) {
              if (u.image && u.email) imageByEmail[u.email.toLowerCase().trim()] = u.image;
            }
          }
        } catch { /* non-fatal */ }

        return {
          ...session,
          poolImageUrl: convertDriveUrl(session.poolImageUrl),
          revenue,
          pnl,
          signups: signups.map(su => ({
            id: su.id ?? null,
            name: su.name,
            email: su.email,
            activity: su.activity,
            memberOnTrainingDate: su.memberOnTrainingDate,
            paymentId: su.paymentId,
            actualFees: su.actualFees,
            image: imageByEmail[su.email.toLowerCase().trim()] || "",
          })),
        };
      }),

    refresh: publicProcedure.mutation(async () => {
      clearSessionsCache();
      return { success: true };
    }),
  }),

  signups: router({
    submit: protectedProcedure
      .input(z.object({
        sessionRowId: z.string(),
        sessionDate: z.string(),
        sessionPool: z.string(),
        name: z.string().min(1),
        activity: z.string(),
        fee: z.number(),
        memberOnTrainingDate: z.string().default("Non-Member"),
        paymentMethod: z.string().default("PayNow"),
        numberOfPeople: z.number().int().min(1).default(1),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = ctx.user;
        const isAdmin = (user as any).clubRole === "Admin";
        const existingSignups = await getSignUpsForSession(input.sessionDate, input.sessionPool);

        // Admins add sign-ups on behalf of others — skip duplicate check so they can
        // add multiple attendees for the same session (each will get correct paymentId via edit).
        if (!isAdmin) {
          const isDuplicate = existingSignups.some(
            su => su.email.toLowerCase().trim() === (user.email || "").toLowerCase().trim()
          );
          if (isDuplicate) {
            throw new TRPCError({ code: "CONFLICT", message: "You are already signed up for this session." });
          }
        }

        const signupDb = await db.getDb();
        if (!signupDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        await signupDb.insert(sheetSignups).values({
          name: input.name,
          email: (user.email ?? "").toLowerCase().trim(),
          paymentId: (user.paymentId ?? "").toLowerCase().trim(),
          dateTimeOfSignUp: new Date().toISOString(),
          pool: input.sessionPool,
          dateOfTraining: input.sessionDate,
          activity: input.activity,
          activityValue: "",
          baseFee: input.fee,
          actualFees: input.fee,
          memberOnTrainingDate: input.memberOnTrainingDate,
        });

        clearSessionsCache();
        return {
          success: true,
          message: `You're signed up! See you at ${input.sessionPool} on ${input.sessionDate}.`,
        };
      }),

    edit: protectedProcedure
      .input(z.object({
        rowId: z.number(), // DB primary key — exact row to update, no ambiguity
        sessionDate: z.string(), // used only for debt guard (non-admin)
        sessionPool: z.string(), // used only for debt guard (non-admin)
        activity: z.string(),
        baseFee: z.number(),
        actualFee: z.number(),
        // Admin-only fields
        targetEmail: z.string().optional(),
        name: z.string().optional(),
        memberOnTrainingDate: z.string().optional(),
        paymentId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = ctx.user;
        const isAdmin = (user as any).clubRole === "Admin";
        if (input.targetEmail && !isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const editDb = await db.getDb();
        if (!editDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        // Verify the row belongs to the expected user (safety check)
        const [existingRow] = await editDb.select().from(sheetSignups).where(eq(sheetSignups.id, input.rowId));
        if (!existingRow) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Sign-up row not found." });
        }
        const targetEmail = (input.targetEmail ?? user.email ?? "").toLowerCase().trim();
        if (existingRow.email?.toLowerCase().trim() !== targetEmail) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Row does not belong to the expected user." });
        }

        // Debt guard for non-admins
        if (!isAdmin) {
          const userEmail = (user.email || "").toLowerCase().trim();
          const userPaymentId = (user.paymentId || "").trim();
          const allPayments = await getPayments();
          const { myPayments: myPmts, myPaymentRefs } = await getMyPayments(userEmail, allPayments, userPaymentId);
          const mySignups = await getAllSignupsByEmail(userEmail, myPaymentRefs);
          const totalFees = mySignups.reduce((sum, s) => sum + s.actualFees, 0);
          const totalPaid = myPmts.reduce((sum, p) => sum + p.amount, 0);
          const currentDebt = Math.max(0, totalFees - totalPaid);
          const oldFee = existingRow.actualFees ?? 0;
          const projectedDebt = currentDebt - oldFee + input.actualFee;
          if (projectedDebt > 50) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `This change would bring your outstanding balance to $${projectedDebt.toFixed(2)}, which exceeds the $50 limit. Please settle your balance first.`,
            });
          }
        }

        const fields: Record<string, any> = {
          activity: input.activity,
          baseFee: input.baseFee,
          actualFees: input.actualFee,
        };
        if (isAdmin) {
          if (input.name !== undefined) fields.name = input.name;
          if (input.memberOnTrainingDate !== undefined) fields.memberOnTrainingDate = input.memberOnTrainingDate;
          if (input.paymentId !== undefined) fields.paymentId = input.paymentId;
        }
        // Update exactly one row by its primary key — no ambiguity possible
        await editDb.update(sheetSignups).set(fields).where(eq(sheetSignups.id, input.rowId));
        clearSessionsCache();
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({
        rowId: z.number(), // DB primary key — exact row to delete
        targetEmail: z.string().optional(), // admin only
      }))
      .mutation(async ({ input, ctx }) => {
        const user = ctx.user;
        const isAdmin = (user as any).clubRole === "Admin";
        if (input.targetEmail && !isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const deleteDb = await db.getDb();
        if (!deleteDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        // Verify the row belongs to the expected user (safety check)
        const [existingRow] = await deleteDb.select().from(sheetSignups).where(eq(sheetSignups.id, input.rowId));
        if (!existingRow) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Sign-up row not found." });
        }
        const targetEmail = (input.targetEmail ?? user.email ?? "").toLowerCase().trim();
        if (existingRow.email?.toLowerCase().trim() !== targetEmail) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Row does not belong to the expected user." });
        }
        // Delete exactly one row by its primary key
        await deleteDb.delete(sheetSignups).where(eq(sheetSignups.id, input.rowId));
        clearSessionsCache();
        return { success: true };
      }),

    checkDuplicate: protectedProcedure
      .input(z.object({ sessionDate: z.string(), sessionPool: z.string() }))
      .query(async ({ input, ctx }) => {
        const user = ctx.user;
        const signups = await getSignUpsForSession(input.sessionDate, input.sessionPool);
        const isSignedUp = signups.some(
          su => su.email.toLowerCase().trim() === (user.email || "").toLowerCase().trim()
        );
        return { isSignedUp };
      }),

    myDebt: protectedProcedure.query(async ({ ctx }) => {
      const user = ctx.user;
      const email = (user.email || "").toLowerCase().trim();
      const paymentId = (user.paymentId || "").trim();

      const allPayments = await getPayments();
      const { myPayments, myPaymentRefs } = await getMyPayments(email, allPayments, paymentId);
      const mySignups = await getAllSignupsByEmail(email, myPaymentRefs);

      const totalFees = mySignups.reduce((sum, s) => sum + s.actualFees, 0);
      const totalPaid = myPayments.reduce((sum, p) => sum + p.amount, 0);

      return {
        totalFees,
        totalPaid,
        debt: Math.max(0, totalFees - totalPaid),
      };
    }),
  }),

  profile: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const user = ctx.user;
      // users.image is the primary store for profile photos (always available).
      // sheetUsers.image is kept for legacy Glide-hosted URLs; used as fallback.
      const sheetUser = user.email ? await findUserByEmail(user.email) : null;
      const image = (user as any).image || sheetUser?.image || "";
      if (sheetUser) {
        return {
          id: user.id,
          name: sheetUser.name || user.name,
          email: user.email,
          memberStatus: sheetUser.memberStatus || user.memberStatus || "Non-Member",
          clubRole: sheetUser.clubRole || user.clubRole || "",
          paymentId: sheetUser.paymentId || user.paymentId || "",
          trialStartDate: sheetUser.trialStartDate || user.trialStartDate || "",
          trialEndDate: sheetUser.trialEndDate || user.trialEndDate || "",
          image,
        };
      }
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        memberStatus: user.memberStatus || "Non-Member",
        clubRole: user.clubRole || "",
        paymentId: user.paymentId || "",
        trialStartDate: user.trialStartDate || "",
        trialEndDate: user.trialEndDate || "",
        image,
      };
    }),

    updatePhoto: protectedProcedure
      .input(z.object({ image: z.string() }))  // base64 data URL, Drive URL, or ""
      .mutation(async ({ ctx, input }) => {
        // Write ONLY to the users auth table — sheetUsers is a Sheets cache
        // that gets wiped on forceSync, so it must never be used as the photo store.
        const photoDb = await db.getDb();
        if (!photoDb) throw new Error("DB unavailable");

        // Delete old Drive file if being replaced
        const [existing] = await photoDb.select({ image: users.image }).from(users).where(eq(users.id, ctx.user.id));
        await replaceOldDriveFile(existing?.image);

        // Upload new image to Drive if it's a base64 data URL
        const stored = await maybeUpload(input.image, `profile_${ctx.user.id}.jpg`);

        await photoDb.update(users)
          .set({ image: stored })
          .where(eq(users.id, ctx.user.id));
        return { ok: true };
      }),
  }),
  payments: router({
    myData: protectedProcedure.query(async ({ ctx }) => {
      const user = ctx.user;
      const email = (user.email || "").toLowerCase().trim();
      const paymentId = (user.paymentId || "").trim();

      const allPayments = await getPayments();
      const { myPayments: myPaymentsRaw, myPaymentRefs } = await getMyPayments(email, allPayments, paymentId);
      const mySignups = await getAllSignupsByEmail(email, myPaymentRefs);

      // Separate training sign-ups from membership fee entries
      const MEMBERSHIP_ACTIVITIES = ["Membership Fee", "Trial Membership"];

      const trainingFees = mySignups
        .filter(s => !MEMBERSHIP_ACTIVITIES.includes(s.activity))
        .map(s => ({
          trainingDate: s.dateOfTraining,
          pool: s.pool,
          activity: s.activity,
          actualFee: s.actualFees,
        }));

      const membershipFees = mySignups
        .filter(s => MEMBERSHIP_ACTIVITIES.includes(s.activity))
        .map(s => ({
          date: s.dateTimeOfSignUp,  // date they signed up / paid
          activity: s.activity,
          actualFee: s.actualFees,
        }));

      const myPayments = myPaymentsRaw
        .map(p => ({ amount: p.amount, date: p.date }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Sort most-recent first
      trainingFees.sort((a, b) => new Date(b.trainingDate).getTime() - new Date(a.trainingDate).getTime());
      membershipFees.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const totalTrainingFees  = trainingFees.reduce((sum, f) => sum + f.actualFee, 0);
      const totalMembershipFees = membershipFees.reduce((sum, f) => sum + f.actualFee, 0);
      const totalFees = totalTrainingFees + totalMembershipFees;
      const totalPaid = myPayments.reduce((sum, p) => sum + p.amount, 0);

      return {
        paymentId,
        trainingFees,
        membershipFees,
        payments: myPayments,
        totalTrainingFees,
        totalMembershipFees,
        totalFees,
        totalPaid,
        debt: Math.max(0, totalFees - totalPaid),
      };
    }),
  }),

  membership: router({
    signupTrial: protectedProcedure.mutation(async ({ ctx }) => {
      const user = ctx.user;
      // Prevent re-trial: if trialStartDate is set, the user has already used their trial
      const hasTrialled = user.trialStartDate && user.trialStartDate !== "" && user.trialStartDate !== "NA";
      if (hasTrialled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You have already used your free trial membership." });
      }
      if (user.memberStatus === "Trial" || user.memberStatus === "Member" || user.memberStatus === "Student") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You already have an active membership." });
      }
      // Record the trial membership fee in Training Sign-ups — direct DB write
      const trialDb = await db.getDb();
      if (trialDb) {
        await trialDb.insert(sheetSignups).values({
          name: user.name ?? "",
          email: (user.email ?? "").toLowerCase().trim(),
          paymentId: (user.paymentId ?? "").toLowerCase().trim(),
          dateTimeOfSignUp: new Date().toISOString(),
          pool: "",
          dateOfTraining: "",
          activity: "Trial Membership",
          activityValue: "",
          baseFee: 10,
          actualFees: 10,
          memberOnTrainingDate: "",
        });
      }
      const today = new Date();
      const trialEnd = new Date(today);
      trialEnd.setMonth(trialEnd.getMonth() + 3);
      const fmt = (d: Date) => {
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        return `${dd}/${mm}/${d.getFullYear()}`;
      };

      // Update sheet_users — match by either email column
      const trialEmail = (user.email ?? "").toLowerCase().trim();
      if (trialDb) {
        await trialDb.update(sheetUsers)
          .set({ memberStatus: "Trial", trialStartDate: fmt(today), trialEndDate: fmt(trialEnd) })
          .where(or(eq(sheetUsers.email, trialEmail), eq(sheetUsers.userEmail, trialEmail)));
      }

      await db.upsertUser({
        openId: user.openId,
        memberStatus: "Trial",
        trialStartDate: fmt(today),
        trialEndDate: fmt(trialEnd),
      });

      const updated = await db.getUserByOpenId(user.openId);
      return { success: true, user: updated };
    }),

    signupMember: protectedProcedure.mutation(async ({ ctx }) => {
      const user = ctx.user;
      const email = (user.email ?? "").toLowerCase().trim();

      // Pro-rated annual fee: $80 full year, reduced by completed months
      const ANNUAL_FEE = 80;
      const monthIndex = new Date().getMonth(); // 0 = Jan … 11 = Dec
      const membershipFee = Math.round((ANNUAL_FEE * (12 - monthIndex)) / 12);

      const today = new Date();
      const fmt = (d: Date) => {
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        return `${dd}/${mm}/${d.getFullYear()}`;
      };
      const todayStr = fmt(today);

      const memberDb = await db.getDb();
      if (memberDb) {
        // Record the membership fee as a payment obligation in Training Sign-ups
        await memberDb.insert(sheetSignups).values({
          name: user.name ?? "",
          email,
          paymentId: (user.paymentId ?? "").toLowerCase().trim(),
          dateTimeOfSignUp: new Date().toISOString(),
          pool: "",
          dateOfTraining: todayStr,
          activity: "Membership Fee",
          activityValue: "",
          baseFee: membershipFee,
          actualFees: membershipFee,
          memberOnTrainingDate: "",
        });

        // Update sheet_users — match by either email column
        await memberDb.update(sheetUsers)
          .set({ memberStatus: "Member", membershipStartDate: todayStr })
          .where(or(eq(sheetUsers.email, email), eq(sheetUsers.userEmail, email)));
      }

      await db.upsertUser({
        openId: user.openId,
        memberStatus: "Member",
        membershipStartDate: todayStr,
      });

      const updated = await db.getUserByOpenId(user.openId);
      return { success: true, user: updated };
    }),
  }),

  admin: router({
    allUsers: protectedProcedure.query(async ({ ctx }) => {
      const { clubRole } = ctx.user;
      if (clubRole !== "Admin" && clubRole !== "Helper") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin or Helper access required" });
      }
      return getUsers();
    }),

    updateUserStatus: protectedProcedure
      .input(z.object({
        email: z.string().email(),
        name: z.string().optional(),
        paymentId: z.string().optional(),
        memberStatus: z.string().optional(),
        clubRole: z.string().optional(),
        membershipStartDate: z.string().optional(),
        trialStartDate: z.string().optional(),
        trialEndDate: z.string().optional(),
        dob: z.string().optional(),
        /** When setting memberStatus to "Member", optionally record the membership fee in Training Sign-ups */
        membershipFee: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.clubRole !== "Admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        // Update sheet_users (DB-primary)
        const adminUsersDb = await db.getDb();
        if (adminUsersDb) {
          const userFields: Record<string, string> = {};
          if (input.name !== undefined) userFields.name = input.name;
          if (input.paymentId !== undefined) { userFields.paymentId = input.paymentId; userFields.sheetId = input.paymentId; }
          if (input.memberStatus !== undefined) userFields.memberStatus = input.memberStatus;
          if (input.clubRole !== undefined) userFields.clubRole = input.clubRole;
          if (input.membershipStartDate !== undefined) userFields.membershipStartDate = input.membershipStartDate;
          if (input.trialStartDate !== undefined) userFields.trialStartDate = input.trialStartDate;
          if (input.trialEndDate !== undefined) userFields.trialEndDate = input.trialEndDate;
          if (input.dob !== undefined) userFields.dob = input.dob;
          if (Object.keys(userFields).length > 0) {
            const adminEmail = input.email.toLowerCase().trim();
            await adminUsersDb.update(sheetUsers)
              .set(userFields)
              .where(or(eq(sheetUsers.email, adminEmail), eq(sheetUsers.userEmail, adminEmail)));
          }
        }

        // When promoting to Member and a fee is provided, log it in Training Sign-ups — direct DB write
        if (input.memberStatus === "Member" && input.membershipFee && input.membershipFee > 0) {
          const targetUser = await findUserByEmail(input.email);
          const memberFeeDb = await db.getDb();
          if (memberFeeDb) {
            await memberFeeDb.insert(sheetSignups).values({
              name: targetUser?.name ?? "",
              email: input.email.toLowerCase().trim(),
              paymentId: (targetUser?.paymentId ?? "").toLowerCase().trim(),
              dateTimeOfSignUp: new Date().toISOString(),
              pool: "",
              dateOfTraining: "",
              activity: "Membership Fee",
              activityValue: "",
              baseFee: input.membershipFee,
              actualFees: input.membershipFee,
              memberOnTrainingDate: "",
            });
          }
        }

        const dbUser = await db.getUserByEmail(input.email.toLowerCase().trim());
        if (dbUser) {
          await db.upsertUser({
            openId: dbUser.openId,
            ...(input.name !== undefined && { name: input.name }),
            ...(input.paymentId !== undefined && { paymentId: input.paymentId }),
            ...(input.memberStatus !== undefined && { memberStatus: input.memberStatus }),
            ...(input.clubRole !== undefined && { clubRole: input.clubRole }),
            ...(input.trialStartDate !== undefined && { trialStartDate: input.trialStartDate }),
            ...(input.trialEndDate !== undefined && { trialEndDate: input.trialEndDate }),
          });
        }
        return { success: true };
      }),

    deleteUser: protectedProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.clubRole !== "Admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const emailNorm = input.email.toLowerCase().trim();
        const delDb = await db.getDb();
        if (!delDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        // Remove from sheet_users (profile/member data)
        await delDb.delete(sheetUsers).where(or(eq(sheetUsers.email, emailNorm), eq(sheetUsers.userEmail, emailNorm)));
        // Remove from auth users table (login access)
        const authUser = await db.getUserByEmail(emailNorm);
        if (authUser) {
          await delDb.delete(users).where(eq(users.id, authUser.id));
          // Clean up any outstanding OTP codes
          await delDb.delete(otpCodes).where(eq(otpCodes.email, emailNorm));
        }
        return { success: true };
      }),

    allPayments: protectedProcedure.query(async ({ ctx }) => {
      const { clubRole } = ctx.user;
      if (clubRole !== "Admin" && clubRole !== "Helper") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin or Helper access required" });
      }
      const payments = await getPayments();
      // Date format from sheet is "M/D/YYYY H:MM:SS" — parseable directly by Date constructor
      return [...payments].sort((a, b) =>
        (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0)
      );
    }),

    getUserActivity: protectedProcedure
      .input(z.object({ email: z.string(), paymentId: z.string().optional() }))
      .query(async ({ input, ctx }) => {
        const { clubRole } = ctx.user;
        if (clubRole !== "Admin" && clubRole !== "Helper") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin or Helper access required" });
        }
        const actDb = await db.getDb();
        if (!actDb) return { payments: [], signups: [] };
        const emailNorm = input.email.toLowerCase().trim();
        const pidNorm   = (input.paymentId || "").toLowerCase().trim();

        // Payments: use indexed WHERE clauses — fetch only rows matching email OR paymentId
        // then apply paymentId-primary logic in JS on the smaller result set.
        const { or } = await import("drizzle-orm");
        const pmtRows = pidNorm
          ? await actDb.select().from(sheetPayments)
              .where(or(eq(sheetPayments.paymentId, pidNorm), eq(sheetPayments.email, emailNorm)))
          : await actDb.select().from(sheetPayments)
              .where(eq(sheetPayments.email, emailNorm));
        const payments = pmtRows.filter(p => {
          const rowPayId = (p.paymentId || "").toLowerCase().trim();
          const rowEmail = (p.email     || "").toLowerCase().trim();
          if (rowPayId) return pidNorm ? rowPayId === pidNorm : rowEmail === emailNorm;
          return rowEmail === emailNorm;
        }).sort((a, b) =>
          (new Date(b.date ?? "").getTime() || 0) - (new Date(a.date ?? "").getTime() || 0)
        );

        // Signups: use indexed WHERE — paymentId-primary logic applied after smaller fetch.
        const supRows = pidNorm
          ? await actDb.select().from(sheetSignups)
              .where(or(eq(sheetSignups.paymentId, pidNorm), eq(sheetSignups.email, emailNorm)))
          : await actDb.select().from(sheetSignups)
              .where(eq(sheetSignups.email, emailNorm));
        const signups = supRows.filter(s => {
          const rowPayId = (s.paymentId || "").toLowerCase().trim();
          const rowEmail = (s.email     || "").toLowerCase().trim();
          if (rowPayId) return pidNorm ? rowPayId === pidNorm : rowEmail === emailNorm;
          return rowEmail === emailNorm;
        });
        const signupsSorted = [...signups].sort((a, b) =>
          (new Date(b.dateOfTraining ?? "").getTime() || 0) - (new Date(a.dateOfTraining ?? "").getTime() || 0)
        );

        return { payments, signups: signupsSorted };
      }),

    allSessions: protectedProcedure.query(async ({ ctx }) => {
      const { clubRole } = ctx.user;
      if (clubRole !== "Admin" && clubRole !== "Helper") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin or Helper access required" });
      }
      const sessions = await getSessions();
      // Compute revenue live from sign-ups (sum of actualFees per session).
      // Normalise dateOfTraining to YYYY-MM-DD in JS to handle mixed date formats
      // (Sheets stores M/D/YYYY, app stores YYYY-MM-DD).
      const sessDb = await db.getDb();
      let revenueMap: Record<string, number> = {};
      if (sessDb) {
        const rows = await sessDb.select({
          dateOfTraining: sheetSignups.dateOfTraining,
          pool: sheetSignups.pool,
          actualFees: sheetSignups.actualFees,
        }).from(sheetSignups);
        for (const r of rows) {
          const key = `${toIsoDate(r.dateOfTraining ?? "")}__${(r.pool ?? "").trim()}`;
          revenueMap[key] = (revenueMap[key] ?? 0) + Number(r.actualFees ?? 0);
        }
      }
      return [...sessions].sort((a, b) => {
        const dA = new Date(a.trainingDate).getTime() || 0;
        const dB = new Date(b.trainingDate).getTime() || 0;
        return dB - dA;
      }).map(s => ({
        ...s,
        revenue: revenueMap[`${toIsoDate(s.trainingDate)}__${(s.pool ?? "").trim()}`] ?? 0,
      }));
    }),

    sessionAttendees: protectedProcedure
      .input(z.object({ rowId: z.string() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.clubRole !== "Admin" && ctx.user.clubRole !== "Helper") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin or Helper access required" });
        }
        const sessDb = await db.getDb();
        if (!sessDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const [session] = await sessDb.select().from(sheetSessions).where(eq(sheetSessions.rowId, input.rowId));
        if (!session) return [];
        const isoDate = toIsoDate(session.trainingDate ?? "");
        const poolNorm = (session.pool ?? "").trim();
        // Fetch by pool first (indexed), then filter by normalised date in JS to
        // handle mixed date formats (YYYY-MM-DD vs M/D/YYYY).
        const allForPool = await sessDb.select().from(sheetSignups)
          .where(eq(sheetSignups.pool, poolNorm));
        const signups = allForPool.filter(s =>
          toIsoDate(s.dateOfTraining ?? "") === isoDate
        );
        return signups;
      }),

    editSignup: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        email: z.string().optional(),
        paymentId: z.string().optional(),
        activity: z.string().optional(),
        activityValue: z.string().optional(),
        baseFee: z.number().optional(),
        actualFees: z.number().optional(),
        memberOnTrainingDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.clubRole !== "Admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const sessDb = await db.getDb();
        if (!sessDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const { id, ...fields } = input;
        const updates: Record<string, unknown> = {};
        if (fields.name !== undefined) updates.name = fields.name;
        if (fields.email !== undefined) updates.email = fields.email.toLowerCase().trim();
        if (fields.paymentId !== undefined) updates.paymentId = fields.paymentId.toLowerCase().trim();
        if (fields.activity !== undefined) updates.activity = fields.activity;
        if (fields.activityValue !== undefined) updates.activityValue = fields.activityValue;
        if (fields.baseFee !== undefined) updates.baseFee = fields.baseFee;
        if (fields.actualFees !== undefined) updates.actualFees = fields.actualFees;
        if (fields.memberOnTrainingDate !== undefined) updates.memberOnTrainingDate = fields.memberOnTrainingDate;
        if (Object.keys(updates).length === 0) return { success: true };
        await sessDb.update(sheetSignups).set(updates).where(eq(sheetSignups.id, id));
        return { success: true };
      }),

    addSignup: protectedProcedure
      .input(z.object({
        rowId: z.string(),              // identifies which session
        name: z.string().min(1),
        email: z.string().default(""),
        paymentId: z.string().min(1),
        activity: z.string().min(1),
        actualFees: z.number(),
        memberOnTrainingDate: z.string().default("Non-Member"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.clubRole !== "Admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const sessDb = await db.getDb();
        if (!sessDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const [session] = await sessDb.select().from(sheetSessions).where(eq(sheetSessions.rowId, input.rowId));
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
        const isoDate = toIsoDate(session.trainingDate ?? "");
        await sessDb.insert(sheetSignups).values({
          name: input.name.trim(),
          email: input.email.toLowerCase().trim(),
          paymentId: input.paymentId.toLowerCase().trim(),
          dateTimeOfSignUp: new Date().toISOString(),
          pool: session.pool ?? "",
          dateOfTraining: isoDate,
          activity: input.activity,
          activityValue: "",
          baseFee: input.actualFees,
          actualFees: input.actualFees,
          memberOnTrainingDate: input.memberOnTrainingDate,
        });
        return { success: true };
      }),

    deleteSignup: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.clubRole !== "Admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const sessDb = await db.getDb();
        if (!sessDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        await sessDb.delete(sheetSignups).where(eq(sheetSignups.id, input.id));
        return { success: true };
      }),

    processRainOff: protectedProcedure
      .input(z.object({
        rowId: z.string(),
        type: z.enum(["half", "full"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.clubRole !== "Admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const sessDb = await db.getDb();
        if (!sessDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const [session] = await sessDb.select().from(sheetSessions).where(eq(sheetSessions.rowId, input.rowId));
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

        // Get all sign-ups for this session with a positive fee
        const isoDateRO = toIsoDate(session.trainingDate ?? "");
        const poolNormRO = (session.pool ?? "").trim();
        const allForPoolRO = await sessDb.select().from(sheetSignups)
          .where(eq(sheetSignups.pool, poolNormRO));
        const signups = allForPoolRO.filter(s =>
          toIsoDate(s.dateOfTraining ?? "") === isoDateRO
        );
        const eligible = signups.filter(s => (s.actualFees ?? 0) > 0 && s.activity !== "Rain Off Refund");

        // Insert a refund record for each eligible sign-up
        const refundMultiplier = input.type === "full" ? 1 : 0.5;
        const label = input.type === "full" ? "Full Rain Off Refund" : "Half Rain Off Refund";

        if (eligible.length > 0) {
          await sessDb.insert(sheetSignups).values(
            eligible.map(s => ({
              name: s.name ?? "",
              email: s.email ?? "",
              paymentId: s.paymentId ?? "",
              dateTimeOfSignUp: new Date().toISOString(),
              pool: s.pool ?? "",
              dateOfTraining: s.dateOfTraining ?? "",
              activity: "Rain Off Refund",
              activityValue: label,
              baseFee: -Math.round((s.actualFees ?? 0) * refundMultiplier * 100) / 100,
              actualFees: -Math.round((s.actualFees ?? 0) * refundMultiplier * 100) / 100,
              memberOnTrainingDate: s.memberOnTrainingDate ?? "",
            }))
          );
        }

        // Update session rainOff flag
        const rainOffValue = input.type === "full" ? "Full Rain Off" : "Half Rain Off";
        await sessDb.update(sheetSessions).set({ rainOff: rainOffValue }).where(eq(sheetSessions.rowId, input.rowId));
        clearSessionsCache();

        return { success: true, refundsIssued: eligible.length, type: input.type };
      }),

    forceSync: protectedProcedure
      .input(z.object({ tab: z.enum(["sessions", "payments", "signups", "users", "all"]) }))
      .mutation(async ({ ctx, input }) => {
        const { clubRole } = ctx.user;
        if (clubRole !== "Admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        if (input.tab === "all") {
          await Promise.all([
            forceSyncTab("sessions"),
            forceSyncTab("payments"),
            forceSyncTab("signups"),
            forceSyncTab("users"),
          ]);
        } else {
          await forceSyncTab(input.tab as any);
        }
        return { ok: true, tab: input.tab, syncedAt: new Date().toISOString() };
      }),

    migrateGlidePhotos: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.clubRole !== "Admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const migDb = await db.getDb();
        if (!migDb) throw new Error("DB unavailable");

        // Find all sheetUsers rows that still have a Glide (http) URL
        const glideRows = await migDb.select({
          email: sheetUsers.email,
          userEmail: sheetUsers.userEmail,
          image: sheetUsers.image,
        }).from(sheetUsers).where(sql`image LIKE 'http%'`);

        let migrated = 0, skipped = 0, failed = 0;
        const errors: string[] = [];

        for (const su of glideRows) {
          const email = (su.email || su.userEmail || "").toLowerCase().trim();
          if (!email || !su.image) { skipped++; continue; }

          // Find matching auth user
          const [authUser] = await migDb.select({ id: users.id, image: users.image })
            .from(users)
            .where(sql`LOWER(email) = ${email}`)
            .limit(1);

          if (!authUser) { skipped++; continue; }
          if (authUser.image && !authUser.image.startsWith("http")) {
            // Already has a locally-stored image; don't overwrite
            skipped++;
            continue;
          }

          // Download the Glide image server-side
          try {
            const resp = await fetch(su.image, {
              signal: AbortSignal.timeout(15000),
              headers: { "User-Agent": "Mozilla/5.0" },
            });
            if (!resp.ok) { failed++; errors.push(`${email}: HTTP ${resp.status}`); continue; }
            const contentType = resp.headers.get("content-type")?.split(";")[0] || "image/jpeg";
            const buf = await resp.arrayBuffer();
            const b64 = Buffer.from(buf).toString("base64");
            const dataUrl = `data:${contentType};base64,${b64}`;
            await migDb.update(users).set({ image: dataUrl }).where(eq(users.id, authUser.id));
            migrated++;
          } catch (e: any) {
            failed++;
            errors.push(`${email}: ${e.message}`);
          }
        }

        console.log(`[migrateGlidePhotos] migrated=${migrated} skipped=${skipped} failed=${failed}`);
        if (errors.length) console.log("[migrateGlidePhotos] errors:", errors);
        return { migrated, skipped, failed, total: glideRows.length, errors };
      }),

    /**
     * Migrate all existing base64 images stored in the DB to Google Drive.
     * Covers: users.image, announcements.imageUrl, merch_items.photo1/photo2.
     * Safe to re-run — skips rows that already have a Drive URL.
     */
    migrateImagesToDrive: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.clubRole !== "Admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const migDb = await db.getDb();
        if (!migDb) throw new Error("DB unavailable");

        const isB64 = isDriveDataUrl;
        let migrated = 0, skipped = 0, failed = 0;
        const errors: string[] = [];

        // ── Profile photos (users.image) ──────────────────────────────────────
        const allUsers = await migDb.select({ id: users.id, email: users.email, image: users.image }).from(users);
        for (const u of allUsers) {
          if (!u.image || !isB64(u.image)) { skipped++; continue; }
          try {
            const url = await uploadToDrive(u.image, `profile_${u.id}.jpg`);
            await migDb.update(users).set({ image: url }).where(eq(users.id, u.id));
            migrated++;
          } catch (e: any) { failed++; errors.push(`user ${u.email}: ${e.message}`); }
        }

        // ── Announcements (announcements.imageUrl) ────────────────────────────
        const allAnns = await migDb.select({ id: announcements.id, imageUrl: announcements.imageUrl }).from(announcements);
        for (const a of allAnns) {
          if (!a.imageUrl || !isB64(a.imageUrl)) { skipped++; continue; }
          try {
            const url = await uploadToDrive(a.imageUrl, `announcement_${a.id}.jpg`);
            await migDb.update(announcements).set({ imageUrl: url }).where(eq(announcements.id, a.id));
            migrated++;
          } catch (e: any) { failed++; errors.push(`announcement ${a.id}: ${e.message}`); }
        }

        // ── Merch photos (photo1, photo2) ─────────────────────────────────────
        const allMerch = await migDb.select({ id: merchItems.id, photo1: merchItems.photo1, photo2: merchItems.photo2 }).from(merchItems);
        for (const m of allMerch) {
          if (m.photo1 && isB64(m.photo1)) {
            try {
              const url = await uploadToDrive(m.photo1, `merch_${m.id}_photo1.jpg`);
              await migDb.update(merchItems).set({ photo1: url }).where(eq(merchItems.id, m.id));
              migrated++;
            } catch (e: any) { failed++; errors.push(`merch ${m.id} photo1: ${e.message}`); }
          } else { skipped++; }
          if (m.photo2 && isB64(m.photo2)) {
            try {
              const url = await uploadToDrive(m.photo2, `merch_${m.id}_photo2.jpg`);
              await migDb.update(merchItems).set({ photo2: url }).where(eq(merchItems.id, m.id));
              migrated++;
            } catch (e: any) { failed++; errors.push(`merch ${m.id} photo2: ${e.message}`); }
          } else { skipped++; }
        }

        console.log(`[migrateImagesToDrive] migrated=${migrated} skipped=${skipped} failed=${failed}`);
        if (errors.length) console.log("[migrateImagesToDrive] errors:", errors);
        return { migrated, skipped, failed, errors };
      }),

    addSession: protectedProcedure
      .input(z.object({
        trainingDate: z.string(),
        day: z.string(),
        trainingTime: z.string(),
        pool: z.string(),
        memberFee: z.number(),
        nonMemberFee: z.number(),
        memberSwimFee: z.number(),
        nonMemberSwimFee: z.number(),
        studentFee: z.number(),
        studentSwimFee: z.number(),
        trainerFee: z.number().default(0),
        notes: z.string().default(""),
        trainingObjective: z.string().default(""),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.clubRole !== "Admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const sessDb = await db.getDb();
        if (!sessDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        // Derive next rowIndex: MAX(rowIndex) + 1 so new rows don't collide with
        // existing rows that were synced from the sheet.
        const [maxRow] = await sessDb.select({ m: sql<number>`MAX(${sheetSessions.rowIndex})` }).from(sheetSessions);
        const nextRowIndex = (maxRow?.m ?? 0) + 1;
        await sessDb.insert(sheetSessions).values({
          rowIndex: nextRowIndex,
          trainingDate: input.trainingDate,
          day: input.day,
          trainingTime: input.trainingTime,
          pool: input.pool,
          poolImageUrl: "",
          memberFee: input.memberFee,
          nonMemberFee: input.nonMemberFee,
          memberSwimFee: input.memberSwimFee,
          nonMemberSwimFee: input.nonMemberSwimFee,
          studentFee: input.studentFee,
          studentSwimFee: input.studentSwimFee,
          trainerFee: input.trainerFee,
          notes: input.notes,
          rowId: nanoid(10),
          attendance: 0,
          isClosed: "",
          trainingObjective: input.trainingObjective,
          signUpCloseTime: "",
        });
        clearSessionsCache();
        return { success: true };
      }),

    closeSession: protectedProcedure
      .input(z.object({ rowId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.clubRole !== "Admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const sessDb = await db.getDb();
        if (!sessDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        await sessDb.update(sheetSessions)
          .set({ isClosed: "Closed" })
          .where(eq(sheetSessions.rowId, input.rowId));
        clearSessionsCache();
        return { success: true };
      }),

    editPayment: protectedProcedure
      .input(z.object({
        id: z.number(),
        paymentId: z.string().optional(),
        reference: z.string().optional(),
        amount: z.number().optional(),
        date: z.string().optional(),
        email: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.clubRole !== "Admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const payDb = await db.getDb();
        if (!payDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const { id, ...fields } = input;
        const updates: Record<string, unknown> = {};
        if (fields.paymentId !== undefined) updates.paymentId = fields.paymentId;
        if (fields.reference !== undefined) updates.reference = fields.reference;
        if (fields.amount !== undefined) updates.amount = fields.amount;
        if (fields.date !== undefined) updates.date = fields.date;
        if (fields.email !== undefined) updates.email = fields.email;
        if (Object.keys(updates).length === 0) return { success: true };
        await payDb.update(sheetPayments).set(updates).where(eq(sheetPayments.id, id));
        return { success: true };
      }),

    editSession: protectedProcedure
      .input(z.object({
        rowId: z.string(),
        trainingDate: z.string().optional(),
        day: z.string().optional(),
        trainingTime: z.string().optional(),
        pool: z.string().optional(),
        memberFee: z.number().optional(),
        nonMemberFee: z.number().optional(),
        memberSwimFee: z.number().optional(),
        nonMemberSwimFee: z.number().optional(),
        studentFee: z.number().optional(),
        studentSwimFee: z.number().optional(),
        trainerFee: z.number().optional(),
        notes: z.string().optional(),
        trainingObjective: z.string().optional(),
        venueCost: z.number().optional(),
        rainOff: z.string().optional(),
        isClosed: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.clubRole !== "Admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const sessDb = await db.getDb();
        if (!sessDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const { rowId, ...fields } = input;
        const updates: Record<string, unknown> = {};
        if (fields.trainingDate !== undefined) updates.trainingDate = fields.trainingDate;
        if (fields.day !== undefined) updates.day = fields.day;
        if (fields.trainingTime !== undefined) updates.trainingTime = fields.trainingTime;
        if (fields.pool !== undefined) updates.pool = fields.pool;
        if (fields.memberFee !== undefined) updates.memberFee = fields.memberFee;
        if (fields.nonMemberFee !== undefined) updates.nonMemberFee = fields.nonMemberFee;
        if (fields.memberSwimFee !== undefined) updates.memberSwimFee = fields.memberSwimFee;
        if (fields.nonMemberSwimFee !== undefined) updates.nonMemberSwimFee = fields.nonMemberSwimFee;
        if (fields.studentFee !== undefined) updates.studentFee = fields.studentFee;
        if (fields.studentSwimFee !== undefined) updates.studentSwimFee = fields.studentSwimFee;
        if (fields.trainerFee !== undefined) updates.trainerFee = fields.trainerFee;
        if (fields.notes !== undefined) updates.notes = fields.notes;
        if (fields.trainingObjective !== undefined) updates.trainingObjective = fields.trainingObjective;
        if (fields.venueCost !== undefined) updates.venueCost = fields.venueCost;
        if (fields.rainOff !== undefined) updates.rainOff = fields.rainOff;
        if (fields.isClosed !== undefined) updates.isClosed = fields.isClosed;
        if (Object.keys(updates).length === 0) return { success: true };
        await sessDb.update(sheetSessions)
          .set(updates)
          .where(eq(sheetSessions.rowId, rowId));
        clearSessionsCache();
        return { success: true };
      }),
  }),

  announcements: router({
    list: publicProcedure.query(async () => {
      const aDb = await db.getDb();
      if (!aDb) return [];
      return aDb.select().from(announcements).orderBy(announcements.position);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const aDb = await db.getDb();
        if (!aDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const rows = await aDb.select().from(announcements).where(eq(announcements.id, input.id)).limit(1);
        if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
        return rows[0];
      }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().optional(),
        content: z.string().optional(),
        imageUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const role = ctx.user.clubRole;
        if (role !== "Admin" && role !== "Helper") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin or Helper access required" });
        }
        const aDb = await db.getDb();
        if (!aDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        if (!input.title && !input.content && !input.imageUrl) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "At least one field is required" });
        }
        // Upload image to Drive if a base64 data URL was provided
        const storedImageUrl = await maybeUpload(input.imageUrl, `announcement_${Date.now()}.jpg`);
        const [maxRow] = await aDb.select({ maxPos: max(announcements.position) }).from(announcements);
        const nextPos = (maxRow?.maxPos ?? 0) + 1;
        await aDb.insert(announcements).values({
          title: input.title || null,
          content: input.content || null,
          imageUrl: storedImageUrl,
          position: nextPos,
          createdBy: ctx.user.email || "",
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional(),
        imageUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const role = ctx.user.clubRole;
        if (role !== "Admin" && role !== "Helper") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin or Helper access required" });
        }
        const aDb = await db.getDb();
        if (!aDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const updates: Record<string, unknown> = {};
        if (input.title !== undefined) updates.title = input.title || null;
        if (input.content !== undefined) updates.content = input.content || null;
        if (input.imageUrl !== undefined) {
          // Delete old Drive file if being replaced
          const [existing] = await aDb.select({ imageUrl: announcements.imageUrl }).from(announcements).where(eq(announcements.id, input.id));
          await replaceOldDriveFile(existing?.imageUrl);
          updates.imageUrl = await maybeUpload(input.imageUrl, `announcement_${input.id}_${Date.now()}.jpg`);
        }
        if (Object.keys(updates).length === 0) return { success: true };
        await aDb.update(announcements).set(updates).where(eq(announcements.id, input.id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const role = ctx.user.clubRole;
        if (role !== "Admin" && role !== "Helper") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin or Helper access required" });
        }
        const aDb = await db.getDb();
        if (!aDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        // Delete Drive file before removing the DB row
        const [existing] = await aDb.select({ imageUrl: announcements.imageUrl }).from(announcements).where(eq(announcements.id, input.id));
        await replaceOldDriveFile(existing?.imageUrl);
        await aDb.delete(announcements).where(eq(announcements.id, input.id));
        return { success: true };
      }),

    reorder: protectedProcedure
      .input(z.object({ orderedIds: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const role = ctx.user.clubRole;
        if (role !== "Admin" && role !== "Helper") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin or Helper access required" });
        }
        const aDb = await db.getDb();
        if (!aDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        await Promise.all(
          input.orderedIds.map((id, index) =>
            aDb.update(announcements).set({ position: index + 1 }).where(eq(announcements.id, id))
          )
        );
        return { success: true };
      }),
  }),

  merch: router({
    list: protectedProcedure.query(async () => {
      const mDb = await db.getDb();
      if (!mDb) return [];
      return mDb.select().from(merchItems).orderBy(asc(merchItems.sortOrder), asc(merchItems.id));
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const mDb = await db.getDb();
        if (!mDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const rows = await mDb.select().from(merchItems).where(eq(merchItems.id, input.id)).limit(1);
        if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
        return rows[0];
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        memberPrice: z.string().optional(),
        nonMemberPrice: z.string().optional(),
        photo1: z.string().optional(),
        photo2: z.string().optional(),
        availableSizes: z.string().optional(),
        howToPurchase: z.string().optional(),
        inventory: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const role = ctx.user.clubRole;
        if (role !== "Admin" && role !== "Helper") throw new TRPCError({ code: "FORBIDDEN" });
        const mDb = await db.getDb();
        if (!mDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // Upload photos to Drive if base64 data URLs were provided
        const ts = Date.now();
        const [photo1Url, photo2Url] = await Promise.all([
          maybeUpload(input.photo1, `merch_photo1_${ts}.jpg`),
          maybeUpload(input.photo2, `merch_photo2_${ts}.jpg`),
        ]);
        const result = await mDb.insert(merchItems).values({
          name: input.name,
          description: input.description ?? null,
          memberPrice: input.memberPrice ?? "",
          nonMemberPrice: input.nonMemberPrice ?? "",
          photo1: photo1Url,
          photo2: photo2Url,
          availableSizes: input.availableSizes ?? "",
          howToPurchase: input.howToPurchase ?? null,
          inventory: input.inventory ?? null,
          sortOrder: input.sortOrder ?? 0,
        });
        return { success: true, id: Number((result as any).insertId ?? 0) };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        memberPrice: z.string().optional(),
        nonMemberPrice: z.string().optional(),
        photo1: z.string().optional(),
        photo2: z.string().optional(),
        availableSizes: z.string().optional(),
        howToPurchase: z.string().optional(),
        inventory: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const role = ctx.user.clubRole;
        if (role !== "Admin" && role !== "Helper") throw new TRPCError({ code: "FORBIDDEN" });
        const mDb = await db.getDb();
        if (!mDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { id, photo1: p1In, photo2: p2In, ...rest } = input;
        // Fetch existing photos to delete old Drive files if being replaced
        const [existing] = await mDb.select({ photo1: merchItems.photo1, photo2: merchItems.photo2 }).from(merchItems).where(eq(merchItems.id, id));
        const ts = Date.now();
        const fields: Record<string, unknown> = { ...rest };
        if (p1In !== undefined) {
          await replaceOldDriveFile(existing?.photo1);
          fields.photo1 = await maybeUpload(p1In, `merch_${id}_photo1_${ts}.jpg`);
        }
        if (p2In !== undefined) {
          await replaceOldDriveFile(existing?.photo2);
          fields.photo2 = await maybeUpload(p2In, `merch_${id}_photo2_${ts}.jpg`);
        }
        await mDb.update(merchItems).set(fields).where(eq(merchItems.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const role = ctx.user.clubRole;
        if (role !== "Admin" && role !== "Helper") throw new TRPCError({ code: "FORBIDDEN" });
        const mDb = await db.getDb();
        if (!mDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // Delete Drive files before removing the DB row
        const [existing] = await mDb.select({ photo1: merchItems.photo1, photo2: merchItems.photo2 }).from(merchItems).where(eq(merchItems.id, input.id));
        await Promise.all([
          replaceOldDriveFile(existing?.photo1),
          replaceOldDriveFile(existing?.photo2),
        ]);
        await mDb.delete(merchItems).where(eq(merchItems.id, input.id));
        return { success: true };
      }),
  }),

  videos: router({
    list: publicProcedure.query(async () => {
      const vDb = await db.getDb();
      if (!vDb) return [];
      const rows = await vDb.select().from(videos).orderBy(sql`${videos.createdAt} DESC`);
      return rows;
    }),

    add: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(255),
        url: z.string().url(),
      }))
      .mutation(async ({ input, ctx }) => {
        const vDb = await db.getDb();
        if (!vDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const postedBy = (ctx.user as any).name || (ctx.user as any).email || "Unknown";
        const postedDate = new Date().toISOString().slice(0, 10);
        await vDb.insert(videos).values({
          title: input.title,
          url: input.url,
          postedBy,
          postedDate,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const role = (ctx.user as any).clubRole;
        if (role !== "Admin" && role !== "Helper") throw new TRPCError({ code: "FORBIDDEN" });
        const vDb = await db.getDb();
        if (!vDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await vDb.delete(videos).where(eq(videos.id, input.id));
        return { success: true };
      }),
  }),

  resources: router({
    list: publicProcedure.query(async () => {
      // Fetch the "Resources" tab directly from Google Sheets.
      // Column B = title (index 1), Column C = url (index 2).
      // Rows are 1-indexed in Sheets; array index = row - 1.
      const RESOURCES_TAB = "Resources";
      // Row numbers (1-indexed) for each group
      const RESOURCE_ROWS   = [6, 7, 17, 15, 16];
      const USEFUL_LINK_ROWS = [9, 8, 11, 5];

      let rawRows: string[][] = [];
      try {
        // Use the same fetchSheetRange helper via a dynamic import workaround —
        // we export it indirectly by calling googleSheets.getResources below
        const { fetchResourcesTab } = await import("./googleSheets");
        rawRows = await fetchResourcesTab();
      } catch (e) {
        console.error("[resources.list] Failed to fetch Resources tab:", e);
      }

      function pickRow(rowNum: number): { title: string; url: string } | null {
        const row = rawRows[rowNum - 1];
        if (!row) return null;
        const title = (row[1] ?? "").trim();
        const url   = (row[2] ?? "").trim();
        if (!title && !url) return null;
        return { title, url };
      }

      const resources = RESOURCE_ROWS.map(pickRow).filter(Boolean) as { title: string; url: string }[];
      const usefulLinks = USEFUL_LINK_ROWS.map(pickRow).filter(Boolean) as { title: string; url: string }[];

      return { resources, usefulLinks };
    }),
  }),
});

export type AppRouter = typeof appRouter;
