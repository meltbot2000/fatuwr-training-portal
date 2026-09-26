import "dotenv/config";
import { google } from "googleapis";
import { ENV } from "../server/_core/env";

const SHEET_ID = "19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM";
const NEEDLES = ["nur", "jod", "jodie", "nurul"];

function hit(s: any) {
  const v = (s ?? "").toString().toLowerCase();
  return NEEDLES.some(n => v.includes(n));
}

async function main() {
  let creds = JSON.parse(ENV.googleServiceAccountJson);
  if (typeof creds.private_key === "string") {
    creds.private_key = creds.private_key.replace(/\\n/g, "\n");
  }
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // ---- USER tab ----
  const userRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "User" });
  const users = userRes.data.values ?? [];
  console.log(`\n===== USER TAB (rows: ${users.length}) =====`);
  console.log("HEADER:", JSON.stringify(users[0]));
  const emptyA = users.slice(1).filter(r => !(r[0] ?? "").toString().trim()).length;
  console.log(`Users with EMPTY col A (paymentId): ${emptyA}`);
  console.log("Matching User rows (needles: " + JSON.stringify(NEEDLES) + ")  [A=PaymentID, name cols, D=email]:");
  for (let i = 1; i < users.length; i++) {
    const r = users[i];
    // check across all columns for the needle
    if (r.some(hit)) {
      console.log(`  row[${i + 1}]: A(payId)="${r[0]}" | B="${r[1]}" | C="${r[2]}" | D(email)="${r[3]}" | H="${r[7] ?? ""}"`);
    }
  }

  // ---- PAYMENTS tab ----
  const payRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "Payments" });
  const pays = payRes.data.values ?? [];
  console.log(`\n===== PAYMENTS TAB (rows: ${pays.length}) =====`);
  console.log("Matching Payment rows  [C=date, D=amt, E=OTHR ref, F=payIdMatch, G=email]:");
  for (let i = 1; i < pays.length; i++) {
    const r = pays[i];
    // match on OTHR ref (col E=4), payId match (F=5), email (G=6), or raw body (A=0)
    if (hit(r[4]) || hit(r[5]) || hit(r[6]) || hit(r[0])) {
      console.log(`  row[${i + 1}]: C="${r[2]}" D="${r[3]}" E(othr)="${JSON.stringify(r[4])}" F(match)="${JSON.stringify(r[5])}" G(email)="${JSON.stringify(r[6])}"`);
    }
  }

  // ---- Simulate lookupUserByPaymentRef for each matching payment's OTHR ref ----
  console.log(`\n===== MATCH SIMULATION (exact lowercased+trimmed col A == OTHR) =====`);
  const userColA = users.slice(1).map(r => (r[0] ?? "").toString().toLowerCase().trim());
  for (let i = 1; i < pays.length; i++) {
    const r = pays[i];
    if (!(hit(r[4]) || hit(r[5]) || hit(r[6]) || hit(r[0]))) continue;
    const othr = (r[4] ?? "").toString().toLowerCase().trim();
    if (!othr) continue;
    const exact = userColA.includes(othr);
    const looseMatches = userColA.filter(a => a && (a.includes(othr) || othr.includes(a)));
    console.log(`  row[${i + 1}] othr=${JSON.stringify(othr)} → exactMatchInUserColA=${exact}` +
      (exact ? "" : ` | closest(substring) candidates: ${JSON.stringify(looseMatches.slice(0, 5))}`));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
