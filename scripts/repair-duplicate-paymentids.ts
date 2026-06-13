/**
 * Finds users who share a paymentId and re-assigns the duplicates.
 *
 * Strategy: within each duplicate group the OLDEST user (lowest id) keeps
 * the original paymentId. Every newer duplicate is re-assigned the next
 * available numeric suffix (samuel → samuel1, samuel2, …).
 *
 * Tables updated:
 *   users      — auth table; source of truth for login attribution
 *   sheetUsers — DB cache of the Google Sheets "Users" tab; updated here so
 *                the app sees the new ID immediately. NOTE: a manual forceSync
 *                (Admin → Data tab) would revert this unless you also update
 *                col A (PaymentID) in the actual Google Sheet for this user.
 *
 * Tables NOT updated (handle these manually):
 *   sheetPayments — GAS-owned cache; full DELETE+INSERT on every payment sync
 *                   would revert any DB change here. Edit col F in the Google
 *                   Sheet "Payments" tab directly instead.
 *   sheetSignups  — DB-primary; patch affected rows in the Admin panel or
 *                   via the Railway MySQL console.
 *
 * Usage:
 *   pnpm tsx scripts/repair-duplicate-paymentids.ts          # dry run (safe, no writes)
 *   pnpm tsx scripts/repair-duplicate-paymentids.ts --apply  # execute the repairs
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, or, sql } from "drizzle-orm";
import { users, sheetUsers } from "../drizzle/schema";

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
      console.log(`  ACTION NEEDED after --apply:`);
      console.log(`    • Google Sheet "Users" tab col A: change "${dupId}" → "${newId}" for ${email}`);
      console.log(`    • Google Sheet "Payments" tab col F: change "${dupId}" → "${newId}" for rows belonging to ${email}`);
      console.log(`    • sheetSignups rows with paymentId="${dupId}" and email="${email}": update to "${newId}" manually`);

      if (!APPLY) continue;

      // users table (auth — source of truth)
      await db.update(users)
        .set({ paymentId: newId })
        .where(eq(users.id, dup.id));

      // sheetUsers table (DB cache — gives immediate effect; survives until next forceSync)
      await db.update(sheetUsers)
        .set({ paymentId: newId, sheetId: newId })
        .where(or(eq(sheetUsers.email, email), eq(sheetUsers.userEmail, email)));

      console.log(`  DONE id=${dup.id} — remember to update the Google Sheets manually.`);
    }
    console.log();
  }

  if (!APPLY) {
    console.log("--- DRY RUN complete — no changes written. Re-run with --apply to execute. ---\n");
  } else {
    console.log("--- DB repairs applied. Complete the manual Google Sheet steps listed above. ---\n");
  }
}

main().catch(err => { console.error(err); process.exit(1); });
