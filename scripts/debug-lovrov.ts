import "dotenv/config";
import { google } from "googleapis";
import mysql from "mysql2/promise";
import { ENV } from "../server/_core/env";

const SHEET_ID = "19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM";
const IDS = ["lovrov", "jodie", "nurul", "heo"];

async function main() {
  // ---------- SHEET User tab ----------
  let creds = JSON.parse(ENV.googleServiceAccountJson);
  if (typeof creds.private_key === "string") creds.private_key = creds.private_key.replace(/\\n/g, "\n");
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const sheets = google.sheets({ version: "v4", auth });
  const userRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "User" });
  const users = userRes.data.values ?? [];

  console.log(`\n===== GOOGLE SHEET 'User' tab (rows: ${users.length}) — col A (ID) in ${JSON.stringify(IDS)} =====`);
  for (let i = 1; i < users.length; i++) {
    const a = (users[i][0] ?? "").toString().toLowerCase().trim();
    if (IDS.includes(a)) {
      console.log(`  row[${i + 1}]: A(id)="${users[i][0]}" B(name)="${users[i][1]}" D(email)="${users[i][3]}"`);
    }
  }
  console.log("(any IDs above NOT printed = absent from the sheet)");

  // ---------- DB ----------
  const c = await mysql.createConnection(process.env.DATABASE_URL as string);
  const like = IDS.map(() => "LOWER(paymentId)=?").join(" OR ");
  console.log(`\n===== DB users table =====`);
  const [u] = await c.query(`SELECT id,name,email,paymentId,createdAt FROM users WHERE ${like} ORDER BY createdAt`, IDS);
  console.table(u);
  console.log(`\n===== DB sheet_users table =====`);
  const [s] = await c.query(`SELECT id,name,email,paymentId FROM sheet_users WHERE ${like} ORDER BY id`, IDS);
  console.table(s);

  console.log(`\n===== DB sheet_payments for lovrov (by reference or paymentId) =====`);
  const [p] = await c.query(
    `SELECT id,rowIndex,paymentId,email,reference,amount,date FROM sheet_payments
     WHERE LOWER(reference) LIKE '%lovrov%' OR LOWER(paymentId)='lovrov' ORDER BY id`);
  console.table(p);

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
