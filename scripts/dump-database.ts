/**
 * Full logical dump of the Railway MySQL, as plain SQL.
 *
 * Written because mysqldump is not installed locally and the whole database is under a
 * megabyte, so a portable dump is simpler than a client install. Used two ways:
 *   - a restore artifact to hold before any infrastructure change
 *   - the payload for moving the database to another region or project
 *
 * Read-only against the source. Output contains member emails and payment references, so
 * it is written outside the repo by default and must never be committed.
 *
 *   npx tsx scripts/dump-database.ts [outfile.sql]
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { writeFileSync } from "fs";

function quote(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace("T", " ")}'`;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  if (Buffer.isBuffer(v)) return `x'${v.toString("hex")}'`;
  return `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(//g, "\\Z")}'`;
}

async function main() {
  const out = process.argv[2] || `fatuwr-dump-${new Date().toISOString().slice(0, 10)}.sql`;
  // dateStrings: mysql2 would otherwise parse TIMESTAMP columns into JS Dates using THIS
  // machine's timezone, and re-serialising them as UTC shifted every timestamp by 8 hours
  // on restore (caught by verify-migration.ts, 2026-09-26). Reading them as the strings
  // MySQL formats means they round-trip byte for byte.
  const c = await mysql.createConnection({ uri: process.env.DATABASE_URL as string, dateStrings: true });

  const [tableRows] = await c.query<any[]>(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type='BASE TABLE' ORDER BY table_name",
  );
  const tables = tableRows.map(r => r.t ?? r.TABLE_NAME);

  const parts: string[] = [
    `-- FATUWR database dump — ${new Date().toISOString()}`,
    `-- source: ${(process.env.DATABASE_URL || "").split("@")[1]?.split("/")[0]}`,
    "SET FOREIGN_KEY_CHECKS=0;",
    "SET NAMES utf8mb4;",
    "",
  ];
  const counts: Record<string, number> = {};

  for (const table of tables) {
    const [create] = await c.query<any[]>(`SHOW CREATE TABLE \`${table}\``);
    const ddl = create[0]["Create Table"];
    parts.push(`DROP TABLE IF EXISTS \`${table}\`;`, `${ddl};`, "");

    const [rows] = await c.query<any[]>(`SELECT * FROM \`${table}\``);
    counts[table] = rows.length;
    if (rows.length) {
      const cols = Object.keys(rows[0]);
      parts.push(`INSERT INTO \`${table}\` (${cols.map(c2 => `\`${c2}\``).join(", ")}) VALUES`);
      // one statement per 200 rows keeps individual statements well under max_allowed_packet
      const values = rows.map(r => `(${cols.map(c2 => quote(r[c2])).join(", ")})`);
      for (let i = 0; i < values.length; i += 200) {
        const chunk = values.slice(i, i + 200);
        parts.push(chunk.join(",\n") + ";");
        if (i + 200 < values.length) {
          parts.push(`INSERT INTO \`${table}\` (${cols.map(c2 => `\`${c2}\``).join(", ")}) VALUES`);
        }
      }
      parts.push("");
    }
    console.log(`  ${table.padEnd(24)} ${rows.length} rows`);
  }

  parts.push("SET FOREIGN_KEY_CHECKS=1;", "");
  writeFileSync(out, parts.join("\n"));
  await c.end();

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\nWrote ${out} — ${tables.length} tables, ${total} rows`);
  console.log("Row counts to verify against after a restore:");
  console.log(JSON.stringify(counts, null, 2));
}

main().catch(e => { console.error(e.code || e.message); process.exit(1); });
