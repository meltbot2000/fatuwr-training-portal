import "dotenv/config";
import { google } from "googleapis";
import { ENV } from "../server/_core/env";

const SHEET_ID = "19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM";

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

  // ── Sign-ups: unique activities ──────────────────────────────────────────────
  const suRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "Training Sign-ups" });
  const suRows = (suRes.data.values ?? []).slice(1);
  const activities = new Map<string, { count: number; fees: number[] }>();
  suRows.forEach(r => {
    const act = r[6] || "(empty)";
    if (!activities.has(act)) activities.set(act, { count: 0, fees: [] });
    const entry = activities.get(act)!;
    entry.count++;
    const fee = parseFloat((r[9]||"0").replace(/[$,]/g,"")) || 0;
    entry.fees.push(fee);
  });
  console.log("── All unique activities in Training Sign-ups ──────────────");
  [...activities.entries()].sort((a,b) => b[1].count - a[1].count).forEach(([act, info]) => {
    const min = Math.min(...info.fees), max = Math.max(...info.fees);
    console.log(`  "${act}" — ${info.count} rows, fees range $${min}–$${max}`);
  });

  // ── Sessions: show "Membership" rows ────────────────────────────────────────
  const sessRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "Training Sessions" });
  const sessRows = (sessRes.data.values ?? []).slice(1);
  const membershipSessions = sessRows.filter(r => (r[1]||"").toLowerCase() === "membership");
  console.log(`\n── Training Sessions where day="Membership" (${membershipSessions.length} rows) ─`);
  membershipSessions.forEach(r => {
    console.log(`  date="${r[0]}" day="${r[1]}" pool="${r[3]}" memberFee=${r[5]} nonMemberFee=${r[6]}`);
  });

  // ── Sign-ups that match a Membership session pool/date ──────────────────────
  const membershipPools = new Set(membershipSessions.map(r => (r[3]||"").toLowerCase()));
  const membershipSignups = suRows.filter(r => {
    const pool = (r[4]||"").toLowerCase();
    return membershipPools.has(pool) || (r[6]||"").toLowerCase().includes("member");
  });
  console.log(`\n── Sign-ups matching membership pool or activity (${membershipSignups.length} rows) ─`);
  membershipSignups.slice(0,10).forEach(r => {
    console.log(`  email="${r[1]}"  pool="${r[4]}"  date="${r[5]}"  activity="${r[6]}"  actualFee=${r[9]}`);
  });

  // ── Special adjustment column [17] ──────────────────────────────────────────
  const withAdj = suRows.filter(r => r[17] && r[17].trim());
  console.log(`\n── Sign-ups with Special Adjustment [col 18] (${withAdj.length} rows) ─`);
  withAdj.slice(0,10).forEach(r => {
    console.log(`  email="${r[1]}"  date="${r[5]}"  actualFee=${r[9]}  adj="${r[17]}"`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
