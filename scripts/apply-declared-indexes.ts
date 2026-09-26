/**
 * Create the indexes that drizzle/schema.ts declares but the live DB never got.
 * Verified 2026-09-26: only idx_users_email existed; the other ten were missing, so any
 * reasoning of the form "this WHERE clause will use an index" was false. Idempotent —
 * skips anything already present. Safe to re-run.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const WANTED: [string, string, string][] = [
  ["otp_codes",      "idx_otp_codes_email",             "(email)"],
  ["sheet_sessions", "idx_sheet_sessions_row_id",       "(rowId)"],
  ["sheet_payments", "idx_sheet_payments_payment_id",   "(paymentId)"],
  ["sheet_payments", "idx_sheet_payments_email",        "(email)"],
  ["sheet_signups",  "idx_sheet_signups_pool_date",     "(pool, dateOfTraining)"],
  ["sheet_signups",  "idx_sheet_signups_email",         "(email)"],
  ["sheet_signups",  "idx_sheet_signups_payment_id",    "(paymentId)"],
  ["sheet_users",    "idx_sheet_users_email",           "(email)"],
  ["sheet_users",    "idx_sheet_users_user_email",      "(userEmail)"],
  ["sheet_users",    "idx_sheet_users_payment_id",      "(paymentId)"],
  ["users",          "idx_users_email",                 "(email)"],
];

async function main() {
  const c = await mysql.createConnection(process.env.DATABASE_URL as string);
  const t0 = Date.now();
  const [before] = await c.query("SELECT COUNT(*) n FROM sheet_signups WHERE pool='CCAB'") as any;
  console.log(`baseline: pool-filtered count ${before[0].n} rows in ${Date.now() - t0}ms`);

  for (const [table, name, cols] of WANTED) {
    const [existing] = await c.query(
      "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1",
      [table, name]) as any;
    if (existing.length) { console.log(`  skip   ${name} (already present)`); continue; }
    const s = Date.now();
    await c.query(`CREATE INDEX \`${name}\` ON \`${table}\` ${cols}`);
    console.log(`  create ${name} on ${table} ${cols} — ${Date.now() - s}ms`);
  }

  console.log("\nlive indexes now:");
  for (const t of ["users", "otp_codes", "sheet_sessions", "sheet_payments", "sheet_signups", "sheet_users"]) {
    const [idx] = await c.query(`SHOW INDEX FROM \`${t}\``) as any;
    console.log(`  ${t.padEnd(15)} ${[...new Set(idx.map((i: any) => i.Key_name))].join(", ")}`);
  }
  await c.end();
}
main().catch(e => { console.error(e.code || e.message); process.exit(1); });
