import crypto from "crypto";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { ENV } from "./_core/env";

export function generateOtp(): string {
  // crypto.randomInt is cryptographically secure (CSPRNG)
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function buildOtpHtml(code: string, topBannerHtml = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Login Code</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  ${topBannerHtml}
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
async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  const resend = new Resend(ENV.resendApiKey);
  const result = await resend.emails.send({
    from: ENV.resendApiFrom,
    to,
    subject,
    html,
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
async function sendViaSendGrid(to: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ENV.sendgridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: ENV.sendgridFrom },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SendGrid HTTP ${res.status}: ${body}`);
  }

  console.log(`[OTP] SendGrid sent to ${to}`);
  return true;
}

/**
 * Resend is only promoted ahead of SendGrid once it has a real verified sending
 * domain. The onboarding@resend.dev sandbox only delivers to the Resend account
 * owner, so until RESEND_API_FROM is a real domain we keep SendGrid first.
 * This lets the Railway RESEND_API_FROM env change flip provider priority with
 * no code deploy — and keeps a stray deploy from routing real OTPs to the sandbox.
 */
function resendHasVerifiedDomain(): boolean {
  return Boolean(ENV.resendApiKey) && !ENV.resendApiFrom.includes("resend.dev");
}

/** Attempt SendGrid. Returns true on success, false if unconfigured or failed. */
async function trySendGridOtp(to: string, subject: string, html: string): Promise<boolean> {
  if (!(ENV.sendgridApiKey && ENV.sendgridFrom)) {
    console.warn("[OTP] SendGrid skipped — SENDGRID_API_KEY or SENDGRID_FROM not set");
    return false;
  }
  console.log(`[OTP] Attempting SendGrid to ${to} from ${ENV.sendgridFrom}`);
  try {
    return await sendViaSendGrid(to, subject, html);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[OTP] SendGrid failed: ${msg}`);
    console.error("[OTP] SendGrid error detail:", err);
    return false;
  }
}

/** Attempt Resend. Returns true on success, false if unconfigured or failed. */
async function tryResendOtp(to: string, subject: string, html: string): Promise<boolean> {
  if (!ENV.resendApiKey) {
    console.warn("[OTP] Resend skipped — RESEND_API_KEY not set");
    return false;
  }
  console.log(`[OTP] Attempting Resend to ${to} (from: ${ENV.resendApiFrom})`);
  try {
    const sent = await sendViaResend(to, subject, html);
    if (!sent) console.warn("[OTP] Resend returned false — check Resend dashboard for errors");
    return sent;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[OTP] Resend exception: ${msg}`);
    return false;
  }
}

/**
 * Relay-mode body: shown to the admin (Resend account owner). Prominently names
 * the intended recipient so it can be forwarded, then shows the normal code box.
 */
function buildRelayOtpHtml(recipient: string, code: string): string {
  const banner = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 0 0;"><tr><td align="center">
    <div style="max-width:480px;width:100%;box-sizing:border-box;background:#fff4e5;border:1px solid #f0b357;border-radius:8px;padding:16px 20px;text-align:left;">
      <p style="margin:0 0 4px;font-size:13px;color:#8a5a00;font-weight:bold;">⚠️ RELAY MODE — forward this email to:</p>
      <p style="margin:0;font-size:18px;color:#1A3A5C;font-weight:bold;">${recipient}</p>
    </div>
  </td></tr></table>`;
  return buildOtpHtml(code, banner);
}

export async function sendOtpEmail(email: string, code: string): Promise<boolean> {
  console.log(`[OTP] Starting sendOtpEmail to: ${email}`);
  console.log(`[OTP] SENDGRID_API_KEY set: ${Boolean(ENV.sendgridApiKey)}, SENDGRID_FROM set: ${Boolean(ENV.sendgridFrom)}`);
  console.log(`[OTP] RESEND_API_KEY set: ${Boolean(ENV.resendApiKey)}, OTP_RELAY_TO set: ${Boolean(ENV.otpRelayTo)}`);

  // --- Stopgap relay mode: send each OTP to the admin relay address(es) for manual
  // forward, instead of to the user. Works with the Resend sandbox (no verified
  // domain) since the destination is the account owner. OTP_RELAY_TO may be a
  // comma-separated list — each is sent individually (best-effort), so the
  // owner address still gets it even if the others are rejected by the sandbox.
  // Once a domain is verified this same path delivers to all of them. Unset to disable.
  const relay = Boolean(ENV.otpRelayTo);
  const targets = relay
    ? ENV.otpRelayTo.split(",").map(s => s.trim()).filter(Boolean)
    : [email];
  const subject = relay
    ? `FATUWR login code for ${email} — forward to them`
    : "Your FATUWR Training Portal Login Code";
  const html = relay ? buildRelayOtpHtml(email, code) : buildOtpHtml(code);

  // In relay mode try Resend first (the sandbox can reach the owner); otherwise
  // prefer Resend only once it has a verified domain.
  const resendFirst = relay || resendHasVerifiedDomain();
  const attempts = resendFirst ? [tryResendOtp, trySendGridOtp] : [trySendGridOtp, tryResendOtp];
  console.log(`[OTP] ${relay ? `RELAY → [${targets.join(", ")}] (for ${email})` : `direct → ${email}`}; order: ${resendFirst ? "Resend → SendGrid" : "SendGrid → Resend"}`);

  // Deliver to each target independently; a single success is enough to proceed.
  let delivered = false;
  for (const target of targets) {
    for (const attempt of attempts) {
      if (await attempt(target, subject, html)) {
        delivered = true;
        break;
      }
    }
  }
  if (delivered) return true;

  // --- Fallback: print to console (local dev only) -----------------------------
  console.warn(`[OTP] ⚠️  NO EMAIL PROVIDER SUCCEEDED — code will only appear in logs`);
  console.log(`[OTP] ===== VERIFICATION CODE (no email provider configured) =====`);
  console.log(`[OTP] Email: ${email}`);
  console.log(`[OTP] Code:  ${code}`);
  console.log(`[OTP] ================================================================`);
  return true;
}

/**
 * Send a plain-text alert email to the portal admin.
 * Used by the server-side GAS health monitor so alerts work even when GAS is
 * fully non-functional. Tries SendGrid then Resend (same providers as OTP);
 * falls back to a loud console.error if both fail so Railway logs capture it.
 */
export async function sendAlertEmail(subject: string, text: string): Promise<void> {
  const recipients = [
    "tanmelanie@gmail.com",
    "fatuwr@gmail.com",
    "fatuwrevents@gmail.com",
  ];

  const trySendGridAlert = async (): Promise<boolean> => {
    if (!(ENV.sendgridApiKey && ENV.sendgridFrom)) return false;
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ENV.sendgridApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: recipients.map(email => ({ email })) }],
          from: { email: ENV.sendgridFrom },
          subject,
          content: [{ type: "text/plain", value: text }],
        }),
      });
      if (res.ok) {
        console.log(`[Alert] Sent via SendGrid to ${recipients.length} recipients: ${subject}`);
        return true;
      }
      console.warn(`[Alert] SendGrid HTTP ${res.status} — trying next provider`);
    } catch (err: unknown) {
      console.warn(`[Alert] SendGrid failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return false;
  };

  const tryResendAlert = async (): Promise<boolean> => {
    if (!ENV.resendApiKey) return false;
    try {
      const resend = new Resend(ENV.resendApiKey);
      const result = await resend.emails.send({ from: ENV.resendApiFrom, to: recipients, subject, text });
      if (!result.error) {
        console.log(`[Alert] Sent via Resend to ${recipients.length} recipients: ${subject}`);
        return true;
      }
      console.warn(`[Alert] Resend error: ${result.error.message}`);
    } catch (err: unknown) {
      console.warn(`[Alert] Resend failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return false;
  };

  // Prefer Resend once it has a verified domain; otherwise keep SendGrid first.
  const attempts = resendHasVerifiedDomain()
    ? [tryResendAlert, trySendGridAlert]
    : [trySendGridAlert, tryResendAlert];
  for (const attempt of attempts) {
    if (await attempt()) return;
  }

  // Last resort — loud Railway log (visible in dashboard and any log alerts)
  console.error(`[Alert] ⚠️  COULD NOT SEND EMAIL ALERT — subject: ${subject}`);
  console.error(`[Alert] Body: ${text}`);
}

