import "dotenv/config";
import { getPayments, getAllSignupsByEmail } from "../server/googleSheets";

const EMAIL = "tanmelanie@gmail.com";

async function getMyPayments(email: string, allPayments: Awaited<ReturnType<typeof getPayments>>) {
  const byEmail = allPayments.filter(p => p.email === email);
  const myRefs = new Set(byEmail.map(p => p.paymentId.toLowerCase().trim()).filter(Boolean));
  const byRef = allPayments.filter(p => !p.email && p.paymentId && myRefs.has(p.paymentId.toLowerCase().trim()));
  return { myPayments: [...byEmail, ...byRef], myPaymentRefs: myRefs };
}

async function main() {
  const allPayments = await getPayments();
  const { myPayments, myPaymentRefs } = await getMyPayments(EMAIL, allPayments);
  
  console.log("── Payment refs ────────────────────────────────────");
  console.log("  refs:", [...myPaymentRefs]);

  console.log(`\n── All matched payments (${myPayments.length}) ──────────────────────`);
  myPayments.forEach((p, i) => console.log(`  [${i}] amount=$${p.amount}  date="${p.date}"  ref="${p.paymentId}"  email="${p.email || "(carry-over)"}"`));
  const totalPaid = myPayments.reduce((s, p) => s + p.amount, 0);
  console.log(`  TOTAL PAID: $${totalPaid.toFixed(2)}`);

  const mySignups = await getAllSignupsByEmail(EMAIL, myPaymentRefs);
  const training = mySignups.filter(s => s.activity !== "Membership Fee" && s.activity !== "Trial Membership");
  const membership = mySignups.filter(s => s.activity === "Membership Fee" || s.activity === "Trial Membership");

  console.log(`\n── Training sign-ups (${training.length}) ─────────────────────────`);
  training.forEach((s, i) => console.log(`  [${i}] ${s.dateOfTraining.slice(0,10)}  ${s.pool}  actualFee=$${s.actualFees}`));
  const totalTraining = training.reduce((s, r) => s + r.actualFees, 0);
  console.log(`  TOTAL: $${totalTraining.toFixed(2)}`);

  console.log(`\n── Membership entries (${membership.length}) ──────────────────────`);
  membership.forEach((s, i) => console.log(`  [${i}] activity="${s.activity}"  actualFee=$${s.actualFees}`));
  const totalMembership = membership.reduce((s, r) => s + r.actualFees, 0);
  console.log(`  TOTAL: $${totalMembership.toFixed(2)}`);

  const totalFees = totalTraining + totalMembership;
  console.log(`\n── Final Summary ────────────────────────────────────`);
  console.log(`  Training fees:   $${totalTraining.toFixed(2)}`);
  console.log(`  Membership fees: $${totalMembership.toFixed(2)}`);
  console.log(`  Total fees:      $${totalFees.toFixed(2)}`);
  console.log(`  Total paid:      $${totalPaid.toFixed(2)}`);
  const debt = Math.max(0, totalFees - totalPaid);
  if (debt > 0) {
    console.log(`  DEBT:            $${debt.toFixed(2)}`);
  } else {
    console.log(`  CREDIT:          $${(totalPaid - totalFees).toFixed(2)}`);
  }
}
main().catch(err => { console.error(err); process.exit(1); });
