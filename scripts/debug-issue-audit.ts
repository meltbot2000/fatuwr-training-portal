import "dotenv/config";
import { google } from "googleapis";
import { ENV } from "../server/_core/env";

const SHEET_ID = "19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM";
const TARGET_EMAIL = "tanmelanie@gmail.com";

async function getSheets() {
  let creds = JSON.parse(ENV.googleServiceAccountJson);
  if (typeof creds.private_key === "string") creds.private_key = creds.private_key.replace(/\\n/g, "\n");
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  return google.sheets({ version: "v4", auth });
}

async function main() {
  const sheets = await getSheets();

  // ── 1. Training Sign-ups: show header + Mel's rows with ALL columns ──────────
  const suRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "Training Sign-ups" });
  const suRows = suRes.data.values ?? [];
  const suHeader = suRows[0];
  console.log("=== Sign-ups header ===");
  suHeader.forEach((h: string, i: number) => console.log(`  [${i}] col ${String.fromCharCode(65+i)} = "${h}"`));

  const melRows = suRows.slice(1).filter((r: string[]) => (r[1]||"").toLowerCase() === TARGET_EMAIL);
  console.log(`\n=== Mel's sign-up rows (${melRows.length}) — all columns ===`);
  melRows.forEach((r: string[], i: number) => {
    console.log(`  [${i}] email="${r[1]}" date="${(r[5]||"").slice(0,10)}" pool="${r[4]}" act="${r[6]}" baseFee=col-I:"${r[8]}" actualFee=col-J:"${r[9]}" colK="${r[10]}" adj="${r[17]}"`);
  });
  const totalJ = melRows.reduce((s: number, r: string[]) => s + (parseFloat((r[9]||"0").replace(/[$,]/g,""))||0), 0);
  const totalK = melRows.reduce((s: number, r: string[]) => s + (parseFloat((r[8]||"0").replace(/[$,]/g,""))||0), 0);
  console.log(`  SUM col I (baseFee):   $${totalK.toFixed(2)}`);
  console.log(`  SUM col J (actualFee): $${totalJ.toFixed(2)}`);

  // ── 2. Membership Fee rows for Mel (by payId "Mel" or "mel") ────────────────
  const memRows = suRows.slice(1).filter((r: string[]) =>
    r[6] === "Membership Fee" && (r[2]||"").toLowerCase() === "mel"
  );
  console.log(`\n=== Membership Fee rows where payId~="mel" (${memRows.length}) ===`);
  memRows.forEach((r: string[], i: number) => {
    console.log(`  [${i}] name="${r[0]}" email="${r[1]}" payId="${r[2]}" date="${(r[5]||"").slice(0,10)}" actualFee="${r[9]}"`);
  });

  // ── 3. Payments: rows with missing/NA email ──────────────────────────────────
  const pmRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "Payments" });
  const pmRows = pmRes.data.values ?? [];
  const pmHeader = pmRows[0];
  console.log("\n=== Payments header ===");
  pmHeader.forEach((h: string, i: number) => console.log(`  [${i}] col ${String.fromCharCode(65+i)} = "${h}"`));

  const missingEmail = pmRows.slice(1).filter((r: string[]) => {
    const email = (r[6]||"").trim();
    return !email || email === "#N/A";
  });
  console.log(`\n=== Payment rows with missing/N/A email (${missingEmail.length} out of ${pmRows.length-1}) ===`);
  missingEmail.slice(0,15).forEach((r: string[], i: number) => {
    console.log(`  [${i}] date="${r[2]}" amount=${r[3]} ref="${r[4]}" matched="${r[5]}" email="${r[6]}"`);
  });

  // ── 4. All payments for Mel ──────────────────────────────────────────────────
  const melPayments = pmRows.slice(1).filter((r: string[]) => (r[6]||"").toLowerCase().trim() === TARGET_EMAIL);
  console.log(`\n=== All Mel payments (${melPayments.length}) ===`);
  melPayments.forEach((r: string[], i: number) => {
    console.log(`  [${i}] date="${r[2]}" amount=${r[3]} ref="${r[4]}" email="${r[6]}"`);
  });
}
main().catch(err => { console.error(err); process.exit(1); });
