/**
 * Daily DB backup — emails CSV snapshots of users, sessions, signups and payments
 * to fatuwrevents@gmail.com every day at 23:59 SGT (UTC+8).
 *
 * This gives a safe restore point in case data is accidentally overwritten
 * (e.g. an "Import from Sheets" that shouldn't have been run).
 *
 * Four attachments per email:
 *   - users.csv      (sheet_users table)
 *   - sessions.csv   (sheet_sessions table — all, not just past)
 *   - signups.csv    (sheet_signups table)
 *   - payments.csv   (sheet_payments table)
 */

import { getDb } from "./db";
import { sheetUsers, sheetSessions, sheetPayments, sheetSignups } from "../drizzle/schema";
import { ENV } from "./_core/env";

const BACKUP_RECIPIENT = "fatuwrevents@gmail.com";
const SGT_OFFSET_MS    = 8 * 60 * 60 * 1000; // UTC+8

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function escapeCsv(val: unknown): string {
  const s = val === null || val === undefined ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines   = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map(h => escapeCsv(row[h])).join(","));
  }
  return lines.join("\n");
}

// ─── Email senders (mirrors the OTP email approach) ──────────────────────────

async function sendViaSendGrid(
  subject: string,
  html: string,
  attachments: { filename: string; content: string }[]
): Promise<boolean> {
  if (!ENV.sendgridApiKey || !ENV.sendgridFrom) return false;

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.sendgridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: BACKUP_RECIPIENT }] }],
      from: { email: ENV.sendgridFrom },
      subject,
      content: [{ type: "text/html", value: html }],
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: Buffer.from(a.content).toString("base64"),
        type: "text/csv",
        disposition: "attachment",
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SendGrid HTTP ${res.status}: ${body}`);
  }
  return true;
}

async function sendViaResend(
  subject: string,
  html: string,
  attachments: { filename: string; content: string }[]
): Promise<boolean> {
  if (!ENV.resendApiKey) return false;

  const { Resend } = await import("resend");
  const resend = new Resend(ENV.resendApiKey);

  const result = await resend.emails.send({
    from: ENV.resendApiFrom,
    to: BACKUP_RECIPIENT,
    subject,
    html,
    attachments: attachments.map(a => ({
      filename: a.filename,
      content: Buffer.from(a.content),
    })),
  });

  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }
  return true;
}

// ─── Main backup routine ──────────────────────────────────────────────────────

export async function runDailyBackup(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.error("[Backup] DB not available — skipping backup");
    return;
  }

  const now      = new Date();
  const dateStr  = now.toLocaleDateString("en-SG", { timeZone: "Asia/Singapore", day: "2-digit", month: "short", year: "numeric" });
  const timeStr  = now.toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit" });

  try {
    // Fetch all four tables
    const [users, sessions, signups, payments] = await Promise.all([
      db.select().from(sheetUsers),
      db.select().from(sheetSessions),
      db.select().from(sheetSignups),
      db.select().from(sheetPayments),
    ]);

    const attachments = [
      { filename: `users_${dateStr.replace(/ /g, "_")}.csv`,    content: rowsToCsv(users    as any[]) },
      { filename: `sessions_${dateStr.replace(/ /g, "_")}.csv`, content: rowsToCsv(sessions as any[]) },
      { filename: `signups_${dateStr.replace(/ /g, "_")}.csv`,  content: rowsToCsv(signups  as any[]) },
      { filename: `payments_${dateStr.replace(/ /g, "_")}.csv`, content: rowsToCsv(payments as any[]) },
    ];

    const subject = `FATUWR Daily DB Backup — ${dateStr}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:8px;">
        <h2 style="color:#1A3A5C;margin-top:0;">FATUWR Daily Backup</h2>
        <p style="color:#444;margin:0 0 16px;">Your daily database snapshot is attached for <strong>${dateStr}</strong> at ${timeStr} SGT.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#444;">
          <tr style="background:#eee;">
            <th style="text-align:left;padding:8px 12px;border-radius:4px 0 0 4px;">Table</th>
            <th style="text-align:right;padding:8px 12px;border-radius:0 4px 4px 0;">Records</th>
          </tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">Users</td><td style="text-align:right;padding:8px 12px;border-bottom:1px solid #eee;">${users.length}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">Sessions</td><td style="text-align:right;padding:8px 12px;border-bottom:1px solid #eee;">${sessions.length}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">Sign-ups</td><td style="text-align:right;padding:8px 12px;border-bottom:1px solid #eee;">${signups.length}</td></tr>
          <tr><td style="padding:8px 12px;">Payments</td><td style="text-align:right;padding:8px 12px;">${payments.length}</td></tr>
        </table>
        <p style="color:#888;font-size:12px;margin-top:24px;">This is an automated backup from the FATUWR Training Portal. To restore data from a backup, use the "Import from Sheets" tool in Admin → Data and re-seed, or contact your developer.</p>
      </div>`;

    // Try SendGrid first, fall back to Resend
    let sent = false;
    if (ENV.sendgridApiKey && ENV.sendgridFrom) {
      try {
        sent = await sendViaSendGrid(subject, html, attachments);
        if (sent) console.log(`[Backup] Email sent via SendGrid to ${BACKUP_RECIPIENT} — ${users.length} users, ${sessions.length} sessions, ${signups.length} signups, ${payments.length} payments`);
      } catch (err: any) {
        console.error("[Backup] SendGrid failed:", err.message);
      }
    }
    if (!sent && ENV.resendApiKey) {
      try {
        sent = await sendViaResend(subject, html, attachments);
        if (sent) console.log(`[Backup] Email sent via Resend to ${BACKUP_RECIPIENT}`);
      } catch (err: any) {
        console.error("[Backup] Resend failed:", err.message);
      }
    }
    if (!sent) {
      console.warn("[Backup] ⚠️  No email provider succeeded — backup NOT sent. Check SENDGRID_API_KEY / RESEND_API_KEY.");
    }

  } catch (err: any) {
    console.error("[Backup] Failed to generate backup:", err.message);
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

/**
 * Schedules the daily backup to fire at 23:59 SGT every day.
 * On startup it calculates the ms until the next 23:59 SGT, waits,
 * fires once, then repeats every 24 hours.
 */
export function startDailyBackup(): void {
  const msUntilNext2359SGT = (): number => {
    const nowUtcMs = Date.now();
    const nowSgtMs = nowUtcMs + SGT_OFFSET_MS;

    // Build 23:59:00 SGT for today (in UTC epoch ms)
    const todayMidnightSgt = new Date(nowSgtMs);
    todayMidnightSgt.setUTCHours(0, 0, 0, 0); // midnight of today in SGT time
    const today2359UtcMs = todayMidnightSgt.getTime() - SGT_OFFSET_MS  // → real UTC midnight SGT
                           + (23 * 60 + 59) * 60 * 1000;               // + 23h59m

    let next = today2359UtcMs;
    if (next <= nowUtcMs) next += 24 * 60 * 60 * 1000; // already passed — use tomorrow

    return next - nowUtcMs;
  };

  const delay = msUntilNext2359SGT();
  const hoursUntil = (delay / 3_600_000).toFixed(1);
  console.log(`[Backup] Daily backup scheduled — first run in ${hoursUntil}h (23:59 SGT)`);

  setTimeout(() => {
    runDailyBackup().catch(console.error);
    // Repeat every 24 hours after the first run
    setInterval(() => runDailyBackup().catch(console.error), 24 * 60 * 60 * 1000);
  }, delay);
}
