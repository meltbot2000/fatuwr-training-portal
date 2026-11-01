/**
 * This app's own database. It never holds portal data except:
 *   - members: a cached profile (name/photo/role) keyed by the PORTAL user id
 *   - training_records: a synced copy of the portal's attendance for squad members
 * Both are overwritten from the portal; the portal stays the source of truth for them.
 * Workouts, competitions and squads are owned here.
 *
 * Calendar dates are CHAR(10) 'YYYY-MM-DD', never DATE/TIMESTAMP: mysql2 shifts
 * temporal columns by the client's timezone (portal SYSTEM.md Bug 26), and a training
 * date has no time or zone to begin with. dateStrings is on for the audit timestamps.
 */
import mysql from "mysql2/promise";
import { config } from "./config";

let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      uri: config.databaseUrl,
      connectionLimit: 5,
      dateStrings: true,
      timezone: "Z",
      charset: "utf8mb4",
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) { await pool.end(); pool = null; }
}

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS members (
     id INT PRIMARY KEY,                       -- portal users.id
     name VARCHAR(256) NOT NULL DEFAULT '',
     image TEXT NULL,
     club_role VARCHAR(32) NOT NULL DEFAULT '',
     member_status VARCHAR(32) NOT NULL DEFAULT '',
     last_login_at DATETIME NULL,
     trainings_synced_at DATETIME NULL,
     trainings_sync_error VARCHAR(255) NULL,
     updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   ) CHARACTER SET utf8mb4`,
  `CREATE TABLE IF NOT EXISTS competitions (
     id INT AUTO_INCREMENT PRIMARY KEY,
     name VARCHAR(200) NOT NULL,
     start_date CHAR(10) NOT NULL,             -- prep start, YYYY-MM-DD
     competition_date CHAR(10) NOT NULL,       -- YYYY-MM-DD
     created_by INT NULL,
     created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
   ) CHARACTER SET utf8mb4`,
  `CREATE TABLE IF NOT EXISTS squad_members (
     competition_id INT NOT NULL,
     member_id INT NOT NULL,
     added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (competition_id, member_id),
     INDEX idx_squad_member (member_id)
   ) CHARACTER SET utf8mb4`,
  `CREATE TABLE IF NOT EXISTS workouts (
     id INT AUTO_INCREMENT PRIMARY KEY,
     member_id INT NOT NULL,
     date CHAR(10) NOT NULL,
     type VARCHAR(40) NOT NULL,
     duration_min SMALLINT NOT NULL,
     intensity TINYINT NULL,                   -- RPE 1–10, optional
     notes TEXT NULL,
     created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_workouts_member_date (member_id, date)
   ) CHARACTER SET utf8mb4`,
  `CREATE TABLE IF NOT EXISTS training_records (
     signup_id INT PRIMARY KEY,                -- portal sheet_signups.id
     member_id INT NOT NULL,
     date CHAR(10) NOT NULL,
     pool VARCHAR(128) NOT NULL DEFAULT '',
     training_time VARCHAR(64) NOT NULL DEFAULT '',
     day VARCHAR(32) NOT NULL DEFAULT '',
     activity VARCHAR(64) NOT NULL DEFAULT '',
     session_id VARCHAR(64) NOT NULL DEFAULT '',
     rain_off VARCHAR(8) NOT NULL DEFAULT '',
     synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_training_member_date (member_id, date)
   ) CHARACTER SET utf8mb4`,
  // Names an admin asked to have in a squad, waiting to be matched to a portal account.
  `CREATE TABLE IF NOT EXISTS squad_invites (
     id INT AUTO_INCREMENT PRIMARY KEY,
     competition_id INT NOT NULL,
     name VARCHAR(128) NOT NULL,
     status VARCHAR(16) NOT NULL DEFAULT 'pending',   -- pending | added | dismissed
     member_id INT NULL,
     candidates TEXT NULL,                             -- JSON [{id,name}] when ambiguous
     note VARCHAR(255) NULL,
     created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uq_invite (competition_id, name)
   ) CHARACTER SET utf8mb4`,
  // One-off markers (e.g. "this seed already ran"), so deleting seeded data sticks.
  `CREATE TABLE IF NOT EXISTS app_meta (
     k VARCHAR(64) PRIMARY KEY,
     v VARCHAR(255) NOT NULL,
     updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   ) CHARACTER SET utf8mb4`,
];

// Columns added after first release. MySQL has no ADD COLUMN IF NOT EXISTS, so a
// "duplicate column" error (1060) just means it already ran.
const COLUMN_MIGRATIONS = [
  "ALTER TABLE members ADD COLUMN is_admin TINYINT NOT NULL DEFAULT 0",
];

// Workout types changed 2026-11-01 (see WORKOUT_TYPES). Idempotent: once no row holds an
// old value these match nothing. Removed types become "Others" with the old type kept at
// the front of the notes, so no detail is lost and old rows stay editable.
const DATA_MIGRATIONS = [
  "UPDATE workouts SET type = 'Gym/Strength' WHERE type = 'Gym / strength'",
  "UPDATE workouts SET type = 'Others' WHERE type = 'Other'",
  `UPDATE workouts SET notes = TRIM(CONCAT('[', type, '] ', COALESCE(notes, ''))), type = 'Others'
   WHERE type IN ('Fins / underwater', 'Breath-hold', 'Cardio')`,
];

export async function migrate(): Promise<void> {
  const p = getPool();
  for (const sql of MIGRATIONS) await p.query(sql);
  for (const sql of COLUMN_MIGRATIONS) {
    try { await p.query(sql); } catch (e: any) { if (e?.errno !== 1060) throw e; }
  }
  for (const sql of DATA_MIGRATIONS) await p.query(sql);
}

export async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getPool().query(sql, params);
  return rows as T[];
}

export async function exec(sql: string, params: unknown[] = []): Promise<mysql.ResultSetHeader> {
  const [res] = await getPool().query(sql, params);
  return res as mysql.ResultSetHeader;
}
