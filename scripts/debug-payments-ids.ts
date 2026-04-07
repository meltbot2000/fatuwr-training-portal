import "dotenv/config";
import { google } from "googleapis";
import { ENV } from "../server/_core/env";

const SHEET_ID = "19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM";

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
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Payments",
  });
  const rows = res.data.values ?? [];

  // Show last 10 rows to see recent/real data
  console.log(`Total rows: ${rows.length}`);
  console.log("\nLast 10 data rows:");
  for (let i = Math.max(1, rows.length - 10); i < rows.length; i++) {
    console.log(`  row[${i+1}]: [0]="${rows[i][0]?.toString().substring(0,30)}" [1]="${rows[i][1]?.toString().substring(0,30)}" [2]="${rows[i][2]}" [3]="${rows[i][3]}" [4]="${rows[i][4]}" [5]="${rows[i][5]}" [6]="${rows[i][6]}"`);
  }

  // Show unique values in col 5 (PaymentID Match)
  const col5 = new Set(rows.slice(1).map(r => r[5] || "").filter(Boolean));
  console.log("\nUnique values in col F (PaymentID Match), first 30:");
  [...col5].slice(0, 30).forEach(v => console.log("  ", JSON.stringify(v)));
  
  // Show unique values in col 4 (OTHR Message)
  const col4 = new Set(rows.slice(1).map(r => r[4] || "").filter(Boolean));
  console.log("\nUnique values in col E (OTHR Message), first 30:");
  [...col4].slice(0, 30).forEach(v => console.log("  ", JSON.stringify(v)));
}

main().catch(err => { console.error(err); process.exit(1); });
