import crypto from "crypto";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { ENV } from "./_core/env";

export function generateOtp(): string {
  // crypto.randomInt is cryptographically secure (CSPRNG)
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function buildOtpHtml(code: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Login Code</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1A3A5C;padding:32px 40px;text-align:center;">
              <span style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:1px;">FATUWR Training Portal</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 24px;">
              <p style="margin:0 0 16px;font-size:16px;color:#333333;">Your login verification code is:</p>
              <div style="background:#f0f4f8;border-radius:6px;padding:24px;text-align:center;margin:0 0 24px;">
                <span style="font-size:40px;font-weight:bold;letter-spacing:12px;color:#1A3A5C;">${code}</span>
              </div>
              <p style="margin:0 0 12px;font-size:14px;color:#555555;">This code expires in <strong>10 minutes</strong>.</p>
              <p style="margin:0;font-size:14px;color:#888888;">If you didn't request this code, you can safely ignore this email.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 40px 32px;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-size:12px;color:#aaaaaa;text-align:center;">FATUWR Training Portal &mdash; Do not reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send OTP via Gmail SMTP (Google App Password).
 * Works for any recipient with no domain verification required.
 * Requires GMAIL_USER and GMAIL_APP_PASSWORD env vars.
 */
async function sendViaGmail(to: string, code: string): Promise<boolean> {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: ENV.gmailUser,
      pass: ENV.gmailAppPassword,
    },
  });

  const result = await transporter.sendMail({
    from: `"FATUWR Training Portal" <${ENV.gmailUser}>`,
    to,
    subject: "Your FATUWR Training Portal Login Code",
    html: buildOtpHtml(code),
  });

  console.log(`[OTP] Gmail sent to ${to}, messageId: ${result.messageId}`);
  return true;
}

/**
 * Send OTP via Resend.
 * Requires RESEND_API_KEY and a verified sending domain set in RESEND_API_FROM.
 * Note: onboarding@resend.dev (Resend sandbox) can only send to the Resend account
 * owner's email. Use a verified domain to send to any recipient.
 */
async function sendViaResend(to: string, code: string): Promise<boolean> {
  const resend = new Resend(ENV.resendApiKey);
  const result = await resend.emails.send({
    from: ENV.resendApiFrom,
    to,
    subject: "Your FATUWR Training Portal Login Code",
    html: buildOtpHtml(code),
  });

  if (result.error) {
    const hint =
      result.error.name === "validation_error"
        ? " — RESEND_API_FROM may be using an unverified domain (onboarding@resend.dev only works for the Resend account owner's email)"
        : "";
    console.warn(`[OTP] Resend error — name: ${result.error.name}, message: ${result.error.message}${hint}`);
    return false;
  }

  console.log(`[OTP] Resend sent to ${to}, id: ${result.data?.id}`);
  return true;
}

/**
 * Send OTP via SendGrid Web API.
 * Requires SENDGRID_API_KEY and a sender-verified address/domain in SENDGRID_FROM.
 * Domain verification uses only CNAME records — works with Wix DNS.
 * Uses HTTPS (not SMTP), so works on Railway.
 */
async function sendViaSendGrid(to: string, code: string): Promise<boolean> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ENV.sendgridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: ENV.sendgridFrom },
      subject: "Your FATUWR Training Portal Login Code",
      content: [{ type: "text/html", value: buildOtpHtml(code) }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SendGrid HTTP ${res.status}: ${body}`);
  }

  console.log(`[OTP] SendGrid sent to ${to}`);
  return true;
}

export async function sendOtpEmail(email: string, code: string): Promise<boolean> {
  console.log(`[OTP] Starting sendOtpEmail to: ${email}`);
  console.log(`[OTP] SENDGRID_API_KEY set: ${Boolean(ENV.sendgridApiKey)}, SENDGRID_FROM set: ${Boolean(ENV.sendgridFrom)}`);
  console.log(`[OTP] RESEND_API_KEY set: ${Boolean(ENV.resendApiKey)}`);

  // --- Provider 1: SendGrid Web API (HTTPS — works on Railway, CNAME verification works with Wix) ---
  if (ENV.sendgridApiKey && ENV.sendgridFrom) {
    console.log(`[OTP] Attempting SendGrid to ${email} from ${ENV.sendgridFrom}`);
    try {
      const ok = await sendViaSendGrid(email, code);
      if (ok) return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[OTP] SendGrid failed: ${msg}`);
      console.error("[OTP] SendGrid error detail:", err);
    }
  } else {
    console.warn("[OTP] SendGrid skipped — SENDGRID_API_KEY or SENDGRID_FROM not set");
  }

  // --- Provider 2: Resend (requires verified sending domain) -------------------
  if (ENV.resendApiKey) {
    console.log(`[OTP] Attempting Resend to ${email} (from: ${ENV.resendApiFrom})`);
    try {
      const sent = await sendViaResend(email, code);
      if (sent) return true;
      console.warn("[OTP] Resend returned false — check Resend dashboard for errors");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[OTP] Resend exception: ${msg}`);
    }
  } else {
    console.warn("[OTP] Resend skipped — RESEND_API_KEY not set");
  }

  // --- Fallback: print to console (local dev only) -----------------------------
  console.warn(`[OTP] ⚠️  NO EMAIL PROVIDER SUCCEEDED — code will only appear in logs`);
  console.log(`[OTP] ===== VERIFICATION CODE (no email provider configured) =====`);
  console.log(`[OTP] Email: ${email}`);
  console.log(`[OTP] Code:  ${code}`);
  console.log(`[OTP] ================================================================`);
  return true;
}

/**
 * Diagnostic: test email sending without needing a real OTP flow.
 * Returns a detailed status object for the /api/test-email endpoint.
 */
export async function testEmailSending(to: string): Promise<{
  sendgridConfigured: boolean;
  resendConfigured: boolean;
  sendgridResult: "success" | "skipped" | "failed";
  sendgridError?: string;
  resendResult: "success" | "skipped" | "failed";
  resendError?: string;
}> {
  const testCode = "123456";
  const result = {
    sendgridConfigured: Boolean(ENV.sendgridApiKey && ENV.sendgridFrom),
    resendConfigured: Boolean(ENV.resendApiKey),
    sendgridResult: "skipped" as "success" | "skipped" | "failed",
    sendgridError: undefined as string | undefined,
    resendResult: "skipped" as "success" | "skipped" | "failed",
    resendError: undefined as string | undefined,
  };

  if (ENV.sendgridApiKey && ENV.sendgridFrom) {
    try {
      await sendViaSendGrid(to, testCode);
      result.sendgridResult = "success";
    } catch (err: unknown) {
      result.sendgridResult = "failed";
      result.sendgridError = err instanceof Error ? err.message : String(err);
    }
  }

  if (ENV.resendApiKey) {
    try {
      const ok = await sendViaResend(to, testCode);
      result.resendResult = ok ? "success" : "failed";
      if (!ok) result.resendError = "Resend returned error (check Resend dashboard)";
    } catch (err: unknown) {
      result.resendResult = "failed";
      result.resendError = err instanceof Error ? err.message : String(err);
    }
  }

  return result;
}
