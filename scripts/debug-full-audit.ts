import "dotenv/config";
import { google } from "googleapis";
import { ENV } from "../server/_core/env";

const SHEET_ID = "19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM";
const TARGET_EMAIL = "tanmelanie@gmail.com";

async function getSheets() {
  let creds = JSON.parse(ENV.googleServiceAccountJson);
  if (typeof creds.private_key === "string")
    creds.private_key = creds.private_key.replace(/\\n/g, "\n");
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

async function main() {
  const sheets = await getSheets();

  // ── 1. All sign-ups for this email ──────────────────────────────────────────
  const suRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "Training Sign-ups" });
  const suRows = suRes.data.values ?? [];
  console.log("Sign-ups header:", suRows[0]);
  const mySignups = suRows.slice(1).filter(r => (r[1] || "").toLowerCase().trim() === TARGET_EMAIL);
  console.log(`\n── My sign-ups (${mySignups.length} rows) ────────────────────`);
  mySignups.forEach((r, i) => {
    console.log(`  [${i}] date="${r[5]}"  pool="${r[4]}"  activity="${r[6]}"  baseFee=${r[8]}  actualFee=${r[9]}  memberOnDate="${r[10]}"`);
  });
  const totalFees = mySignups.reduce((s, r) => s + parseFloat((r[9]||"0").replace(/[$,]/g,"")) || 0, 0);
  console.log(`  TOTAL ACTUAL FEES: $${totalFees.toFixed(2)}`);

  // ── 2. All payments for this email ──────────────────────────────────────────
  const pmRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "Payments" });
  const pmRows = pmRes.data.values ?? [];
  console.log("\nPayments header:", pmRows[0]);
  const myPayments = pmRows.slice(1).filter(r => (r[6] || "").toLowerCase().trim() === TARGET_EMAIL);
  console.log(`\n── My payments (${myPayments.length} rows) ────────────────────`);
  myPayments.forEach((r, i) => {
    console.log(`  [${i}] date="${r[2]}"  amount=${r[3]}  ref="${r[4]}"  matched="${r[5]}"  email="${r[6]}"`);
  });
  const totalPaid = myPayments.reduce((s, r) => s + parseFloat((r[3]||"0").replace(/[$,]/g,"")) || 0, 0);
  console.log(`  TOTAL PAID: $${totalPaid.toFixed(2)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
