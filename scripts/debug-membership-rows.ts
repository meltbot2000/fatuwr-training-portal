import "dotenv/config";
import { google } from "googleapis";
import { ENV } from "../server/_core/env";

const SHEET_ID = "19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM";

async function getSheets() {
  let creds = JSON.parse(ENV.googleServiceAccountJson);
  if (typeof creds.private_key === "string")
    creds.private_key = creds.private_key.replace(/\\n/g, "\n");
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  return google.sheets({ version: "v4", auth });
}

async function main() {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "Training Sign-ups" });
  const rows = res.data.values ?? [];
  const header = rows[0];
  console.log("Header (all cols):");
  header.forEach((h, i) => console.log(`  [${i}] "${h}"`));

  // Show all rows with activity="Membership Fee"
  const mfRows = rows.slice(1).filter(r => (r[6]||"") === "Membership Fee");
  console.log(`\n── "Membership Fee" rows (${mfRows.length} total) ─────────────────`);
  mfRows.slice(0, 15).forEach((r, i) => {
    console.log(`  [${i}] name="${r[0]}"  email="${r[1]}"  payId="${r[2]}"  dt="${r[3]}"  pool="${r[4]}"  date="${r[5]}"  act="${r[6]}"  actVal="${r[7]}"  baseFee="${r[8]}"  actualFee="${r[9]}"  member="${r[10]}"`);
  });

  // Look for anything related to "Mel" or "tanmelanie" in all columns
  console.log(`\n── Any row mentioning "mel" / "Mel" ─────────────────────────────`);
  rows.slice(1).forEach((r, i) => {
    const rowStr = r.join("|").toLowerCase();
    if (rowStr.includes("tanmelanie") || rowStr.includes("90030037") || 
        (rowStr.includes("mel") && (r[6]||"").includes("Membership"))) {
      console.log(`  row ${i+2}: ${r.slice(0,12).join(" | ")}`);
    }
  });
}

main().catch(err => { console.error(err); process.exit(1); });
