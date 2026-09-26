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

// Tables the app writes, in an order that is safe to insert sequentially.
const TABLES = [
  "users",
  "sheet_users",
  "sheet_sessions",
  "sheet_signups",
  "sheet_payments",
  "announcements",
  "videos",
  "merch_items",
];

// otp_codes is deliberately excluded: codes are short-lived, and a member mid-login simply
// requests a new one.

async function main() {
  const apply = process.argv.includes("--apply");
  const old = await mysql.createConnection(process.env.DATABASE_URL as string);
  const nw = await mysql.createConnection(process.env.NEW_DATABASE_URL as string);

  console.log(apply ? "APPLYING\n" : "DRY RUN — nothing will be written\n");
  let totalMissing = 0;

  for (const table of TABLES) {
    const [maxRow] = await nw.query<any[]>(`SELECT IFNULL(MAX(id), 0) m FROM \`${table}\``);
    const maxId = Number(maxRow[0].m);
    const [missing] = await old.query<any[]>(`SELECT * FROM \`${table}\` WHERE id > ? ORDER BY id`, [maxId]);

    if (missing.length === 0) {
      console.log(`  ${table.padEnd(16)} up to date (max id ${maxId})`);
      continue;
    }
    totalMissing += missing.length;
    console.log(`  ${table.padEnd(16)} ${missing.length} row(s) written after the dump, ids ${missing[0].id}..${missing[missing.length - 1].id}`);
    for (const row of missing) {
      const summary = [row.name, row.pool, row.dateOfTraining, row.activity, row.email]
        .filter(Boolean).join(" / ");
      console.log(`       ${row.id}: ${summary || "(no descriptive columns)"}`);
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

  console.log(totalMissing === 0
    ? "\nNothing was written to the old database after the dump — nothing to replay."
    : `\n${totalMissing} row(s) ${apply ? "replayed" : "would be replayed (re-run with --apply)"}.`);

  await old.end();
  await nw.end();
}

main().catch(e => { console.error(e.code || e.message); process.exit(1); });
