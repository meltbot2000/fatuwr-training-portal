/**
 * Runs the APP'S OWN read paths against whichever database DATABASE_URL points at and
 * prints a stable JSON summary. Run once per database and diff: identical output means
 * the app cannot tell them apart.
 */
import "dotenv/config";
import { getSessions, getUpcomingSessions, getSignUpsForSession, getPayments, getAllSignupsByEmail, getUsers } from "../server/googleSheets";
import { getDb } from "../server/db";
import { users as usersTable } from "../drizzle/schema";

// mirrors getMyPayments in server/routers.ts (module-private there)
function extractRef(reference: string): string {
  const m = reference.match(/OTHR-([\w]+)\)/i);
  return (m ? m[1] : reference).toLowerCase().trim();
}
function myPayments(all: any[], email: string, userPaymentId: string) {
  const norm = (userPaymentId || "").toLowerCase().trim();
  const refs = new Set<string>();
  if (norm) refs.add(norm);
  all.filter(p => (p.email || "").toLowerCase().trim() === email)
     .map(p => (p.paymentId || "").toLowerCase().trim()).filter(Boolean).forEach(i => refs.add(i));
  const rows = all.filter(p => {
    const pid = (p.paymentId || "").toLowerCase().trim();
    const em = (p.email || "").toLowerCase().trim();
    if (pid) return refs.has(pid);
    if (em) return em === email;
    if (p.reference && norm) return extractRef(p.reference) === norm;
    return false;
  });
  const myRefs = new Set(rows.map(p => (p.paymentId || "").toLowerCase().trim()).filter(Boolean));
  if (norm) myRefs.add(norm);
  return { rows, myRefs };
}

async function main() {
  const out: any = {};
  const sessions = await getSessions();
  out.sessionCount = sessions.length;
  out.upcoming = (await getUpcomingSessions()).map(s => `${s.rowId}|${s.pool}|${s.trainingDate}|${s.trainingTime}`);

  // every session's roster, through the real query path (fast path, JS date match, cache)
  out.rosters = {};
  for (const s of sessions) {
    const rows = await getSignUpsForSession(s.trainingDate, s.pool, { fresh: true });
    out.rosters[`${s.pool}|${s.trainingDate}`] = rows
      .map(r => `${r.id}:${r.name}:${r.activity}:${r.actualFees}:${r.memberOnTrainingDate}`)
      .sort().join(",");
  }

  // every member's money, through the real matching rules
  const payments = await getPayments();
  out.paymentCount = payments.length;
  const db = await getDb();
  const authUsers = db ? await db.select().from(usersTable) : [];
  out.debts = {};
  for (const u of authUsers as any[]) {
    const email = (u.email || "").toLowerCase().trim();
    const pid = (u.paymentId || "").trim();
    const { rows, myRefs } = myPayments(payments, email, pid);
    const signups = await getAllSignupsByEmail(email, myRefs, pid);
    const fees = signups.reduce((n, s) => n + (s.actualFees || 0), 0);
    const paid = rows.reduce((n, p) => n + (p.amount || 0), 0);
    out.debts[`${u.id}|${email || "(blank)"}|${pid}`] =
      `fees=${fees.toFixed(2)} paid=${paid.toFixed(2)} debt=${Math.max(0, fees - paid).toFixed(2)} signups=${signups.length}`;
  }
  out.sheetUserCount = (await getUsers()).length;
  // sort keys recursively; passing an array as the replacer filters nested keys away,
  // which silently reduced this to a handful of scalars
  const sortDeep = (v: any): any =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortDeep(v[k])]))
      : v;
  console.log(JSON.stringify(sortDeep(out)));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
