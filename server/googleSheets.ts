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
  venueCost: number;
  revenue: number;
  rainOff: string;
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
  membershipStartDate: string;
  trialStartDate: string;
  trialEndDate: string;
  dob: string;
}

export interface PaymentRow {
  /** DB row id — present when served from DB, absent when served from Sheets fallback */
  id?: number;
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
  id?: number; // DB row ID — present when read from DB, absent for Sheets-fallback rows
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

/**
 * Normalise any date string to YYYY-MM-DD for consistent DB storage.
 * Handles M/D/YYYY (Google Sheets), DD/MM/YYYY, and ISO formats.
 */
function toIsoDate(raw: string): string {
  if (!raw || raw === "NA") return raw;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  // M/D/YYYY or MM/DD/YYYY (Google Sheets default)
  const mdyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Fallback: let JS parse and reformat
  const date = new Date(raw);
  if (!isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }
  return raw;
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
      // col V (21) = Venue/pool cost, col W (22) = Revenue (historical, sheet-stored)
      venueCost: parseNumber(row[21] || "0"),
      revenue: parseNumber(row[22] || "0"),
      rainOff: "",  // no rainOff column in sheet; defaults to empty
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
    if (!row || row.length < 2) continue;
    // User sheet column mapping (0-indexed):
    //   A(0) = PaymentID   B(1) = name   C(2) = userEmail   D(3) = email
    //   E(4) = image       F(5) = clubRole                   H(7) = phone (ignored)
    //   J(9) = memberStatus   K(10) = trialStartDate   L(11) = trialEndDate
    //
    // Trial users often have no PaymentID so col D (email) may be blank — fall
    // back to col C (userEmail) so they aren't skipped during import.
    const email = (row[2] || "").toLowerCase().trim(); // col C = userEmail (primary)
    if (!email) continue; // skip rows with no email at all
    users.push({
      id: row[0] || "",        // col A = PaymentID (e.g. "mel", "hayley")
      name: row[1] || "",
      userEmail: email,
      email,
      image: row[4] || "",
      clubRole: row[5] || "",
      paymentId: row[0] || "",  // col A = PaymentID (same as id; col H is phone number)
      membershipStartDate: row[6] || "", // col G = Annual Membership Start
      memberStatus: row[9] || "Non-Member",
      trialStartDate: row[10] || "",
      trialEndDate: row[11] || "",
      dob: row[8] || "",        // col I = Date of Birth
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
      pool: (row[4] || "").trim(),
      dateOfTraining: toIsoDate(row[5] || ""),
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
    venueCost: r.venueCost ?? 0,
    revenue: r.revenue ?? 0,
    rainOff: r.rainOff ?? "",
  };
}

function dbPaymentToPaymentRow(r: any): PaymentRow {
  return {
    id: r.id,
    paymentId: r.paymentId ?? "",
    reference: r.reference ?? "",
    amount: r.amount ?? 0,
    date: r.date ?? "",
    email: r.email ?? "",
  };
}

function dbSignupToSignupRow(r: any): SignUpRow {
  return {
    id: r.id,
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
    membershipStartDate: r.membershipStartDate ?? "",
    trialStartDate: r.trialStartDate ?? "",
    trialEndDate: r.trialEndDate ?? "",
    dob: r.dob ?? "",
  };
}

// ─── 60-second in-process sessions cache ─────────────────────────────────────
// Only sessions are cached — other data (payments, signups, users) is never cached here.
// Busted by clearSessionsCache() which is called after any session mutation.
let _sessionsCacheData: SessionRow[] | null = null;
let _sessionsCacheExpiry = 0;
const SESSIONS_CACHE_TTL_MS = 60 * 1000; // 60 seconds

export async function getSessions(): Promise<SessionRow[]> {
  // Return cached data if still fresh
  if (_sessionsCacheData && Date.now() < _sessionsCacheExpiry) {
    return _sessionsCacheData;
  }
  try {
    const db = await getDb();
    if (db) {
      const rows = await db.select().from(sheetSessions);
      if (rows.length > 0) {
        const result = rows.map(dbSessionToSessionRow);
        _sessionsCacheData   = result;
        _sessionsCacheExpiry = Date.now() + SESSIONS_CACHE_TTL_MS;
        return result;
      }
    }
  } catch (e) {
    console.warn("[Sheets] DB read failed for sessions, falling back to Sheets API:", (e as any)?.message);
  }
  console.log("[Sheets] sessions DB empty — fetching from Sheets API");
  return fetchSheetsSessions();
}

/**
 * Parse a training-date string (any format: ISO "2026-04-24", "24 April 2026", etc.)
 * into an ISO date string "YYYY-MM-DD", or null on failure.
 */
function toIsoDateStr(dateStr: string): string | null {
  if (!dateStr) return null;
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10);
  // Try native parse (handles "24 April 2026", "April 24, 2026", etc.)
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    // Use UTC components to avoid DST/TZ shift mangling the calendar date
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}

/**
 * Build the UTC timestamp for a session start, treating the date and time as
 * Singapore local time (UTC+8).  Returns null if the date cannot be parsed.
 *
 * trainingTime examples: "7:30 PM – 9:30 PM", "19:30 - 21:30", "0745-0945"
 * When trainingTime is absent/unparseable, midnight SGT is used as the start
 * (conservative: session stays visible all day).
 */
function sessionStartUTC(trainingDate: string, trainingTime: string | null | undefined): number | null {
  const isoDate = toIsoDateStr(trainingDate);
  if (!isoDate) return null;

  let startHour = 0;
  let startMin  = 0;
  if (trainingTime) {
    const startStr = trainingTime.split(/[–\-]/)[0].trim();
    const m = startStr.match(/(\d{1,2}):?(\d{2})\s*(am|pm)?/i);
    if (m) {
      let h = parseInt(m[1], 10);
      const mins = parseInt(m[2], 10);
      const ampm = (m[3] || "").toLowerCase();
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      startHour = h;
      startMin  = mins;
    }
  }

  // Build datetime string with explicit SGT offset so JS parses it correctly
  // regardless of the server's local timezone (Railway runs in UTC).
  const hh  = String(startHour).padStart(2, "0");
  const mm  = String(startMin).padStart(2, "0");
  const dt  = new Date(`${isoDate}T${hh}:${mm}:00+08:00`);
  return isNaN(dt.getTime()) ? null : dt.getTime();
}

export async function getUpcomingSessions(): Promise<SessionRow[]> {
  const sessions = await getSessions();
  const now = Date.now();

  return sessions
    .filter(session => {
      const startMs = sessionStartUTC(session.trainingDate, session.trainingTime);
      // If date can't be parsed, hide the session
      if (startMs === null) return false;
      // Hide once 1 hour past the session start (in SGT)
      return now < startMs + 60 * 60 * 1000;
    })
    .sort((a, b) => {
      const msA = sessionStartUTC(a.trainingDate, a.trainingTime) ?? 0;
      const msB = sessionStartUTC(b.trainingDate, b.trainingTime) ?? 0;
      return msA - msB;
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
  const poolNorm = pool.toLowerCase().trim();
  const isoDate  = toIsoDate(sessionDate); // normalise to YYYY-MM-DD for index hit
  try {
    const db = await getDb();
    if (db) {
      // Use composite index idx_sheet_signups_pool_date — O(log n) instead of full scan
      const rows = await db.select().from(sheetSignups)
        .where(and(eq(sheetSignups.pool, poolNorm), eq(sheetSignups.dateOfTraining, isoDate)));
      // If indexed query returns results, use them directly; otherwise fall back to full
      // scan (handles legacy rows where pool/date casing differs or date wasn't normalised)
      if (rows.length > 0) return rows.map(dbSignupToSignupRow);
      // Secondary attempt: full scan (handles mixed casing / legacy date formats)
      const allSignups = await db.select().from(sheetSignups);
      if (allSignups.length > 0) {
        return allSignups
          .filter(s =>
            datesMatch(s.dateOfTraining ?? "", sessionDate) &&
            (s.pool ?? "").toLowerCase().trim() === poolNorm
          )
          .map(dbSignupToSignupRow);
      }
    }
  } catch (e) {
    console.warn("[Sheets] DB read failed for getSignUpsForSession, falling back:", (e as any)?.message);
  }
  // Fallback to Sheets API
  const rows = await fetchSheetsSignups();
  return rows.filter(s =>
    datesMatch(s.dateOfTraining, sessionDate) &&
    s.pool.toLowerCase().trim() === poolNorm
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
      // Use email index — avoids full table scan
      const rows = await db.select().from(sheetSignups)
        .where(eq(sheetSignups.email, normalizedEmail));
      if (rows.length > 0) {
        allSignups = rows.map(dbSignupToSignupRow);
      } else {
        // No rows for this email — could be paymentId-only rows; fetch all to be safe
        const allRows = await db.select().from(sheetSignups);
        allSignups = allRows.length > 0 ? allRows.map(dbSignupToSignupRow) : await fetchSheetsSignups();
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
    const rowPayRef = (s.paymentId || "").toLowerCase().trim();

    // If the row has a paymentId, ownership is determined by paymentId only.
    // This covers admin-created sign-ups for other users (admin's email on the row,
    // but the correct person's paymentId) and all historical Sheets rows.
    if (rowPayRef) {
      return Boolean(
        membershipFeeRefs &&
        membershipFeeRefs.size > 0 &&
        membershipFeeRefs.has(rowPayRef),
      );
    }

    // No paymentId on the row — fall back to email match.
    return rowEmail === normalizedEmail;
  }).map(s => ({
    ...s,
    email: s.email || normalizedEmail,
  }));
}

/** Bust the 60-second in-process sessions cache. Called after any session mutation. */
export function clearSessionsCache(): void {
  _sessionsCacheData   = null;
  _sessionsCacheExpiry = 0;
}

export function convertDriveUrl(url: string): string {
  if (!url) return "";
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
  const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match2) return `https://drive.google.com/thumbnail?id=${match2[1]}&sz=w800`;
  return url;
}


/**
 * Fetches all rows from the "Resources" tab in the Google Sheet.
 * Returns raw string[][] — callers pick the rows they need.
 */
export async function fetchResourcesTab(): Promise<string[][]> {
  return fetchSheetRange("Resources");
}
