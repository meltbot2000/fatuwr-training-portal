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
  console.log("Header row (row 0):", rows[0]);
  console.log("\nFirst 5 data rows:");
  for (let i = 1; i <= Math.min(5, rows.length - 1); i++) {
    console.log(`  row[${i}]:`, rows[i]);
  }
  // Find tanmelanie's payment id row
  console.log("\nSearching for '90030037' in all rows...");
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].some(cell => String(cell).includes("90030037"))) {
      console.log(`  FOUND at row ${i+1}:`, rows[i]);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
