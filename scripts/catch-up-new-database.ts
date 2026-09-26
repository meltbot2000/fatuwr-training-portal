/**
 * Copy rows written to the OLD database after the final dump into the NEW one.
 *
 * There is an unavoidable gap between taking the final dump and the app switching over:
 * a member signing up in those few minutes writes to the old database, which nothing will
 * read again. This finds those rows by id and replays them.
 *
 *   npx tsx scripts/catch-up-new-database.ts            # report only, writes nothing
 *   npx tsx scripts/catch-up-new-database.ts --apply    # insert the missing rows
 *
 * Inserts only. A row EDITED during the window (an activity changed, a fee adjusted) keeps
 * its id and so is not detected — the report flags tables whose updatedAt/syncedAt moved,
 * so anything of that kind can be looked at by hand.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

// Tables the app writes, with the column that orders them. Everything auto-increments on
// `id` except sheet_sessions, whose primary key is rowIndex (it mirrors the Sheet's rows).
const TABLES: [string, string][] = [
  ["users", "id"],
  ["sheet_users", "id"],
  ["sheet_sessions", "rowIndex"],
  ["sheet_signups", "id"],
  ["announcements", "id"],
  ["videos", "id"],
  ["merch_items", "id"],
];

// otp_codes is deliberately excluded: codes are short-lived, and a member mid-login simply
// requests a new one.
//
// sheet_payments is excluded for a much more important reason. The payments sync does a
// full DELETE + INSERT from the Sheet, and the auto-increment keeps climbing, so after a
// sync every row looks "new" by id even though it is the same payment. Replaying by id
// would have inserted 520 duplicate rows and doubled every member's recorded payments
// (caught in a dry run, 2026-09-26). The Sheet is the source of truth for payments, so the
// correct action after cutover is to let a sync repopulate the table — which the app does
// at boot. This script verifies payments instead of replaying them.

const hostOf = (url: string) => (url || "").split("@")[1]?.split("/")[0] ?? "";

async function main() {
  const apply = process.argv.includes("--apply");
  const sourceUrl = process.env.DATABASE_URL || "";
  const targetUrl = process.env.NEW_DATABASE_URL || "";
  if (!sourceUrl || !targetUrl) throw new Error("both DATABASE_URL and NEW_DATABASE_URL must be set");
  if (hostOf(sourceUrl) === hostOf(targetUrl)) {
    throw new Error(`refusing to run: source and target are the same host (${hostOf(sourceUrl)})`);
  }
  console.log(`source: ${hostOf(sourceUrl)}\ntarget: ${hostOf(targetUrl)}\n`);
  // dateStrings: copying rows between databases must not reinterpret TIMESTAMP columns
  // through this machine's timezone — that shifted every timestamp by 8 hours.
  const old = await mysql.createConnection({ uri: sourceUrl, dateStrings: true });
  const nw = await mysql.createConnection({ uri: targetUrl, dateStrings: true });

  console.log(apply ? "APPLYING\n" : "DRY RUN — nothing will be written\n");
  let totalMissing = 0;
  const failures: { table: string; key: string; error: string }[] = [];

  for (const [table, key] of TABLES) {
    const [maxRow] = await nw.query<any[]>(`SELECT IFNULL(MAX(\`${key}\`), 0) m FROM \`${table}\``);
    const maxId = Number(maxRow[0].m);
    const [missing] = await old.query<any[]>(`SELECT * FROM \`${table}\` WHERE \`${key}\` > ? ORDER BY \`${key}\``, [maxId]);

    if (missing.length === 0) {
      console.log(`  ${table.padEnd(16)} up to date (max ${key} ${maxId})`);
      continue;
    }
    // A table where EVERY row looks new was rewritten (a sync), not appended to — replaying
    // it would duplicate the lot. But on a tiny table that test fires by accident: delete
    // the one video and add another during the window and its single row looks "all new".
    // So require a rewrite to be substantial before refusing.
    const [totalRow] = await old.query<any[]>(`SELECT COUNT(*) n FROM \`${table}\``);
    const REWRITE_MIN_ROWS = 50;
    if (missing.length === Number(totalRow[0].n) && missing.length >= REWRITE_MIN_ROWS) {
      console.log(`  ${table.padEnd(16)} SKIPPED — all ${missing.length} rows look new, so the table was`);
      console.log(`                   rewritten (a sync), not appended to. Replaying would duplicate it.`);
      continue;
    }
    totalMissing += missing.length;
    console.log(`  ${table.padEnd(16)} ${missing.length} row(s) written after the dump, ${key} ${missing[0][key]}..${missing[missing.length - 1][key]}`);
    for (const row of missing) {
      const summary = [row.name, row.pool, row.dateOfTraining, row.activity, row.email]
        .filter(Boolean).join(" / ");
      console.log(`       ${key} ${row[key]}: ${summary || "(no descriptive columns)"}`);
    }

    if (apply) {
      // Each row in its own try/catch. The first version let one duplicate key abort the
      // whole run, and sheet_signups is fourth in the list — so a collision on an earlier
      // table would have silently skipped replaying sign-ups, which are the rows that
      // cannot be recovered from anywhere else.
      const cols = Object.keys(missing[0]);
      let inserted = 0;
      for (const row of missing) {
        try {
          await nw.query(
            `INSERT INTO \`${table}\` (${cols.map(c => `\`${c}\``).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
            cols.map(c => row[c]),
          );
          inserted++;
        } catch (err: any) {
          failures.push({ table, key: `${key}=${row[key]}`, error: err?.code || err?.message });
          console.log(`       !! ${table} ${key}=${row[key]} FAILED: ${err?.code || err?.message}`);
        }
      }
      console.log(`       -> inserted ${inserted} of ${missing.length} row(s)`);
    }
  }

  // Payments: verify rather than replay. Different ids for identical rows are expected.
  const [oldPay] = await old.query<any[]>("SELECT COUNT(*) n, IFNULL(SUM(amount),0) total FROM sheet_payments");
  const [newPay] = await nw.query<any[]>("SELECT COUNT(*) n, IFNULL(SUM(amount),0) total FROM sheet_payments");
  const sameCount = Number(oldPay[0].n) === Number(newPay[0].n);
  const sameTotal = Math.abs(Number(oldPay[0].total) - Number(newPay[0].total)) < 0.005;
  console.log(`\n  sheet_payments   old ${oldPay[0].n} rows / $${oldPay[0].total}  vs  new ${newPay[0].n} rows / $${newPay[0].total}`);
  console.log(sameCount && sameTotal
    ? "       match — nothing to do; payments come from the Sheet and re-sync on their own"
    : "       DIFFER — do not copy rows by hand; trigger a payments sync after cutover and re-check");

  // Rows EDITED during the window keep their id, so the watermark cannot see them. Report
  // the drift so it can be looked at by hand rather than silently lost — the docstring
  // promised this and the first version did not implement it.
  console.log("\n  edits during the window (a moved timestamp means a row changed in place):");
  for (const [table, stamp] of [["users", "updatedAt"], ["sheet_users", "syncedAt"], ["sheet_signups", "syncedAt"], ["sheet_sessions", "syncedAt"]] as [string, string][]) {
    try {
      const [a] = await old.query<any[]>(`SELECT MAX(\`${stamp}\`) m FROM \`${table}\``);
      const [b] = await nw.query<any[]>(`SELECT MAX(\`${stamp}\`) m FROM \`${table}\``);
      const same = String(a[0].m) === String(b[0].m);
      console.log(`    ${table.padEnd(16)} ${stamp}: old ${a[0].m} / new ${b[0].m}${same ? "" : "   <-- CHECK: something was edited, not just inserted"}`);
    } catch { /* column absent */ }
  }

  if (failures.length) {
    console.error(`\n${failures.length} row(s) FAILED to insert:`);
    for (const f of failures) console.error(`  ${f.table} ${f.key}: ${f.error}`);
  }

  console.log(totalMissing === 0
    ? "\nNothing was written to the old database after the dump — nothing to replay."
    : `\n${totalMissing} row(s) ${apply ? "replayed" : "would be replayed (re-run with --apply)"}.`);

  await old.end();
  await nw.end();
  if (failures.length) process.exit(1);
}

main().catch(e => { console.error(e.code || e.message); process.exit(1); });
