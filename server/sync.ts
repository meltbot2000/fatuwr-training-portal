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
} from "./googleSheets";
import { sql } from "drizzle-orm";

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
  } else if (tab === "signups") {
    const rows = await fetchSheetsSignups();
    await db.transaction(async (tx) => {
      await tx.delete(sheetSignups);
      if (rows.length) await tx.insert(sheetSignups).values(rows);
    });
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

// ─── Startup ──────────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function startBackgroundSync(): void {
  // Seed DB-primary tables from Sheets if empty (fresh deployment / first run)
  // Stagger to avoid hammering Sheets API at once
  setTimeout(() => seedIfEmpty("sessions").catch(console.error), 2_000);
  setTimeout(() => seedIfEmpty("signups").catch(console.error),  3_000);
  setTimeout(() => seedIfEmpty("users").catch(console.error),    4_000);

  // Regular sync for Sheets-managed tabs only (payments)
  setTimeout(() => syncTab("payments").catch(console.error), 5_000);
  setInterval(() => syncTab("payments").catch(console.error), SYNC_INTERVAL_MS);

  console.log("[Sync] Background sync started — DB-primary: sessions, signups, users | Sheets-managed: payments");
}

export function getSyncStatus() {
  return syncStatus;
}
