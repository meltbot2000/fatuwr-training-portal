import { and, eq, gt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, otpCodes } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }
    if (user.memberStatus !== undefined) {
      values.memberStatus = user.memberStatus;
      updateSet.memberStatus = user.memberStatus;
    }
    if (user.paymentId !== undefined) {
      values.paymentId = user.paymentId;
      updateSet.paymentId = user.paymentId;
    }
    if (user.clubRole !== undefined) {
      values.clubRole = user.clubRole;
      updateSet.clubRole = user.clubRole;
    }
    if (user.trialStartDate !== undefined) {
      values.trialStartDate = user.trialStartDate;
      updateSet.trialStartDate = user.trialStartDate;
    }
    if (user.trialEndDate !== undefined) {
      values.trialEndDate = user.trialEndDate;
      updateSet.trialEndDate = user.trialEndDate;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

function fmtDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export async function createOtp(email: string, code: string, expiresAt: Date): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const expiresAtStr = fmtDatetime(expiresAt);
  const createdAtStr = fmtDatetime(new Date());
  try {
    await db.execute(sql`INSERT INTO otp_codes (email, code, expiresAt, used, createdAt) VALUES (${email}, ${code}, ${expiresAtStr}, 0, ${createdAtStr})`);
  } catch (err: unknown) {
    // Log the full error cause so the real MySQL error is visible in Railway logs
    const cause = (err as { cause?: unknown })?.cause;
    console.error("[OTP] createOtp failed — top-level:", err);
    if (cause) console.error("[OTP] createOtp MySQL cause:", cause);
    throw err;
  }
}

export async function getLatestOtp(email: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(otpCodes)
    .where(and(eq(otpCodes.email, email), eq(otpCodes.used, 0)))
    .orderBy(otpCodes.id)
    .limit(1);
  return result.length > 0 ? result[0].code : null;
}

export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const result = await db.select().from(otpCodes).where(
    and(
      eq(otpCodes.email, email),
      eq(otpCodes.code, code),
      eq(otpCodes.used, 0),
      gt(otpCodes.expiresAt, now)
    )
  ).limit(1);

  if (result.length === 0) return false;
  await db.update(otpCodes).set({ used: 1 }).where(eq(otpCodes.id, result[0].id));
  return true;
}
