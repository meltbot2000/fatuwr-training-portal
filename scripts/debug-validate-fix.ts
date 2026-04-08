import "dotenv/config";
import { getAllSignupsByEmail, getPayments } from "../server/googleSheets";

const EMAIL = "tanmelanie@gmail.com";

async function main() {
  const allPayments = await getPayments();
  const myPaymentsRaw = allPayments.filter(p => p.email === EMAIL.toLowerCase());
  const myPaymentRefs = new Set(myPaymentsRaw.map(p => p.paymentId.toLowerCase().trim()).filter(Boolean));

  console.log("\n── Payment refs for this user ───────────────────────────────");
  console.log("  refs:", [...myPaymentRefs]);

  const mySignups = await getAllSignupsByEmail(EMAIL, myPaymentRefs);

  const training     = mySignups.filter(s => s.activity !== "Membership Fee");
  const membership   = mySignups.filter(s => s.activity === "Membership Fee");

  console.log(`\n── Training sign-ups (${training.length}) ────────────────────────────`);
  training.forEach((s, i) => console.log(`  [${i}] ${s.dateOfTraining.slice(0,10)}  ${s.pool}  actualFee=${s.actualFees}`));
  const totalTraining = training.reduce((s, r) => s + r.actualFees, 0);
  console.log(`  TOTAL TRAINING FEES: $${totalTraining.toFixed(2)}`);

  console.log(`\n── Membership fee entries (${membership.length}) ─────────────────────────`);
  membership.forEach((s, i) => console.log(`  [${i}] date="${s.dateTimeOfSignUp.slice(0,10)}"  activity="${s.activity}"  actualFee=${s.actualFees}`));
  const totalMembership = membership.reduce((s, r) => s + r.actualFees, 0);
  console.log(`  TOTAL MEMBERSHIP FEES: $${totalMembership.toFixed(2)}`);

  const totalFees = totalTraining + totalMembership;
  const totalPaid = myPaymentsRaw.reduce((s, p) => s + p.amount, 0);
  const debt = Math.max(0, totalFees - totalPaid);

  console.log(`\n── Summary ──────────────────────────────────────────────────`);
  console.log(`  Training fees:   $${totalTraining.toFixed(2)}`);
  console.log(`  Membership fees: $${totalMembership.toFixed(2)}`);
  console.log(`  Total fees:      $${totalFees.toFixed(2)}`);
  console.log(`  Total paid:      $${totalPaid.toFixed(2)}`);
  console.log(`  Debt:            $${debt.toFixed(2)} ${debt === 0 ? `(credit: $${(totalPaid - totalFees).toFixed(2)})` : ""}`);
}

main().catch(err => { console.error(err); process.exit(1); });
