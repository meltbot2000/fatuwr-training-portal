/**
 * Google Sheets integration layer.
 * Reads data from the FATUWR Google Sheet via the Google Sheets API (service account).
 * Falls back to the public CSV export when GOOGLE_SERVICE_ACCOUNT_JSON is not set.
 * Sheet ID: 19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM
 *
 * Read strategy (DB-first):
 *  1. Try Railway MySQL DB (sheet_* cache tables) — < 5 ms
 *  2. Fall back to Sheets API if DB is empty (cold start / first boot)
 * The DB is kept fresh by server/sync.ts (5-min background + GAS webhook).
 *
 * The fetchSheets*() exports are called only by sync.ts to populate the DB.
 */

import { google } from "googleapis";
import { and, eq } from "drizzle-orm";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import {
  sheetSessions,
  sheetPayments,
  sheetSignups,
  sheetUsers,
} from "../drizzle/schema";

const SHEET_ID = "19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM";

const TAB_NAMES = {
  sessions: "Training Sessions",
  signups:  "Training Sign-ups",
  user:     "User",
  payments: "Payments",
};

// GIDs kept for the CSV fallback only
const GIDS = {
  sessions: "1672478998",
  signups:  "1447548009",
  user:     "920623124",
  payments: "1977569344",
};

export interface SessionRow {
  rowIndex: number;
  trainingDate: string;
  day: string;
  trainingTime: string;
  pool: string;
  poolImageUrl: string;
  memberFee: number;
  nonMemberFee: number;
  memberSwimFee: number;
  nonMemberSwimFee: number;
  studentFee: number;
  studentSwimFee: number;
  trainerFee: number;
  notes: string;
  rowId: string;
  attendance: number;
  isClosed: string;
  trainingObjective: string;
  signUpCloseTime: string;
}

export interface UserRow {
  id: string;
  name: string;
  userEmail: string;
  email: string;
  image: string;
  paymentId: string;
  memberStatus: string;
  clubRole: string;
  trialStartDate: string;
  trialEndDate: string;
}

export interface PaymentRow {
  /** The matched reference/name from the sheet (col F — "PaymentID Match"), or "" if unmatched */
  paymentId: string;
  /** Raw PayNow reference text the sender typed (col E — "OTHR Message") */
  reference: string;
  amount: number;
  /** Raw date string from col C, e.g. "3/20/2026 16:47:13" */
  date: string;
  /** Matched email from col G — used to filter payments per user */
  email: string;
}

