import "dotenv/config";
import { google } from "googleapis";
import mysql from "mysql2/promise";
import { ENV } from "../server/_core/env";

const SHEET_ID = "19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM";

async function main() {
  // Sheet User tab col A (paymentId)
  let creds = JSON.parse(ENV.googleServiceAccountJson);
  if (typeof creds.private_key === "string") creds.private_key = creds.private_key.replace(/\\n/g, "\n");
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "User" });
  const rows = res.data.values ?? [];
  const sheetIds = new Set(rows.slice(1).map(r => (r[0] ?? "").toString().toLowerCase().trim()).filter(Boolean));
  console.log(`Sheet User tab paymentIds: ${sheetIds.size}`);

  // DB paymentIds
  const c = await mysql.createConnection(process.env.DATABASE_URL as string);
  const [su]: any = await c.query(`SELECT paymentId, email, name FROM sheet_users WHERE paymentId<>''`);
  const [u]: any  = await c.query(`SELECT paymentId, email, name, createdAt FROM users WHERE paymentId<>''`);
  await c.end();

  // DB-only ids = in DB but NOT in sheet → only B1 (DB lookup) can resolve these
  const dbOnly: any[] = [];
  const seen = new Set<string>();
  for (const r of [...su, ...u]) {
    const pid = (r.paymentId ?? "").toString().toLowerCase().trim();
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    if (!sheetIds.has(pid)) dbOnly.push({ paymentId: r.paymentId, name: r.name, email: r.email, createdAt: r.createdAt ?? "" });
  }
  console.log(`\n=== paymentIds in DB but NOT in sheet (only B1 can match these): ${dbOnly.length} ===`);
  console.table(dbOnly.slice(0, 20));
}
main().catch(e => { console.error(e); process.exit(1); });