/**
 * Diagnostic: test email sending without needing a real OTP flow.
 * Returns a detailed status object for the /api/test-email endpoint.
 */
export async function testEmailSending(to: string): Promise<{
  sendgridConfigured: boolean;
  resendConfigured: boolean;
  resendFrom: string;
  otpRelayTo: string;
  sendgridResult: "success" | "skipped" | "failed";
  sendgridError?: string;
  resendResult: "success" | "skipped" | "failed";
  resendError?: string;
}> {
  const testCode = "123456";
  const testSubject = "Your FATUWR Training Portal Login Code";
  const testHtml = buildOtpHtml(testCode);
  const result = {
    sendgridConfigured: Boolean(ENV.sendgridApiKey && ENV.sendgridFrom),
    resendConfigured: Boolean(ENV.resendApiKey),
    // Echo the live config so we can diagnose without dashboard access.
    resendFrom: ENV.resendApiFrom,
    otpRelayTo: ENV.otpRelayTo || "(not set — direct delivery)",
    sendgridResult: "skipped" as "success" | "skipped" | "failed",
    sendgridError: undefined as string | undefined,
    resendResult: "skipped" as "success" | "skipped" | "failed",
    resendError: undefined as string | undefined,
  };

  if (ENV.sendgridApiKey && ENV.sendgridFrom) {
    try {
      await sendViaSendGrid(to, testSubject, testHtml);
      result.sendgridResult = "success";
    } catch (err: unknown) {
      result.sendgridResult = "failed";
      result.sendgridError = err instanceof Error ? err.message : String(err);
    }
  }

  if (ENV.resendApiKey) {
    // Call Resend directly here (rather than via sendViaResend) so we can surface
    // the real error name + message instead of a generic string.
    try {
      const resend = new Resend(ENV.resendApiKey);
      const res = await resend.emails.send({ from: ENV.resendApiFrom, to, subject: testSubject, html: testHtml });
      if (res.error) {
        result.resendResult = "failed";
        result.resendError = `${res.error.name}: ${res.error.message}`;
      } else {
        result.resendResult = "success";
      }
    } catch (err: unknown) {
      result.resendResult = "failed";
      result.resendError = err instanceof Error ? err.message : String(err);
    }
  }

  return result;
}
