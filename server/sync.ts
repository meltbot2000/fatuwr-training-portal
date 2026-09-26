/**
 * Sheets → DB sync service.
 *
 * DB-primary tabs (sessions, signups, users):
 *   The app writes directly to these DB tables. Background sync never
 *   overwrites them. On first deploy (empty table), seedIfEmpty() pulls
 *   data from Sheets once so historical records are available immediately.
 *
 * Sheets-managed tabs (payments):
 *   GAS writes to Sheets; DB is kept in sync every 5 minutes automatically.
 *
 * Manual re-seed (admin UI "Import from Sheets"):
 *   forceSyncTab() bypasses the DB-primary guard and does a full
 *   DELETE + INSERT from Sheets. Use this after migrating or if you
 *   need to reset a table from the Sheet.
 */

import { getDb } from "./db";
import {
  sheetSessions,
  sheetPayments,
  sheetSignups,
  sheetUsers,
} from "../drizzle/schema";
import {
  fetchSheetsSessions,
  fetchSheetsPayments,
  fetchSheetsSignups,
  fetchSheetsUsers,
  clearSessionsCache,
  clearPaymentsCache,
} from "./googleSheets";
import { sql, eq, and, lte, ne, inArray } from "drizzle-orm";

export type SyncTab = "sessions" | "payments" | "signups" | "users";

/**
 * DB-primary tabs: the app owns these tables. The background 5-min sync
 * skips them to avoid overwriting in-app changes.
 *
 * - sessions : add/close/edit all go directly to DB
 * - signups  : sign-ups written directly to DB
 * - users    : member status / role edits written directly to DB
 *
 * payments is NOT in this set — it is still written by the GAS Maybank
 * email parser and synced into DB every 5 minutes.
 */
export const DB_PRIMARY_TABS = new Set<SyncTab>(["sessions", "signups", "users"]);

const syncStatus: Record<SyncTab, { lastSync: number; error: string | null }> = {
  sessions: { lastSync: 0, error: null },
  payments:  { lastSync: 0, error: null },
  signups:   { lastSync: 0, error: null },
  users:     { lastSync: 0, error: null },
};

// ─── Core sync logic ──────────────────────────────────────────────────────────

async function runSync(tab: SyncTab, db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<void> {
  if (tab === "sessions") {
    const rows = await fetchSheetsSessions();
    await db.transaction(async (tx) => {
      await tx.delete(sheetSessions);
      if (rows.length) await tx.insert(sheetSessions).values(rows);
    });
  } else if (tab === "payments") {
    const rows = await fetchSheetsPayments();
    await db.transaction(async (tx) => {
      await tx.delete(sheetPayments);
      if (rows.length) await tx.insert(sheetPayments).values(rows);
    });
    clearPaymentsCache(); // the in-process payments cache now holds deleted rows
  } else if (tab === "signups") {
    const rows = await fetchSheetsSignups();
    await db.transaction(async (tx) => {
      await tx.delete(sheetSignups);
      if (rows.length) await tx.insert(sheetSignups).values(rows);
    });
    clearSessionsCache(); // cached attendee lists now hold deleted row ids
  } else if (tab === "users") {
    const rows = await fetchSheetsUsers();
    await db.transaction(async (tx) => {
      await tx.delete(sheetUsers);
      if (rows.length) {
        await tx.insert(sheetUsers).values(
          rows.map(u => ({
            sheetId: u.id,
            name: u.name,
            userEmail: u.userEmail,
            email: u.email,
            image: u.image,
            paymentId: u.paymentId,
            memberStatus: u.memberStatus,
            clubRole: u.clubRole,
            membershipStartDate: u.membershipStartDate ?? "",
            trialStartDate: u.trialStartDate,
            trialEndDate: u.trialEndDate,
            dob: u.dob ?? "",
          }))
        );
      }
    });
  }
  syncStatus[tab] = { lastSync: Date.now(), error: null };
  console.log(`[Sync] ${tab} synced OK at ${new Date().toISOString()}`);
}

// ─── Public sync functions ────────────────────────────────────────────────────

/**
 * Regular sync — respects DB_PRIMARY_TABS guard.
 * Called by background interval and GAS webhook (payments only in practice).
 */
export async function syncTab(tab: SyncTab): Promise<void> {
  if (DB_PRIMARY_TABS.has(tab)) {
    console.log(`[Sync] ${tab} is DB-primary — skipping Sheet→DB sync`);
    return;
  }
  const db = await getDb();
  if (!db) {
    console.warn(`[Sync] DB not available — skipping ${tab} sync`);
    return;
  }
  try {
    await runSync(tab, db);
  } catch (err: any) {
    syncStatus[tab].error = err?.message ?? String(err);
    console.error(`[Sync] ${tab} failed:`, err?.message ?? err);
  }
}

/**
 * Force sync — bypasses DB_PRIMARY_TABS guard.
 * Use for:
 *   - Initial migration seed (import existing Sheet data into DB)
 *   - Manual re-seed from admin UI after data corrections in the Sheet
 */
export async function forceSyncTab(tab: SyncTab): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  console.log(`[Sync] Force-syncing ${tab} from Sheets (bypassing DB-primary guard)…`);
  await runSync(tab, db);
}

