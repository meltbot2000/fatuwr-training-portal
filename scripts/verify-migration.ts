/**
 * Pre-cutover sanity check for the database move, shaped by which side owns the data.
 *
 *   DB-PRIMARY (sign-ups, sessions, users, sheet_users, announcements, videos, merch):
 *     the database is the ONLY complete copy. The Sheet is stale for these and cannot
 *     restore them, so every row is compared, not just counted.
 *
 *   PAYMENTS: the Sheet is the source of truth and the DB copy is a cache the app syncs
 *     from it. Row ids are not stable across a sync (runSync DELETEs and re-INSERTs the
 *     whole table), so ids are ignored here and the money is compared instead — count,
 *     total, and per-member totals keyed on the payment reference.
 *
 * Also checks the things that break quietly after a restore: AUTO_INCREMENT positions
 * (a counter that rewound would collide with existing ids on the next sign-up) and the
 * business figures the app derives at read time.
 *
 *   npx tsx scripts/verify-migration.ts
 *
 * Exits non-zero if anything differs. Read-only against both databases.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { createHash } from "crypto";

const DB_PRIMARY: [string, string][] = [
  ["users", "id"],
  ["sheet_users", "id"],
  ["sheet_sessions", "rowIndex"],
  ["sheet_signups", "id"],
  ["announcements", "id"],
  ["videos", "id"],
  ["merch_items", "id"],
];

function canonical(row: Record<string, unknown>): string {
  const keys = Object.keys(row).sort();
  return JSON.stringify(keys.map(k => {
    const v = row[k];
    if (v instanceof Date) return [k, v.toISOString()];
    if (Buffer.isBuffer(v)) return [k, v.toString("base64")];
    return [k, v];
  }));
}

async function tableHash(c: mysql.Connection, table: string, key: string) {
  const [rows] = await c.query<any[]>(`SELECT * FROM \`${table}\` ORDER BY \`${key}\``);
  const h = createHash("sha256");
  for (const r of rows) h.update(canonical(r));
  return { count: rows.length, hash: h.digest("hex").slice(0, 16) };
}

/**
 * AUTO_INCREMENT positions, read LIVE.
 *
 * information_schema caches these for information_schema_stats_expiry seconds — 86400 on
 * both of these servers — so the unqualified query returns values up to a day old. Three
 * of them were stale enough to sit at or below MAX(pk), which is precisely the collision
 * this check exists to catch: it was passing by luck, not by evidence.
 */
async function autoIncrement(c: mysql.Connection) {
  await c.query("SET SESSION information_schema_stats_expiry = 0");
  const [rows] = await c.query<any[]>(
    "SELECT table_name AS t, auto_increment AS ai FROM information_schema.tables WHERE table_schema = DATABASE() AND auto_increment IS NOT NULL",
  );
  return Object.fromEntries(rows.map(r => [r.t ?? r.TABLE_NAME, Number(r.ai)]));
}

/** The real high-water mark, which is what the counter must stay ahead of. */
async function maxPk(c: mysql.Connection, table: string) {
  const key = table === "sheet_sessions" ? "rowIndex" : "id";
  try {
    const [r] = await c.query<any[]>(`SELECT IFNULL(MAX(\`${key}\`), 0) m FROM \`${table}\``);
    return Number(r[0].m);
  } catch { return 0; }
}

/** What members actually see: fees owed, session attendance, membership status. */
async function derived(c: mysql.Connection) {
  const [fees] = await c.query<any[]>("SELECT IFNULL(SUM(actualFees),0) t FROM sheet_signups");
  const [paid] = await c.query<any[]>("SELECT IFNULL(SUM(amount),0) t FROM sheet_payments");
  const [byStatus] = await c.query<any[]>("SELECT memberStatus s, COUNT(*) n FROM users GROUP BY memberStatus ORDER BY memberStatus");
  const [busiest] = await c.query<any[]>(
    "SELECT pool, dateOfTraining, COUNT(*) n FROM sheet_signups WHERE TRIM(pool) <> '' GROUP BY pool, dateOfTraining ORDER BY n DESC, dateOfTraining DESC LIMIT 5",
  );
  return {
    totalFees: Number(fees[0].t).toFixed(2),
    totalPaid: Number(paid[0].t).toFixed(2),
    membersByStatus: byStatus.map(r => `${r.s}:${r.n}`).join(", "),
    busiestSessions: busiest.map(r => `${r.pool}/${r.dateOfTraining}:${r.n}`).join(", "),
  };
}