export interface SignUpRow {
  name: string;
  email: string;
  paymentId: string;
  dateTimeOfSignUp: string;
  pool: string;
  dateOfTraining: string;
  activity: string;
  activityValue: string;
  baseFee: number;
  actualFees: number;
  memberOnTrainingDate: string;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(csvText: string): string[][] {
  const lines = csvText.split("\n");
  return lines.filter(line => line.trim().length > 0).map(parseCSVLine);
}

function parseNumber(val: string): number {
  const cleaned = val.replace(/[$,]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ─── Sheets API (primary) ─────────────────────────────────────────────────────

// User-facing fallback timeout (keep snappy; DB is the primary path)
const SHEETS_TIMEOUT_MS = 15_000;
// Background sync timeout — longer because sync runs outside the request path
const SHEETS_SYNC_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = SHEETS_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`[Sheets] ${label} timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

// Singleton auth client — reuse across requests so tokens are cached & refreshed
let _authClient: InstanceType<typeof google.auth.GoogleAuth> | null = null;

function getAuthClient() {
  if (_authClient) return _authClient;

  let creds: Record<string, unknown>;
  try {
    creds = JSON.parse(ENV.googleServiceAccountJson);
  } catch (e) {
    throw new Error(`[Sheets] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON: ${e}`);
  }

  // Env vars sometimes double-escape the newlines in the private key.
  // Normalise them so the key is valid PEM.
  if (typeof creds.private_key === "string") {
    creds.private_key = (creds.private_key as string).replace(/\\n/g, "\n");
  }

  _authClient = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return _authClient;
}

async function fetchSheetRange(tabName: string, timeoutMs = SHEETS_TIMEOUT_MS): Promise<string[][]> {
  if (!ENV.googleServiceAccountJson) {
    // Fallback to public CSV for local dev without credentials
    const gid = Object.entries(TAB_NAMES).find(([, v]) => v === tabName)?.[0] as keyof typeof GIDS | undefined;
    if (!gid) throw new Error(`No GID mapping for tab: ${tabName}`);
    return fetchSheetCSVFallback(GIDS[gid]);
  }
  try {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const response = await withTimeout(
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: tabName }),
      `fetchSheetRange("${tabName}")`,
      timeoutMs
    );
    return (response.data.values ?? []) as string[][];
  } catch (err: unknown) {
    const status = (err as any)?.response?.status ?? (err as any)?.status;
    const message = (err as any)?.message ?? String(err);
    console.error(`[Sheets] fetchSheetRange("${tabName}") failed — HTTP ${status ?? "?"}: ${message}`);
    throw err;
  }
}

// ─── CSV fallback (local dev without service account) ─────────────────────────

async function fetchSheetCSVFallback(gid: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SHEETS_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "FATUWR-Training-Portal/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch sheet data: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    return parseCSV(text);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Raw Sheets fetch functions (used by sync.ts to populate DB) ──────────────

/** Fetch ALL sessions directly from Sheets. Used by sync.ts only. */
export async function fetchSheetsSessions(): Promise<Omit<SessionRow, never>[]> {
  const rows = await fetchSheetRange(TAB_NAMES.sessions, SHEETS_SYNC_TIMEOUT_MS);
  if (rows.length < 2) return [];

  const sessions: SessionRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 5) continue;
    const day = row[1] || "";
    if (day.toLowerCase() === "membership") continue;
    const trainingDate = row[0] || "";
    if (!trainingDate) continue;

    sessions.push({
      rowIndex: i + 1,
      trainingDate,
      day,
      trainingTime: row[2] || "",
      pool: row[3] || "",
      poolImageUrl: row[4] || "",
      memberFee: parseNumber(row[5] || "0"),
      nonMemberFee: parseNumber(row[6] || "0"),
      memberSwimFee: parseNumber(row[7] || "0"),
      nonMemberSwimFee: parseNumber(row[8] || "0"),
      studentFee: parseNumber(row[9] || "0"),
      studentSwimFee: parseNumber(row[10] || "0"),
      trainerFee: parseNumber(row[11] || "0"),
      notes: row[12] || "",
      rowId: row[13] || `row-${i}`,
      attendance: parseNumber(row[14] || "0"),
      isClosed: row[15] || "",
      trainingObjective: row[16] || "",
      signUpCloseTime: row[19] || "",
    });
  }
  return sessions;
}

/** Fetch ALL users directly from Sheets. Used by sync.ts and as fallback. */
export async function fetchSheetsUsers(): Promise<UserRow[]> {
  const rows = await fetchSheetRange(TAB_NAMES.user, SHEETS_SYNC_TIMEOUT_MS);
  if (rows.length < 2) return [];

  const users: UserRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;
    const email = (row[3] || "").toLowerCase().trim();
    if (!email) continue; // skip rows with no email
    users.push({
      id: row[0] || "",        // col A — sheet's own ID (stored as sheetId in DB)
      name: row[1] || "",
      userEmail: row[2] || "",
      email,
      image: row[4] || "",
      clubRole: row[5] || "",
      paymentId: row[7] || "",
      memberStatus: row[9] || "Non-Member",
      trialStartDate: row[10] || "",
      trialEndDate: row[11] || "",
    });
  }
  return users;
}

/** Fetch ALL payments directly from Sheets. Used by sync.ts only. */
export async function fetchSheetsPayments(): Promise<PaymentRow[]> {
  const rows = await fetchSheetRange(TAB_NAMES.payments, SHEETS_SYNC_TIMEOUT_MS);
  if (rows.length < 2) return [];

  const payments: PaymentRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;
    const amount = parseNumber(row[3] || "0");
    if (amount === 0) continue;
    const rawMatched = (row[5] || "").trim();
    const paymentId = (!rawMatched || rawMatched === "#N/A") ? "" : rawMatched;
    const reference = (row[4] || "").trim();
    const rawEmail = (row[6] || "").trim();
    const email = (!rawEmail || rawEmail === "#N/A" || rawEmail === "undefined") ? "" : rawEmail.toLowerCase();
    payments.push({ paymentId, reference, amount, date: row[2] || "", email });
  }
  return payments;
}

/** Fetch ALL signup rows directly from Sheets. Used by sync.ts only. */
export async function fetchSheetsSignups(): Promise<SignUpRow[]> {
  const rows = await fetchSheetRange(TAB_NAMES.signups, SHEETS_SYNC_TIMEOUT_MS);
  if (rows.length < 2) return [];

  const signups: SignUpRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 7) continue;
    signups.push({
      name: row[0] || "",
      email: (row[1] || "").toLowerCase().trim(),
      paymentId: row[2] || "",
      dateTimeOfSignUp: row[3] || "",
      pool: row[4] || "",
      dateOfTraining: row[5] || "",
      activity: row[6] || "",
      activityValue: row[7] || "",
      baseFee: parseNumber(row[8] || "0"),
      actualFees: parseNumber(row[9] || "0"),
      memberOnTrainingDate: row[10] || "",
    });
  }
  return signups;
}

// ─── DB-first read functions (app-facing) ─────────────────────────────────────

function dbSessionToSessionRow(r: any): SessionRow {
  return {
    rowIndex: r.rowIndex,
    trainingDate: r.trainingDate ?? "",
    day: r.day ?? "",
    trainingTime: r.trainingTime ?? "",
    pool: r.pool ?? "",
    poolImageUrl: r.poolImageUrl ?? "",
    memberFee: r.memberFee ?? 0,
    nonMemberFee: r.nonMemberFee ?? 0,
    memberSwimFee: r.memberSwimFee ?? 0,
    nonMemberSwimFee: r.nonMemberSwimFee ?? 0,
    studentFee: r.studentFee ?? 0,
    studentSwimFee: r.studentSwimFee ?? 0,
    trainerFee: r.trainerFee ?? 0,
    notes: r.notes ?? "",
    rowId: r.rowId ?? "",
    attendance: r.attendance ?? 0,
    isClosed: r.isClosed ?? "",
    trainingObjective: r.trainingObjective ?? "",
    signUpCloseTime: r.signUpCloseTime ?? "",
  };
}

function dbPaymentToPaymentRow(r: any): PaymentRow {
  return {
    paymentId: r.paymentId ?? "",
    reference: r.reference ?? "",
    amount: r.amount ?? 0,
    date: r.date ?? "",
    email: r.email ?? "",
  };
}

function dbSignupToSignupRow(r: any): SignUpRow {
  return {
    name: r.name ?? "",
    email: r.email ?? "",
    paymentId: r.paymentId ?? "",
    dateTimeOfSignUp: r.dateTimeOfSignUp ?? "",
    pool: r.pool ?? "",
    dateOfTraining: r.dateOfTraining ?? "",
    activity: r.activity ?? "",
    activityValue: r.activityValue ?? "",
    baseFee: r.baseFee ?? 0,
    actualFees: r.actualFees ?? 0,
    memberOnTrainingDate: r.memberOnTrainingDate ?? "",
  };
}

function dbUserToUserRow(r: any): UserRow {
  return {
    id: r.sheetId ?? "",
    name: r.name ?? "",
    userEmail: r.userEmail ?? "",
    email: r.email ?? "",
    image: r.image ?? "",
    paymentId: r.paymentId ?? "",
    memberStatus: r.memberStatus ?? "Non-Member",
    clubRole: r.clubRole ?? "",
    trialStartDate: r.trialStartDate ?? "",
    trialEndDate: r.trialEndDate ?? "",
  };
}

export async function getSessions(): Promise<SessionRow[]> {
  try {
    const db = await getDb();
    if (db) {
      const rows = await db.select().from(sheetSessions);
      if (rows.length > 0) return rows.map(dbSessionToSessionRow);
    }
  } catch (e) {
    console.warn("[Sheets] DB read failed for sessions, falling back to Sheets API:", (e as any)?.message);
  }
  console.log("[Sheets] sessions DB empty — fetching from Sheets API");
  return fetchSheetsSessions();
}

export async function getUpcomingSessions(): Promise<SessionRow[]> {
  const sessions = await getSessions();
  const now = new Date();

  return sessions.filter(session => {
    if (session.isClosed && session.isClosed.trim().length > 0) return false;
    const sessionDate = parseSessionDate(session.trainingDate);
    if (!sessionDate || sessionDate < now) return false;
    if (session.signUpCloseTime) {
      const closeTime = parseCloseTime(session.signUpCloseTime);
      if (closeTime && closeTime < now) return false;
    }
    return true;
  }).sort((a, b) => {
    const dateA = parseSessionDate(a.trainingDate);
    const dateB = parseSessionDate(b.trainingDate);
    if (!dateA || !dateB) return 0;
    return dateA.getTime() - dateB.getTime();
  });
}

function parseSessionDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  return date;
}

function parseCloseTime(timeStr: string): Date | null {
  if (!timeStr) return null;
  const parts = timeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (parts) {
    const [, day, month, year, hour, minute] = parts;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
  }
  const date = new Date(timeStr);
  if (!isNaN(date.getTime())) return date;
  return null;
}

export async function getUsers(): Promise<UserRow[]> {
  try {
    const db = await getDb();
    if (db) {
      const rows = await db.select().from(sheetUsers);
      if (rows.length > 0) return rows.map(dbUserToUserRow);
    }
  } catch (e) {
    console.warn("[Sheets] DB read failed for users, falling back to Sheets API:", (e as any)?.message);
  }
  console.log("[Sheets] users DB empty — fetching from Sheets API");
  return fetchSheetsUsers();
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const normalizedEmail = email.toLowerCase().trim();
  try {
    const db = await getDb();
    if (db) {
      const rows = await db.select().from(sheetUsers).where(eq(sheetUsers.email, normalizedEmail));
      if (rows.length > 0) return dbUserToUserRow(rows[0]);
      // Also check userEmail column
      const rows2 = await db.select().from(sheetUsers).where(eq(sheetUsers.userEmail, normalizedEmail));
      if (rows2.length > 0) return dbUserToUserRow(rows2[0]);
      // If DB has rows but no match, user genuinely not found
      const total = await db.select().from(sheetUsers);
      if (total.length > 0) return null;
    }
  } catch (e) {
    console.warn("[Sheets] DB read failed for findUserByEmail, falling back to Sheets API:", (e as any)?.message);
  }
  // Fallback to Sheets API
  const users = await fetchSheetsUsers();
  return users.find(u =>
    u.email.toLowerCase().trim() === normalizedEmail ||
    u.userEmail.toLowerCase().trim() === normalizedEmail
  ) || null;
}

export async function getSignUpsForSession(sessionDate: string, pool: string): Promise<SignUpRow[]> {
  try {
    const db = await getDb();
    if (db) {
      const allSignups = await db.select().from(sheetSignups);
      if (allSignups.length > 0) {
        return allSignups
          .filter(s =>
            datesMatch(s.dateOfTraining ?? "", sessionDate) &&
            (s.pool ?? "").toLowerCase().trim() === pool.toLowerCase().trim()
          )
          .map(dbSignupToSignupRow);
      }
    }
  } catch (e) {
    console.warn("[Sheets] DB read failed for getSignUpsForSession, falling back:", (e as any)?.message);
  }
  // Fallback
  const rows = await fetchSheetsSignups();
  return rows.filter(s =>
    datesMatch(s.dateOfTraining, sessionDate) &&
    s.pool.toLowerCase().trim() === pool.toLowerCase().trim()
  );
}

function datesMatch(date1: string, date2: string): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
    return d1.toDateString() === d2.toDateString();
  }
  return date1.trim().toLowerCase() === date2.trim().toLowerCase();
}

// Real Payments tab column layout (verified against live sheet):
//   [0]  Maybank Payment Message (raw email body)
//   [1]  Subject
//   [2]  Date          e.g. "3/20/2026 16:47:13"
//   [3]  Amount        numeric, e.g. "100" — carry-over rows may have "$7.00" format
//   [4]  OTHR Message  the PayNow reference text the sender typed
//   [5]  PaymentID Match  matched name/handle, or "#N/A" if unmatched
//   [6]  Email         matched user email, or "#N/A"/absent for carry-over rows
export async function getPayments(): Promise<PaymentRow[]> {
  try {
    const db = await getDb();
    if (db) {
      const rows = await db.select().from(sheetPayments);
      if (rows.length > 0) return rows.map(dbPaymentToPaymentRow);
    }
  } catch (e) {
    console.warn("[Sheets] DB read failed for payments, falling back to Sheets API:", (e as any)?.message);
  }
  console.log("[Sheets] payments DB empty — fetching from Sheets API");
  return fetchSheetsPayments();
}

/**
 * Returns all sign-up rows for a given email.
 */
export async function getAllSignupsByEmail(
  email: string,
  membershipFeeRefs?: Set<string>,
): Promise<SignUpRow[]> {
  const normalizedEmail = email.toLowerCase().trim();

  let allSignups: SignUpRow[];
  try {
    const db = await getDb();
    if (db) {
      const rows = await db.select().from(sheetSignups);
      if (rows.length > 0) {
        allSignups = rows.map(dbSignupToSignupRow);
      } else {
        allSignups = await fetchSheetsSignups();
      }
    } else {
      allSignups = await fetchSheetsSignups();
    }
  } catch (e) {
    console.warn("[Sheets] DB read failed for getAllSignupsByEmail, falling back:", (e as any)?.message);
    allSignups = await fetchSheetsSignups();
  }

  return allSignups.filter(s => {
    const rowEmail = (s.email || "").toLowerCase().trim();
    const activity = s.activity || "";
    const rowPayRef = (s.paymentId || "").toLowerCase().trim();

    const matchByEmail = rowEmail === normalizedEmail;
    const matchByRef = Boolean(
      membershipFeeRefs &&
      membershipFeeRefs.size > 0 &&
      !rowEmail &&
      activity === "Membership Fee" &&
      rowPayRef &&
      membershipFeeRefs.has(rowPayRef),
    );
    return matchByEmail || matchByRef;
  }).map(s => ({
    ...s,
    email: s.email || normalizedEmail,
  }));
}

/** No-op kept for backward compatibility — DB cache is now the cache layer. */
export function clearSessionsCache(): void {
  // Intentionally empty: cache invalidation is handled by syncTab() in sync.ts,
  // called directly from routers.ts after each mutation.
}

export function convertDriveUrl(url: string): string {
  if (!url) return "";
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
  const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match2) return `https://drive.google.com/thumbnail?id=${match2[1]}&sz=w800`;
  return url;
}
