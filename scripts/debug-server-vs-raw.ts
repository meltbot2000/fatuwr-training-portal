import "dotenv/config";
import { getAllSignupsByEmail, getPayments } from "../server/googleSheets";

const TARGET_EMAIL = "tanmelanie@gmail.com";

async function main() {
  // ── What the server returns via getPayments ──────────────────────────────────
  const payments = await getPayments();
  const mine = payments.filter(p => p.email === TARGET_EMAIL.toLowerCase());
  console.log(`\n── Server getPayments() → my rows (${mine.length}) ──────────────`);
  mine.forEach((p, i) => console.log(`  [${i}] amount=${p.amount}  date="${p.date}"  ref="${p.paymentId}"`));
  console.log(`  TOTAL: $${mine.reduce((s, p) => s + p.amount, 0).toFixed(2)}`);

  // ── What the server returns via getAllSignupsByEmail ──────────────────────────
  const signups = await getAllSignupsByEmail(TARGET_EMAIL);
  console.log(`\n── Server getAllSignupsByEmail() → rows (${signups.length}) ──────────────`);
  signups.forEach((s, i) => console.log(`  [${i}] date="${s.dateOfTraining}"  pool="${s.pool}"  activity="${s.activity}"  actualFee=${s.actualFees}`));
  console.log(`  TOTAL FEES: $${signups.reduce((s, r) => s + r.actualFees, 0).toFixed(2)}`);
  console.log(`  DEBT (fees - paid): $${Math.max(0, signups.reduce((s,r)=>s+r.actualFees,0) - mine.reduce((s,p)=>s+p.amount,0)).toFixed(2)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
