/**
 * Restore a dump produced by scripts/dump-database.ts into a DIFFERENT database, then
 * verify every table's row count against the source.
 *
 * The target is read from an environment variable rather than the command line, so the
 * new database's credentials stay in .env and never appear in a shell history or a
 * transcript.
 *
 *   NEW_DATABASE_URL=mysql://... (in .env)
 *   npx tsx scripts/restore-database.ts <dumpfile.sql>
 *
 * Safety:
 *   - refuses to run if the target is the same host as DATABASE_URL, so it cannot be
 *     pointed at production by accident
 *   - the dump drops and recreates each table, so re-running it is idempotent
 *   - verification compares the live source against the restored target, table by table,
 *     and exits non-zero on any mismatch
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { readFileSync } from "fs";

const hostOf = (url: string) => (url || "").split("@")[1]?.split("/")[0] ?? "";

async function rowCounts(conn: mysql.Connection): Promise<Record<string, number>> {
  const [tables] = await conn.query<any[]>(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type='BASE TABLE'",
  );
  const out: Record<string, number> = {};
  for (const row of tables) {
    const name = row.t ?? row.TABLE_NAME;
    const [r] = await conn.query<any[]>(`SELECT COUNT(*) n FROM \`${name}\``);
    out[name] = Number(r[0].n);
  }
  return out;
}

async function main() {
  const dumpPath = process.argv[2];
  if (!dumpPath) throw new Error("usage: npx tsx scripts/restore-database.ts <dumpfile.sql>");

  const source = process.env.DATABASE_URL || "";
  const target = process.env.NEW_DATABASE_URL || "";
  if (!target) throw new Error("NEW_DATABASE_URL is not set — put the new database's URL in .env");
  if (hostOf(target) === hostOf(source)) {
    throw new Error(`refusing to restore onto the source database (${hostOf(source)})`);
  }

  const sql = readFileSync(dumpPath, "utf8");
  console.log(`restoring ${dumpPath} (${sql.length} bytes)`);
  console.log(`  from: ${hostOf(source)}`);
  console.log(`  into: ${hostOf(target)}\n`);

  const conn = await mysql.createConnection({ uri: target, multipleStatements: true, dateStrings: true });
  const started = Date.now();
  await conn.query(sql);
  console.log(`restored in ${Date.now() - started}ms\n`);

  const targetCounts = await rowCounts(conn);
  await conn.end();

  const src = await mysql.createConnection({ uri: source, dateStrings: true });
  const sourceCounts = await rowCounts(src);
  await src.end();

  let mismatched = 0;
  const names = [...new Set([...Object.keys(sourceCounts), ...Object.keys(targetCounts)])].sort();
  console.log("table                     source   target");
  for (const name of names) {
    const a = sourceCounts[name] ?? 0;
    const b = targetCounts[name] ?? 0;
    const flag = a === b ? "" : "   <-- MISMATCH";
    if (a !== b) mismatched++;
    console.log(`  ${name.padEnd(24)} ${String(a).padStart(6)}   ${String(b).padStart(6)}${flag}`);
  }

  if (mismatched) {
    console.error(`\n${mismatched} table(s) do not match. Do NOT cut over.`);
    process.exit(1);
  }
  console.log("\nEvery table matches. Safe to cut over.");
}

main().catch(e => { console.error(e.code || e.message); process.exit(1); });