/**
 * Seed a DB-primary table from Sheets if it is currently empty.
 * Called on server startup so a fresh deployment auto-populates from
 * existing Sheet data without any manual admin action.
 */
async function seedIfEmpty(tab: SyncTab): Promise<void> {
  const db = await getDb();
  if (!db) return;

  let count = 0;
  try {
    if (tab === "sessions") {
      const [r] = await db.select({ c: sql<number>`COUNT(*)` }).from(sheetSessions);
      count = Number(r?.c ?? 0);
    } else if (tab === "signups") {
      const [r] = await db.select({ c: sql<number>`COUNT(*)` }).from(sheetSignups);
      count = Number(r?.c ?? 0);
    } else if (tab === "users") {
      const [r] = await db.select({ c: sql<number>`COUNT(*)` }).from(sheetUsers);
      count = Number(r?.c ?? 0);
    }
  } catch (err: any) {
    console.error(`[Seed] count check for ${tab} failed:`, err?.message);
    return;
  }

  if (count > 0) {
    console.log(`[Seed] ${tab} already has ${count} rows — skipping initial seed`);
    return;
  }

  console.log(`[Seed] ${tab} is empty — seeding from Sheets…`);
  try {
    await runSync(tab, db!);
    console.log(`[Seed] ${tab} seeded OK`);
  } catch (err: any) {
    console.error(`[Seed] ${tab} seed failed:`, err?.message);
  }
}

// ─── Trial expiry ─────────────────────────────────────────────────────────────

/**
 * Parse any date string into a JS Date (server-side mirror of client dateUtils).
 * Handles ISO timestamps, YYYY-MM-DD, DD/MM/YYYY, M/D/YYYY.
 */
