import "dotenv/config";
import { google } from "googleapis";
import { ENV } from "../server/_core/env";

const SHEET_ID = "19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM";

async function main() {
  let creds = JSON.parse(ENV.googleServiceAccountJson);
  if (typeof creds.private_key === "string") creds.private_key = creds.private_key.replace(/\\n/g, "\n");
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const sheets = google.sheets({ version: "v4", auth });

  // Pull Payments as VALUES and as FORMULAS to detect in-sheet formulas in F/G
  const valsRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "Payments", valueRenderOption: "FORMATTED_VALUE" });
  const formRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "Payments", valueRenderOption: "FORMULA" });
  const vals = valsRes.data.values ?? [];
  const form = formRes.data.values ?? [];
  console.log(`Payments rows: ${vals.length}`);

  // 1) Are F (idx5) / G (idx6) FORMULAS anywhere?
  let fFormula = 0, gFormula = 0;
  const formulaSamples: string[] = [];
  for (let i = 1; i < form.length; i++) {
    const f = (form[i]?.[5] ?? "").toString();
    const g = (form[i]?.[6] ?? "").toString();
    if (f.startsWith("=")) { fFormula++; if (formulaSamples.length < 3) formulaSamples.push(`row${i+1} F: ${f}`); }
    if (g.startsWith("=")) { gFormula++; if (formulaSamples.length < 6) formulaSamples.push(`row${i+1} G: ${g}`); }
  }
  console.log(`\n=== Formula check === F cells with formula: ${fFormula}, G cells with formula: ${gFormula}`);
  formulaSamples.forEach(s => console.log("  ", s));

  // 2) Email-fill pattern over time: last 50 rows — show date, OTHR(E), match(F), email(G)
  console.log(`\n=== Last 50 rows: C=date | E=othr | F=match | G=email ===`);
  for (let i = Math.max(1, vals.length - 50); i < vals.length; i++) {
    const r = vals[i];
    const e = (r?.[4] ?? "").toString();
    const f = (r?.[5] ?? "").toString();
    const g = (r?.[6] ?? "").toString();
    // flag rows where F is set but E does NOT contain F (matched despite non-matching reference)
    const mysterious = f && !e.toLowerCase().includes(f.toLowerCase()) ? "  <-- F set, but ref!=F" : "";
    console.log(`  row${(i+1).toString().padStart(3)} | ${(r?.[2]??"").toString().padEnd(20)} | E="${e.slice(0,28).padEnd(28)}" | F="${f.padEnd(12)}" | G="${g}"${mysterious}`);
  }

  // 3) Dump the RAW BODY (col A) of the mysterious rows so we can see what identifier is present
  console.log(`\n=== RAW BODIES of rows where F is set but reference doesn't contain F ===`);
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i];
    const e = (r?.[4] ?? "").toString();
    const f = (r?.[5] ?? "").toString();
    if (f && !e.toLowerCase().includes(f.toLowerCase())) {
      const body = (r?.[0] ?? "").toString().replace(/\s+/g, " ").slice(0, 400);
      console.log(`\n  --- row${i+1} F="${f}" E="${e}" ---\n  ${body}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