async function main() {
  // dateStrings on both sides: timestamps must be compared as MySQL stores them, not as
  // JS Dates reinterpreted through this machine's timezone.
  const old = await mysql.createConnection({ uri: process.env.DATABASE_URL as string, dateStrings: true });
  const nw = await mysql.createConnection({ uri: process.env.NEW_DATABASE_URL as string, dateStrings: true });
  let problems = 0;

  console.log("DB-PRIMARY TABLES — every row compared (the Sheet cannot restore these)\n");
  console.log("  table                 rows      old hash / new hash");
  for (const [table, key] of DB_PRIMARY) {
    const a = await tableHash(old, table, key);
    const b = await tableHash(nw, table, key);
    const ok = a.count === b.count && a.hash === b.hash;
    if (!ok) problems++;
    console.log(`  ${table.padEnd(18)} ${String(a.count).padStart(6)}      ${a.hash} / ${b.hash}  ${ok ? "identical" : "*** DIFFERS ***"}`);
  }

  console.log("\nPAYMENTS — Sheet is source of truth; ids are not stable, so compare the money\n");
  const money = async (c: mysql.Connection) => {
    const [t] = await c.query<any[]>("SELECT COUNT(*) n, IFNULL(SUM(amount),0) total FROM sheet_payments");
    const [byRef] = await c.query<any[]>(
      "SELECT LOWER(TRIM(paymentId)) p, IFNULL(SUM(amount),0) t FROM sheet_payments GROUP BY LOWER(TRIM(paymentId)) ORDER BY p",
    );
    const h = createHash("sha256");
    for (const r of byRef) h.update(`${r.p}:${Number(r.t).toFixed(2)}`);
    return { count: Number(t[0].n), total: Number(t[0].total).toFixed(2), perMember: h.digest("hex").slice(0, 16), refs: byRef.length };
  };
  const pa = await money(old), pb = await money(nw);
  const payOk = pa.count === pb.count && pa.total === pb.total && pa.perMember === pb.perMember;
  if (!payOk) problems++;
  console.log(`  rows:              ${pa.count} vs ${pb.count}`);
  console.log(`  total:             $${pa.total} vs $${pb.total}`);
  console.log(`  per-member totals: ${pa.refs} refs, ${pa.perMember} vs ${pb.perMember}  ${payOk ? "identical" : "*** DIFFERS ***"}`);

  console.log("\nAUTO_INCREMENT — the new counter must be AHEAD OF ITS OWN highest id\n");
  const aiOld = await autoIncrement(old), aiNew = await autoIncrement(nw);
  for (const table of Object.keys(aiOld).sort()) {
    const a = aiOld[table], b = aiNew[table] ?? 0;
    const highest = await maxPk(nw, table);
    // The test that matters is against the NEW database's own data, not against the old
    // counter: comparing the two counters tells you nothing about whether the next insert
    // collides, and payments legitimately renumber on each side anyway.
    const ok = b > highest;
    if (!ok) problems++;
    console.log(`  ${table.padEnd(22)} old ${String(a).padStart(8)}   new ${String(b).padStart(8)}   new max id ${String(highest).padStart(8)}  ${ok ? "ok" : "*** WOULD COLLIDE ***"}`);
  }

  console.log("\nDERIVED FIGURES — what the app computes at read time\n");
  const da = await derived(old), db2 = await derived(nw);
  for (const k of Object.keys(da) as (keyof typeof da)[]) {
    const ok = da[k] === db2[k];
    if (!ok) problems++;
    console.log(`  ${k.padEnd(18)} ${ok ? "match" : "*** DIFFERS ***"}\n      old: ${da[k]}\n      new: ${db2[k]}`);
  }

  await old.end();
  await nw.end();

  if (problems) {
    console.error(`\n${problems} problem(s) found — DO NOT CUT OVER.`);
    process.exit(1);
  }
  console.log("\nEverything matches. The new database is a faithful copy.");
}

main().catch(e => { console.error(e.code || e.message); process.exit(1); });
