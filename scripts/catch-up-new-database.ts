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

async function main() {
  const apply = process.argv.includes("--apply");
  // dateStrings: copying rows between databases must not reinterpret TIMESTAMP columns
  // through this machine's timezone — that shifted every timestamp by 8 hours.
  const old = await mysql.createConnection({ uri: process.env.DATABASE_URL as string, dateStrings: true });
  const nw = await mysql.createConnection({ uri: process.env.NEW_DATABASE_URL as string, dateStrings: true });

  console.log(apply ? "APPLYING\n" : "DRY RUN — nothing will be written\n");
  let totalMissing = 0;

  for (const [table, key] of TABLES) {
    const [maxRow] = await nw.query<any[]>(`SELECT IFNULL(MAX(\`${key}\`), 0) m FROM \`${table}\``);
    const maxId = Number(maxRow[0].m);
    const [missing] = await old.query<any[]>(`SELECT * FROM \`${table}\` WHERE \`${key}\` > ? ORDER BY \`${key}\``, [maxId]);

    if (missing.length === 0) {
      console.log(`  ${table.padEnd(16)} up to date (max ${key} ${maxId})`);
      continue;
    }
    const [totalRow] = await old.query<any[]>(`SELECT COUNT(*) n FROM \`${table}\``);
    if (missing.length === Number(totalRow[0].n) && missing.length > 0) {
      console.log(`  ${table.padEnd(16)} SKIPPED — all ${missing.length} rows look new, which means the table was`);
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
      const cols = Object.keys(missing[0]);
      for (const row of missing) {
        await nw.query(
          `INSERT INTO \`${table}\` (${cols.map(c => `\`${c}\``).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
          cols.map(c => row[c]),
        );
      }
      console.log(`       -> inserted ${missing.length} row(s)`);
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

  console.log(totalMissing === 0
    ? "\nNothing was written to the old database after the dump — nothing to replay."
    : `\n${totalMissing} row(s) ${apply ? "replayed" : "would be replayed (re-run with --apply)"}.`);

  await old.end();
  await nw.end();
}

main().catch(e => { console.error(e.code || e.message); process.exit(1); });
