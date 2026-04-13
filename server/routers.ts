import { COOKIE_NAME } from "@shared/const";
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
import { nanoid } from "nanoid";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
 *
 * This handles the "PATCH Carry over from 2025" rows that were migrated without
 * the email formula, so a user's full payment history is always captured.
 */
async function getMyPayments(email: string, allPayments?: Awaited<ReturnType<typeof getPayments>>) {
  const payments = allPayments ?? await getPayments();
  // Pass 1: direct email match
  const byEmail = payments.filter(p => p.email === email);
  // Collect the user's known payment refs from pass-1 rows
  const myRefs = new Set(byEmail.map(p => p.paymentId.toLowerCase().trim()).filter(Boolean));
  // Pass 2: carry-over rows (no email) whose ref is in the user's known refs
  const byRef = payments.filter(p => !p.email && p.paymentId && myRefs.has(p.paymentId.toLowerCase().trim()));
  return { myPayments: [...byEmail, ...byRef], myPaymentRefs: myRefs };
}

function generatePaymentId(name: string, existingIds: Set<string>): string {
  const firstName = name.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "");
  const base = firstName.slice(0, 8) || "user";
  if (!existingIds.has(base)) return base;
  for (let n = 2; n <= 99; n++) {
    const candidate = `${base}${n}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  // Fallback: append a short random suffix
  return `${base}${nanoid(4)}`;
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

          if (!sheetUser) {
            try {
              await appsScript.createUser({ name, email, paymentId });
            } catch (e) {
              console.warn("[GAS] createUser failed (non-blocking):", e);
            }
          }
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
          expiresInMs: ONE_WEEK_MS,
          name: user.name || "",
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_WEEK_MS });

        return {
          success: true,
          isNewUser,
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

        await appsScript.submitSignUp({
          name: input.name,
          email: user.email ?? "",
          trainingDate: input.sessionDate,
          pool: input.sessionPool,
          activity: input.activity,
          baseFee: input.fee,
          actualFee: input.fee,
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
        await appsScript.editSignup({
          email: user.email ?? "",
          trainingDate: input.sessionDate,
          pool: input.sessionPool,
          activity: input.activity,
          baseFee: input.baseFee,
          actualFee: input.actualFee,
        });
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
        await appsScript.deleteSignup({
          email: user.email ?? "",
          trainingDate: input.sessionDate,
          pool: input.sessionPool,
        });
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

      const allPayments = await getPayments();
      const { myPayments, myPaymentRefs } = await getMyPayments(email, allPayments);
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
      const { myPayments: myPaymentsRaw, myPaymentRefs } = await getMyPayments(email, allPayments);
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
      // Update User tab membership status + trial dates
      await appsScript.updateTrialSignup(user.email ?? "");
      // Record the trial membership fee in Training Sign-ups (email-stamped, not manual)
      await appsScript.addMembershipSignup({
        email: user.email ?? "",
        name: user.name ?? "",
        activity: "Trial Membership",
        actualFee: 10,
      });

      const today = new Date();
      const trialEnd = new Date(today);
      trialEnd.setDate(trialEnd.getDate() + 30);
      const fmt = (d: Date) => {
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        return `${dd}/${mm}/${d.getFullYear()}`;
      };

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
      await appsScript.updateMemberSignup(user.email ?? "");

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
        memberStatus: z.string().optional(),
        clubRole: z.string().optional(),
        trialStartDate: z.string().optional(),
        trialEndDate: z.string().optional(),
        /** When setting memberStatus to "Member", optionally record the membership fee in Training Sign-ups */
        membershipFee: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.clubRole !== "Admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        await appsScript.updateUser({ email: input.email, memberStatus: input.memberStatus, clubRole: input.clubRole });

        // When promoting to Member and a fee is provided, log it in Training Sign-ups
        if (input.memberStatus === "Member" && input.membershipFee && input.membershipFee > 0) {
          const targetUser = await findUserByEmail(input.email);
          await appsScript.addMembershipSignup({
            email: input.email,
            name: targetUser?.name ?? "",
            activity: "Membership Fee",
            actualFee: input.membershipFee,
          });
        }

        const dbUser = await db.getUserByEmail(input.email.toLowerCase().trim());
        if (dbUser) {
          await db.upsertUser({
            openId: dbUser.openId,
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
        await appsScript.addSession(input);
        clearSessionsCache();
        return { success: true };
      }),

    closeSession: protectedProcedure
      .input(z.object({ rowId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.clubRole !== "Admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        await appsScript.closeSession({ rowId: input.rowId });
        clearSessionsCache();
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
