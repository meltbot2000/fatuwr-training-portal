import "dotenv/config";
import { getPayments, findUserByEmail } from "../server/googleSheets";

const TARGET_EMAIL = "tanmelanie@gmail.com";

async function main() {
  const user = await findUserByEmail(TARGET_EMAIL);
  console.log("\n── User ──────────────────────────────────────");
  console.log("  paymentId:", user?.paymentId);
  console.log("  email:    ", user?.email);

  const payments = await getPayments();
  console.log(`\n── All Payments (${payments.length} matched rows) ────────────────────`);
  payments.slice(0, 10).forEach((p, i) => {
    console.log(`  [${i}] email="${p.email}"  ref="${p.paymentId}"  amount=${p.amount}  date="${p.date}"`);
  });

  const emailLower = TARGET_EMAIL.toLowerCase();
  const mine = payments.filter(p => p.email === emailLower);
  console.log(`\n── My payments (email="${TARGET_EMAIL}") ───────────────`);
  if (mine.length === 0) console.log("  (none matched)");
  mine.forEach(p => console.log(`  ref="${p.paymentId}"  amount=${p.amount}  date="${p.date}"`));
  console.log(`  Total paid: $${mine.reduce((s, p) => s + p.amount, 0)}`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