function parseAnyDateServer(str: string): Date | null {
  if (!str || str === "NA" || str === "N/A") return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const ddmm = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmm) {
    const [, dd, mm, yyyy] = ddmm.map(Number);
    const d = new Date(yyyy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy.map(Number);
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? null : date;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return null;
}

/**
 * Expire trial memberships: set memberStatus = "Non-Member" for any user whose
 * trialEndDate is in the past and who is still marked as "Trial".
 * Runs at startup and every 24 hours.
 */
/**
 * Establish the MySQL connection at boot. `SELECT 1` is the cheapest way to make the pool
 * actually dial out; without it the pool exists but connects on the first real query.
 */
async function warmDb(): Promise<void> {
  const started = Date.now();
  try {
    const db = await getDb();
    if (!db) return;
    await db.execute(sql`SELECT 1`);
    console.log(`[DB] Connection warmed in ${Date.now() - started}ms`);
  } catch (err: any) {
    console.warn("[DB] Warm-up failed (will connect on first request):", err?.message);
  }
}

async function expireTrialMemberships(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const trialUsers = await db
      .select({ id: sheetUsers.id, trialEndDate: sheetUsers.trialEndDate })
      .from(sheetUsers)
      .where(eq(sheetUsers.memberStatus, "Trial"));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiredIds: number[] = [];
    for (const u of trialUsers) {
      const end = parseAnyDateServer(u.trialEndDate || "");
      if (end && end < today) expiredIds.push(u.id);
    }

    if (expiredIds.length === 0) {
      console.log("[TrialExpiry] No expired trials found.");
      return;
    }

    // One UPDATE per batch of 100 — this used to loop and issue one UPDATE per member.
    // At ~250ms per round trip to the Railway MySQL, 40 expired trials meant 10 seconds of
    // serialised writes during boot, while the first visitor was already waiting.
    for (let i = 0; i < expiredIds.length; i += 100) {
      const batch = expiredIds.slice(i, i + 100);
      await db.update(sheetUsers)
        .set({ memberStatus: "Non-Member" })
        .where(inArray(sheetUsers.id, batch));
    }
    console.log(`[TrialExpiry] Expired ${expiredIds.length} trial membership(s) → Non-Member`);
  } catch (err: any) {
    console.error("[TrialExpiry] Error:", err?.message);
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;  // 6 hours (fallback only — GAS webhook is primary for real-time)
const DAY_MS           = 24 * 60 * 60 * 1000; // 24 hours

export function startBackgroundSync(): void {
  // Open the DB connection now rather than on the first request. drizzle() builds the pool
  // lazily, so before this the first visitor after every deploy paid the MySQL connect
  // (~1s on this link) on top of their query. Same single connection either way — it just
  // happens while nobody is waiting.
  void warmDb();

  // Seed DB-primary tables from Sheets if empty (fresh deployment / first run)
  // Stagger to avoid hammering Sheets API at once
  setTimeout(() => seedIfEmpty("sessions").catch(console.error), 2_000);
  setTimeout(() => seedIfEmpty("signups").catch(console.error),  3_000);
  setTimeout(() => seedIfEmpty("users").catch(console.error),    4_000);

  // Regular sync for Sheets-managed tabs only (payments). Deliberately late: it is a full
  // DELETE + INSERT of the table and it runs on every boot, i.e. after every deploy —
  // exactly when the first members are opening the app. Nothing depends on it finishing
  // early (the GAS webhook is the real-time path; this is the 6-hour fallback).
  setTimeout(() => syncTab("payments").catch(console.error), 20_000);
  setInterval(() => syncTab("payments").catch(console.error), SYNC_INTERVAL_MS);

  // Expire trial memberships at startup, then once every 24 hours. Also pushed back: a
  // membership that expired overnight does not need to be reclassified in the first
  // seconds of a deploy.
  setTimeout(() => expireTrialMemberships().catch(console.error), 25_000);
  setInterval(() => expireTrialMemberships().catch(console.error), DAY_MS);

  // GAS health monitor — hourly in-memory timestamp check; alerts if the GAS
  // heartbeat trigger has not pinged for > GAS_STALE_MS.
  setInterval(() => checkGasHealth().catch(console.error), 60 * 60 * 1_000);

  console.log("[Sync] Background sync started — DB-primary: sessions, signups, users | Sheets-managed: payments (6h fallback; GAS webhook is primary)");
}

export function getSyncStatus() {
  return syncStatus;
}

// ─── GAS health monitoring ────────────────────────────────────────────────────
// Tracks the last time the GAS heartbeat trigger pinged
// POST /api/health/gas-heartbeat. The heartbeat is a dedicated time-based
// trigger in Apps Script (gasHeartbeat() in Code.gs) that runs every 30 min
// regardless of whether any payment emails or web-app activity occurred.
//
// Reactive POST /api/sync calls do NOT reset this timer — otherwise a broken
// heartbeat trigger would be masked by occasional sign-up / admin activity.

let lastGasHeartbeatAt = 0;
let gasAlertSentAt     = 0;

/** Call this each time GAS successfully hits POST /api/health/gas-heartbeat. */
export function recordGasHeartbeat(): void {
  lastGasHeartbeatAt = Date.now();
  gasAlertSentAt     = 0; // reset so a future outage can alert again
}

const GAS_STALE_MS       = 75 * 60 * 1000; // alert if silent for 75 min (~2 missed 30-min beats + buffer)
const GAS_ALERT_COOLDOWN = 60 * 60 * 1000; // re-alert at most once per hour

async function checkGasHealth(): Promise<void> {
  // Never fired (fresh deploy / heartbeat trigger not yet installed) → skip silently
  if (lastGasHeartbeatAt === 0) return;
  // Still fresh → healthy
  if (Date.now() - lastGasHeartbeatAt < GAS_STALE_MS) return;
  // Cooldown — don't spam
  if (gasAlertSentAt > 0 && Date.now() - gasAlertSentAt < GAS_ALERT_COOLDOWN) return;

  gasAlertSentAt = Date.now();
  const staleMin = Math.round((Date.now() - lastGasHeartbeatAt) / 60_000);
  console.error(`[GAS Health] ⚠️ No GAS heartbeat for ${staleMin} min — sending alert`);
  try {
    const { sendAlertEmail } = await import("./email");
    await sendAlertEmail(
      "⚠️ FATUWR: GAS heartbeat is stale",
      `The GAS heartbeat trigger has not pinged the server for ${staleMin} minutes.\n\n` +
      `Last heartbeat: ${new Date(lastGasHeartbeatAt).toISOString()}\n\n` +
      `Possible causes:\n` +
      `  • GAS OAuth requires re-authorisation (a new scope was added to the script)\n` +
      `  • The heartbeat time-based trigger was deleted or paused\n` +
      `  • Unhandled error in gasHeartbeat()\n\n` +
      `Fix: open the Apps Script editor, run gasHeartbeat() manually, re-grant\n` +
      `permissions when prompted, then run createHeartbeatTrigger() to reinstall\n` +
      `the 30-min time-based trigger and verify it appears in the Triggers panel.`
    );
  } catch (err: any) {
    console.error("[GAS Health] Failed to send alert:", err?.message ?? err);
  }
}
