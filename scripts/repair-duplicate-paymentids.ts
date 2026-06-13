/**
 * Finds users who share a paymentId and re-assigns the duplicates.
 *
 * Strategy: within each duplicate group the OLDEST user (lowest id) keeps
 * the original paymentId. Every newer duplicate is re-assigned the next
 * available numeric suffix (samuel → samuel1, samuel2, …) and all rows in
 * sheetUsers, sheetPayments, and sheetSignups that are linked to that user
 * by email are updated to the new paymentId.
 *
 * Usage:
 *   pnpm tsx scripts/repair-duplicate-paymentids.ts          # dry run (safe, no writes)
 *   pnpm tsx scripts/repair-duplicate-paymentids.ts --apply  # execute the repairs
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, or, sql } from "drizzle-orm";
import { users, sheetUsers, sheetPayments, sheetSignups } from "../drizzle/schema";

const APPLY = process.argv.includes("--apply");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const db = drizzle(process.env.DATABASE_URL);

  console.log(`\n=== repair-duplicate-paymentids (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  // ── 1. Find all paymentIds that appear more than once in the users table ──────
  const dupRows = await db
    .select({ paymentId: users.paymentId, count: sql<number>`count(*)` })
    .from(users)
    .groupBy(users.paymentId)
    .having(sql`count(*) > 1`);

  const duplicateIds = dupRows
    .map(r => (r.paymentId || "").toLowerCase().trim())
    .filter(Boolean);

  if (duplicateIds.length === 0) {
    console.log("No duplicate paymentIds found in the users table. Nothing to do.");
    return;
  }

  console.log(`Found ${duplicateIds.length} duplicate paymentId(s): ${duplicateIds.join(", ")}\n`);

  // ── 2. Fetch ALL existing paymentIds so we can pick non-conflicting new ones ──
  const allRows = await db.select({ paymentId: users.paymentId }).from(users);
  const takenIds = new Set(
    allRows.map(r => (r.paymentId || "").toLowerCase().trim()).filter(Boolean)
  );

  // ── 3. Process each duplicate group ─────────────────────────────────────────
  for (const dupId of duplicateIds) {
    const group = await db
      .select()
      .from(users)
      .where(sql`LOWER(TRIM(paymentId)) = ${dupId}`)
      .orderBy(users.id); // ascending → oldest first

    console.log(`--- paymentId "${dupId}" — ${group.length} users ---`);
    group.forEach(u =>
      console.log(`  id=${u.id}  email=${u.email}  createdAt=${u.createdAt?.toISOString()}`)
    );

    // Keep the oldest; reassign the rest
    const [_original, ...duplicates] = group;

    for (const dup of duplicates) {
      if (!dup.email) {
        console.log(`  SKIP id=${dup.id}: no email on record`);
        continue;
      }
      const email = dup.email.toLowerCase().trim();

      // Pick next free numeric suffix
      let newId = dupId;
      for (let n = 1; n <= 999; n++) {
        const candidate = `${dupId}${n}`;
        if (!takenIds.has(candidate)) { newId = candidate; break; }
      }
      takenIds.add(newId); // reserve it for subsequent iterations

      console.log(`  REASSIGN id=${dup.id} (${email}): "${dupId}" → "${newId}"`);

      if (!APPLY) continue;

      // users table
      await db.update(users)
        .set({ paymentId: newId })
        .where(eq(users.id, dup.id));

      // sheetUsers table (match by email or userEmail)
      await db.update(sheetUsers)
        .set({ paymentId: newId, sheetId: newId })
        .where(or(eq(sheetUsers.email, email), eq(sheetUsers.userEmail, email)));

      // sheetPayments — only rows whose email matches this user
      // (rows with no email and paymentId=dupId belong to the original owner)
      await db.update(sheetPayments)
        .set({ paymentId: newId })
        .where(
          sql`LOWER(TRIM(paymentId)) = ${dupId} AND LOWER(TRIM(email)) = ${email}`
        );

      // sheetSignups — same logic
      await db.update(sheetSignups)
        .set({ paymentId: newId })
        .where(
          sql`LOWER(TRIM(paymentId)) = ${dupId} AND LOWER(TRIM(email)) = ${email}`
        );

      console.log(`  DONE id=${dup.id}`);
    }
    console.log();
  }

  if (!APPLY) {
    console.log("--- DRY RUN complete — no changes written. Re-run with --apply to execute. ---\n");
  } else {
    console.log("--- All repairs applied. ---\n");
  }
}

main().catch(err => { console.error(err); process.exit(1); });
