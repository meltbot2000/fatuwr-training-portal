/**
 * Sheets → DB sync service.
 *
 * Keeps the four `sheet_*` cache tables in Railway MySQL in sync with the
 * corresponding Google Sheets tabs.  All app reads go to DB first (< 5 ms);
 * Sheets API is only called on cold-start or if the DB table is empty.
 *
 * Sync is triggered three ways:
 *  1. On server startup (2 s delay so the DB connection is ready)
 *  2. Every 5 minutes (background interval)
 *  3. On demand via POST /api/sync?tab=X&token=SECRET (called by GAS after writes)
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

export type SyncTab = "sessions" | "payments" | "signups" | "users";

/**
 * Tabs that are now DB-primary: the server writes directly to these DB tables.
 * Syncing from Sheets would overwrite those writes, so we skip it.
 * Add a tab here after migrating its write path away from GAS.
 */
export const DB_PRIMARY_TABS = new Set<SyncTab>(["signups"]);

const syncStatus: Record<SyncTab, { lastSync: number; error: string | null }> = {
  sessions: { lastSync: 0, error: null },
  payments:  { lastSync: 0, error: null },
  signups:   { lastSync: 0, error: null },
  users:     { lastSync: 0, error: null },
};

/**
 * Force a Sheets → DB sync for a single tab, bypassing the DB_PRIMARY_TABS guard.
 * Use this once after the initial DB_PRIMARY migration to seed the DB from existing
 * Sheets data.  Triggered via POST /api/sync?tab=X&token=SECRET&force=true
 */
export async function forceSyncTab(tab: SyncTab): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const originalGuard = DB_PRIMARY_TABS.has(tab);
  if (originalGuard) DB_PRIMARY_TABS.delete(tab);
  try {
    await syncTab(tab);
  } finally {
    if (originalGuard) DB_PRIMARY_TABS.add(tab);
  }
}

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
  } catch (err: any) {
    syncStatus[tab].error = err?.message ?? String(err);
    console.error(`[Sync] ${tab} failed:`, err?.message ?? err);
  }
}

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function startBackgroundSync(): void {
  // Stagger the initial syncs by a few ms so they don't all hit Sheets at once
  setTimeout(() => syncTab("sessions").catch(console.error), 2_000);
  setTimeout(() => syncTab("payments").catch(console.error), 2_500);
  setTimeout(() => syncTab("signups").catch(console.error),  3_000);
  setTimeout(() => syncTab("users").catch(console.error),    3_500);

  setInterval(() => {
    syncTab("sessions").catch(console.error);
    syncTab("payments").catch(console.error);
    syncTab("signups").catch(console.error);
    syncTab("users").catch(console.error);
  }, SYNC_INTERVAL_MS);

  console.log("[Sync] Background sync started (5-min interval)");
}

export function getSyncStatus() {
  return syncStatus;
}
