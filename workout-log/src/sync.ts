/**
 * Training sync: portal attendance → training_records.
 *
 * Runs every SYNC_INTERVAL_MINUTES for everyone in an active squad, for one member right
 * after they sign in, for a member when an admin adds them to a squad, and on an admin's
 * "Sync now".
 *
 * Replace-per-member inside a transaction, and ONLY after a 200 from the portal: a
 * portal outage (or its 503 when its DB is down) leaves the last good copy in place
 * and records the error, rather than blanking anyone's attendance.
 */
import { addDays, config, todaySgt } from "./config";
import { exec, getPool, query } from "./db";
import { portal, PortalError, type PortalMember, type PortalTrainingRecord } from "./portal";

/** Competitions stay "active" for sync two weeks past the competition day. */
const ACTIVE_GRACE_DAYS = 14;

/**
 * Cache a portal profile. is_admin is only ever written at login (`isAdmin` given), the
 * one moment we know which email the person proved they own; syncs leave it alone.
 */
export async function upsertMember(m: PortalMember, opts: { loggedIn?: boolean; isAdmin?: boolean } = {}): Promise<void> {
  const login = opts.loggedIn === true;
  await exec(
    `INSERT INTO members (id, name, image, club_role, member_status, is_admin, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ${login ? "UTC_TIMESTAMP()" : "NULL"})
     ON DUPLICATE KEY UPDATE name = VALUES(name), image = VALUES(image),
       club_role = VALUES(club_role), member_status = VALUES(member_status)
       ${login ? ", is_admin = VALUES(is_admin), last_login_at = UTC_TIMESTAMP()" : ""}`,
    [m.id, m.name, m.image, m.clubRole, m.memberStatus, login && opts.isAdmin ? 1 : 0],
  );
}

export async function replaceTrainingRecords(memberId: number, records: PortalTrainingRecord[]): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM training_records WHERE member_id = ?", [memberId]);
    if (records.length) {
      // signup_id is the portal's PK; ON DUPLICATE guards the (theoretical) case of a
      // sign-up being re-attributed from another member between two syncs.
      await conn.query(
        `INSERT INTO training_records (signup_id, member_id, date, pool, training_time, day, activity, session_id, rain_off)
         VALUES ? ON DUPLICATE KEY UPDATE member_id = VALUES(member_id), date = VALUES(date), pool = VALUES(pool),
           training_time = VALUES(training_time), day = VALUES(day), activity = VALUES(activity),
           session_id = VALUES(session_id), rain_off = VALUES(rain_off), synced_at = UTC_TIMESTAMP()`,
        [records.map(r => [r.signupId, memberId, r.date, r.pool, r.trainingTime, r.day, r.activity, r.sessionId, r.rainOff])],
      );
    }
    await conn.query(
      "UPDATE members SET trainings_synced_at = UTC_TIMESTAMP(), trainings_sync_error = NULL WHERE id = ?", [memberId]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

type SyncResult = { ok: boolean; count?: number; error?: string };

/**
 * One sync per member at a time. A login sync, an admin "add", the invite matcher and
 * the 30-min run can all target the same person; two overlapping DELETE+INSERTs of the
 * same member's rows can deadlock, and the loser was recorded as a sync failure.
 * Callers that arrive while a sync is running for that member share its result.
 */
const inFlight = new Map<number, Promise<SyncResult>>();

export function syncMember(memberId: number): Promise<SyncResult> {
  const running = inFlight.get(memberId);
  if (running) return running;
  const p = syncMemberOnce(memberId).finally(() => inFlight.delete(memberId));
  inFlight.set(memberId, p);
  return p;
}

/** Worth one retry: portal blips/redeploys and MySQL deadlock/lock-wait. */
export function isTransient(e: any): boolean {
  if (e instanceof PortalError) return e.status >= 500;
  return e?.errno === 1213 || e?.errno === 1205;
}

async function syncMemberOnce(memberId: number): Promise<SyncResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      const { member, records } = await portal.getTrainings(memberId);
      await upsertMember(member);
      await replaceTrainingRecords(memberId, records);
      return { ok: true, count: records.length };
    } catch (e: any) {
      if (attempt === 1 && isTransient(e)) { await new Promise(r => setTimeout(r, 2000)); continue; }
      const error = describeSyncError(e);
      await exec("UPDATE members SET trainings_sync_error = ? WHERE id = ?", [error, memberId]).catch(() => {});
      console.warn(`[Sync] member ${memberId} failed: ${error}`, e instanceof PortalError ? "" : e);
      return { ok: false, error };
    }
  }
}

/** Plain-English reason, stored and shown to the admin. Starts with the raw code. */
export function describeSyncError(e: any): string {
  if (e instanceof PortalError) {
    const why: Record<string, string> = {
      portal_unreachable: "couldn't reach the portal",
      unauthorized: "portal rejected the API key: PORTAL_API_KEY ≠ portal's WORKOUT_LOG_API_KEY",
      partner_api_disabled: "WORKOUT_LOG_API_KEY isn't set on the portal",
      not_found: "no portal account with this id any more",
      db_unavailable: "portal's database read failed",
      internal: "portal error (see portal logs: [PartnerAPI])",
    };
    return `${e.status} ${e.code}: ${why[e.code] ?? "portal returned an error"}`.slice(0, 250);
  }
  return `local: ${String(e?.code || "")} ${String(e?.message || e)}`.trim().slice(0, 250);
}

export async function activeSquadMemberIds(today = todaySgt()): Promise<number[]> {
  const rows = await query<{ member_id: number }>(
    `SELECT DISTINCT s.member_id FROM squad_members s
     JOIN competitions c ON c.id = s.competition_id
     WHERE c.competition_date >= ?`,
    [addDays(today, -ACTIVE_GRACE_DAYS)],
  );
  return rows.map(r => r.member_id);
}

/** Refresh cached name/photo/role for everyone this app knows about (≤200 per call). */
async function refreshProfiles(): Promise<void> {
  const ids = (await query<{ id: number }>("SELECT id FROM members")).map(r => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { members } = await portal.getMembers(ids.slice(i, i + 200));
    for (const m of members) await upsertMember(m);
  }
}

let running: Promise<SyncSummary> | null = null;
export interface SyncSummary { synced: number; failed: number; at: string }

/** Full sync. Concurrent callers share one run. */
export function syncAll(): Promise<SyncSummary> {
  if (running) return running;
  running = (async () => {
    let synced = 0, failed = 0;
    try { await refreshProfiles(); } catch (e: any) { console.warn("[Sync] profile refresh failed:", e?.message); }
    // Pending squad names (e.g. someone who has only just made a portal account).
    // Imported lazily: invites.ts imports this module.
    try { await (await import("./invites")).resolvePendingInvites(); } catch (e: any) { console.warn("[Sync] invites failed:", e?.message); }
    for (const id of await activeSquadMemberIds()) {
      // Sequential on purpose: a squad is ~20 people and the portal is one small instance.
      const r = await syncMember(id);
      r.ok ? synced++ : failed++;
    }
    const summary = { synced, failed, at: new Date().toISOString() };
    console.log(`[Sync] done: ${synced} synced, ${failed} failed`);
    return summary;
  })().finally(() => { running = null; });
  return running;
}

export function startBackgroundSync(): void {
  setTimeout(() => { syncAll().catch(e => console.error("[Sync] failed:", e)); }, 10_000);
  setInterval(() => { syncAll().catch(e => console.error("[Sync] failed:", e)); }, config.syncIntervalMinutes * 60_000);
}
