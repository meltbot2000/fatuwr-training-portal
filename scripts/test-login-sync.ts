/**
 * Simulates the verifyOtp sheet-sync logic for a given email.
 * Run with: npx tsx scripts/test-login-sync.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { findUserByEmail } from "../server/googleSheets";

const TARGET_EMAIL = "tanmelanie@gmail.com";

async function queryDB(conn: mysql.Connection, label: string) {
  const [rows] = await conn.execute(
    "SELECT email, memberStatus, paymentId, clubRole, trialStartDate, trialEndDate FROM users WHERE email = ?",
    [TARGET_EMAIL]
  ) as [any[], any];
  console.log(`\n── DB (${label}) ──────────────────────────────`);
  if (rows.length === 0) {
    console.log("  (no row found)");
  } else {
    const r = rows[0];
    console.log(`  memberStatus : ${r.memberStatus}`);
    console.log(`  clubRole     : ${r.clubRole}`);
    console.log(`  paymentId    : ${r.paymentId}`);
    console.log(`  trialStart   : ${r.trialStartDate}`);
    console.log(`  trialEnd     : ${r.trialEndDate}`);
  }
  return rows[0] ?? null;
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  // ── Step 1: DB BEFORE ───────────────────────────────────────────────────────
  const before = await queryDB(conn, "BEFORE");

  // ── Step 2: Fetch sheet user ────────────────────────────────────────────────
  console.log(`\n── Sheet lookup for ${TARGET_EMAIL} ──────────────────────`);
  let sheetUser = null;
  try {
    sheetUser = await findUserByEmail(TARGET_EMAIL);
  } catch (err: any) {
    console.error("  ERROR fetching sheet user:", err.message);
  }
  if (!sheetUser) {
    console.log("  sheetUser = null (not found in sheet or API error)");
    await conn.end();
    return;
  }
  console.log(`  name         : ${sheetUser.name}`);
  console.log(`  email        : ${sheetUser.email}`);
  console.log(`  userEmail    : ${sheetUser.userEmail}`);
  console.log(`  memberStatus : ${sheetUser.memberStatus}`);
  console.log(`  clubRole     : ${sheetUser.clubRole}`);
  console.log(`  paymentId    : ${sheetUser.paymentId}`);
  console.log(`  trialStart   : ${sheetUser.trialStartDate}`);
  console.log(`  trialEnd     : ${sheetUser.trialEndDate}`);

  // ── Step 3: Apply the same sync the verifyOtp mutation would apply ──────────
  console.log("\n── Applying sync update to DB ─────────────────────────────");
  if (!before) {
    console.log("  No DB row to update — user doesn't exist in DB.");
    await conn.end();
    return;
  }

  await conn.execute(
    `UPDATE users SET
       memberStatus   = ?,
       clubRole       = ?,
       paymentId      = ?,
       trialStartDate = ?,
       trialEndDate   = ?,
       updatedAt      = NOW()
     WHERE email = ?`,
    [
      sheetUser.memberStatus || "Non-Member",
      sheetUser.clubRole ?? "",
      sheetUser.paymentId || before.paymentId || "",
      sheetUser.trialStartDate ?? "",
      sheetUser.trialEndDate ?? "",
      TARGET_EMAIL,
    ]
  );
  console.log("  Done.");

  // ── Step 4: DB AFTER ────────────────────────────────────────────────────────
  await queryDB(conn, "AFTER");

  await conn.end();
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
