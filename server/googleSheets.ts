/**
 * Google Sheets integration layer.
 * Reads data from the FATUWR Google Sheet via the Google Sheets API (service account).
 * Falls back to the public CSV export when GOOGLE_SERVICE_ACCOUNT_JSON is not set.
 * Sheet ID: 19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM
 */

import { google } from "googleapis";
import { ENV } from "./_core/env";

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
  /** The matched reference/name from the sheet (col F — "PaymentID Match") */
  paymentId: string;
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

async function fetchSheetRange(tabName: string): Promise<string[][]> {
  if (!ENV.googleServiceAccountJson) {
    // Fallback to public CSV for local dev without credentials
    const gid = Object.entries(TAB_NAMES).find(([, v]) => v === tabName)?.[0] as keyof typeof GIDS | undefined;
    if (!gid) throw new Error(`No GID mapping for tab: ${tabName}`);
    return fetchSheetCSVFallback(GIDS[gid]);
  }
  try {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: tabName,
    });
    return (response.data.values ?? []) as string[][];
  } catch (err: unknown) {
    const status = (err as any)?.response?.status ?? (err as any)?.status;
    const message = (err as any)?.message ?? String(err);
    console.error(`[Sheets] fetchSheetRange("${tabName}") failed — HTTP ${status ?? "?"}: ${message}`);
    // Re-throw so callers surface a proper error rather than returning stale/empty data silently
    throw err;
  }
}

// ─── CSV fallback (local dev without service account) ─────────────────────────

async function fetchSheetCSVFallback(gid: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "FATUWR-Training-Portal/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet data: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  return parseCSV(text);
}

let sessionsCache: { data: SessionRow[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function getSessions(): Promise<SessionRow[]> {
  if (sessionsCache && Date.now() - sessionsCache.timestamp < CACHE_TTL) {
    return sessionsCache.data;
  }

  const rows = await fetchSheetRange(TAB_NAMES.sessions);
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

  sessionsCache = { data: sessions, timestamp: Date.now() };
  return sessions;
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
  const rows = await fetchSheetRange(TAB_NAMES.user);
  if (rows.length < 2) return [];
  const users: UserRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;
    users.push({
      id: row[0] || "",
      name: row[1] || "",
      userEmail: row[2] || "",
      email: row[3] || "",
      image: row[4] || "",
      // Real sheet column layout (verified against live data):
      //   col F  (index 5)  = Club role
      //   col H  (index 7)  = Phone / Paynow (used as Payment ID)
      //   col J  (index 9)  = Membership status
      //   col K  (index 10) = Trial Membership Start Date
      //   col L  (index 11) = Trial Membership End Date
      clubRole: row[5] || "",
      paymentId: row[7] || "",
      memberStatus: row[9] || "Non-Member",
      trialStartDate: row[10] || "",
      trialEndDate: row[11] || "",
    });
  }
  return users;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const users = await getUsers();
  const normalizedEmail = email.toLowerCase().trim();
  return users.find(u =>
    u.email.toLowerCase().trim() === normalizedEmail ||
    u.userEmail.toLowerCase().trim() === normalizedEmail
  ) || null;
}

export async function getSignUpsForSession(sessionDate: string, pool: string): Promise<SignUpRow[]> {
  const rows = await fetchSheetRange(TAB_NAMES.signups);
  if (rows.length < 2) return [];
  const signups: SignUpRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 7) continue;
    const dateOfTraining = row[5] || "";
    const signupPool = row[4] || "";
    if (datesMatch(dateOfTraining, sessionDate) && signupPool.toLowerCase().trim() === pool.toLowerCase().trim()) {
      signups.push({
        name: row[0] || "",
        email: row[1] || "",
        paymentId: row[2] || "",
        dateTimeOfSignUp: row[3] || "",
        pool: signupPool,
        dateOfTraining,
        activity: row[6] || "",
        activityValue: row[7] || "",
        baseFee: parseNumber(row[8] || "0"),
        actualFees: parseNumber(row[9] || "0"),
        memberOnTrainingDate: row[10] || "",
      });
    }
  }
  return signups;
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
//   [3]  Amount        numeric, e.g. "100"
//   [4]  OTHR Message  the PayNow reference text the sender typed
//   [5]  PaymentID Match  matched name/handle, or "#N/A" if unmatched
//   [6]  Email         matched user email, or "#N/A" if unmatched
export async function getPayments(): Promise<PaymentRow[]> {
  const rows = await fetchSheetRange(TAB_NAMES.payments);
  if (rows.length < 2) return [];
  const payments: PaymentRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;
    const email = (row[6] || "").trim();
    // Skip rows where the payment hasn't been matched to a user yet
    if (!email || email === "#N/A") continue;
    const amount = parseNumber(row[3] || "0");
    if (amount === 0) continue; // skip zero-amount rows
    payments.push({
      paymentId: (row[5] || "").trim(),  // col F — matched name/reference
      amount,
      date: row[2] || "",                // col C — datetime string
      email: email.toLowerCase(),
    });
  }
  return payments;
}

export async function getAllSignupsByEmail(email: string): Promise<SignUpRow[]> {
  const rows = await fetchSheetRange(TAB_NAMES.signups);
  if (rows.length < 2) return [];
  const normalizedEmail = email.toLowerCase().trim();
  const signups: SignUpRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 7) continue;
    if ((row[1] || "").toLowerCase().trim() !== normalizedEmail) continue;
    signups.push({
      name: row[0] || "",
      email: row[1] || "",
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

export function clearSessionsCache(): void {
  sessionsCache = null;
}

export function convertDriveUrl(url: string): string {
  if (!url) return "";
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
  const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match2) return `https://drive.google.com/thumbnail?id=${match2[1]}&sz=w800`;
  return url;
}
