import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
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
import { syncTab } from "./sync";
import { nanoid } from "nanoid";
import { eq, and, sql } from "drizzle-orm";
import { sheetSignups, sheetSessions, sheetUsers, sheetPayments } from "../drizzle/schema";


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

  // Pass 1: direct email match
  const byEmail = payments.filter(p => p.email === email);
  // Collect the user's known payment refs from pass-1 rows; seed with own paymentId
  const myRefs = new Set(byEmail.map(p => p.paymentId.toLowerCase().trim()).filter(Boolean));
  if (normUserPayId) myRefs.add(normUserPayId);

  // Pass 2: carry-over rows (no email) whose col F ref is in the user's known refs
  const byRef = payments.filter(p => !p.email && p.paymentId && myRefs.has(p.paymentId.toLowerCase().trim()));

  // Pass 3: GAS lookup failed (col F and G empty) — extract paymentId from col E reference text
  const byRefText = normUserPayId
    ? payments.filter(p => {
        if (p.email || p.paymentId) return false;
        if (!p.reference) return false;
        return extractPaymentIdFromReference(p.reference) === normUserPayId;
      })
    : [];

  return { myPayments: [...byEmail, ...byRef, ...byRefText], myPaymentRefs: myRefs };
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

        const isValid = await db.verifyOtp(email, code);
        if (!isValid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid or expired code. Please try again.",
          });
        }

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
            memberStatus: sheetUser?.memberStatus || "Non-Member",
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
            memberStatus: sheetUser.memberStatus || "Non-Member",
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
          const existing = await usersDb
            .select({ id: sheetUsers.id })
            .from(sheetUsers)
            .where(eq(sheetUsers.email, (user.email ?? "").toLowerCase().trim()))
            .limit(1);
          if (existing.length > 0) {
            await usersDb.update(sheetUsers)
              .set({ name, paymentId, sheetId: paymentId })
              .where(eq(sheetUsers.email, (user.email ?? "").toLowerCase().trim()));
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
      return sessions.map(s => ({
        ...s,
        poolImageUrl: convertDriveUrl(s.poolImageUrl),
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
        return {
          ...session,
          poolImageUrl: convertDriveUrl(session.poolImageUrl),
          signups: signups.map(su => ({
            name: su.name,
            email: su.email,
            activity: su.activity,
            memberOnTrainingDate: su.memberOnTrainingDate,
            paymentId: su.paymentId,
            actualFees: su.actualFees,
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
        const existingSignups = await getSignUpsForSession(input.sessionDate, input.sessionPool);
        const isDuplicate = existingSignups.some(
          su => su.email.toLowerCase().trim() === (user.email || "").toLowerCase().trim()
        );

        if (isDuplicate) {
          throw new TRPCError({ code: "CONFLICT", message: "You are already signed up for this session." });
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
        sessionDate: z.string(),
        sessionPool: z.string(),
        activity: z.string(),
        baseFee: z.number(),
        actualFee: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = ctx.user;
        const editDb = await db.getDb();
        if (!editDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        await editDb.update(sheetSignups)
          .set({ activity: input.activity, baseFee: input.baseFee, actualFees: input.actualFee })
          .where(and(
            eq(sheetSignups.email, (user.email ?? "").toLowerCase().trim()),
            eq(sheetSignups.dateOfTraining, input.sessionDate),
            eq(sheetSignups.pool, input.sessionPool),
          ));
        clearSessionsCache();
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({
        sessionDate: z.string(),
        sessionPool: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = ctx.user;
        const deleteDb = await db.getDb();
        if (!deleteDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        await deleteDb.delete(sheetSignups).where(and(
          eq(sheetSignups.email, (user.email ?? "").toLowerCase().trim()),
          eq(sheetSignups.dateOfTraining, input.sessionDate),
          eq(sheetSignups.pool, input.sessionPool),
        ));
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
      if (user.email) {
        const sheetUser = await findUserByEmail(user.email);
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
            image: sheetUser.image || "",
          };
        }
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
        image: "",
      };
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
      const trainingFees = mySignups
        .filter(s => s.activity !== "Membership Fee")
        .map(s => ({
          trainingDate: s.dateOfTraining,
          pool: s.pool,
          activity: s.activity,
          actualFee: s.actualFees,
        }));

      const membershipFees = mySignups
        .filter(s => s.activity === "Membership Fee")
        .map(s => ({
          date: s.dateTimeOfSignUp,  // date they signed up / paid
          activity: s.activity,
          actualFee: s.actualFees,
        }));

      const myPayments = myPaymentsRaw.map(p => ({ amount: p.amount, date: p.date }));

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

      // Update sheet_users (DB-primary)
      if (trialDb) {
        await trialDb.update(sheetUsers)
          .set({ memberStatus: "Trial", trialStartDate: fmt(today), trialEndDate: fmt(trialEnd) })
          .where(eq(sheetUsers.email, (user.email ?? "").toLowerCase().trim()));
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

      // Update sheet_users (DB-primary)
      const memberDb = await db.getDb();
      if (memberDb) {
        await memberDb.update(sheetUsers)
          .set({ memberStatus: "Member" })
          .where(eq(sheetUsers.email, (user.email ?? "").toLowerCase().trim()));
      }

      await db.upsertUser({
        openId: user.openId,
        memberStatus: "Member",
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
          if (input.trialStartDate !== undefined) userFields.trialStartDate = input.trialStartDate;
          if (input.trialEndDate !== undefined) userFields.trialEndDate = input.trialEndDate;
          if (input.dob !== undefined) userFields.dob = input.dob;
          if (Object.keys(userFields).length > 0) {
            await adminUsersDb.update(sheetUsers)
              .set(userFields)
              .where(eq(sheetUsers.email, input.email.toLowerCase().trim()));
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

        // Payments: match by email (col G) or paymentId (col F)
        let payments: typeof sheetPayments.$inferSelect[] = [];
        if (pidNorm) {
          const { or } = await import("drizzle-orm");
          payments = await actDb.select().from(sheetPayments)
            .where(or(eq(sheetPayments.email, emailNorm), eq(sheetPayments.paymentId, pidNorm)));
        } else {
          payments = await actDb.select().from(sheetPayments)
            .where(eq(sheetPayments.email, emailNorm));
        }
        payments = [...payments].sort((a, b) =>
          (new Date(b.date ?? "").getTime() || 0) - (new Date(a.date ?? "").getTime() || 0)
        );

        // Signups: match by email
        const signups = await actDb.select().from(sheetSignups)
          .where(eq(sheetSignups.email, emailNorm));
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
      return [...sessions].sort((a, b) => {
        const dA = new Date(a.trainingDate).getTime() || 0;
        const dB = new Date(b.trainingDate).getTime() || 0;
        return dB - dA;
      });
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
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.clubRole !== "Admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const sessDb = await db.getDb();
        if (!sessDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const { rowId, ...fields } = input;
        // Only include fields that were actually provided
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
        if (Object.keys(updates).length === 0) return { success: true };
        await sessDb.update(sheetSessions)
          .set(updates)
          .where(eq(sheetSessions.rowId, rowId));
        clearSessionsCache();
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
