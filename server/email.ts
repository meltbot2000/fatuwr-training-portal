import { Resend } from "resend";
import nodemailer from "nodemailer";
import { ENV } from "./_core/env";

export function generateOtp(): string {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < 6; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
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
    console.warn(`[OTP] Resend error — name: ${result.error.name}, message: ${result.error.message}`);
    return false;
  }

  console.log(`[OTP] Resend sent to ${to}, id: ${result.data?.id}`);
  return true;
}

export async function sendOtpEmail(email: string, code: string): Promise<boolean> {
  // --- Provider 1: Gmail SMTP (works for any recipient, no domain needed) ------
  if (ENV.gmailUser && ENV.gmailAppPassword) {
    console.log(`[OTP] Sending via Gmail to ${email}`);
    try {
      return await sendViaGmail(email, code);
    } catch (err) {
      console.warn("[OTP] Gmail failed:", err);
    }
  }

  // --- Provider 2: Resend (requires verified sending domain) -------------------
  if (ENV.resendApiKey) {
    console.log(`[OTP] Sending via Resend to ${email} (from: ${ENV.resendApiFrom})`);
    try {
      const sent = await sendViaResend(email, code);
      if (sent) return true;
    } catch (err) {
      console.warn("[OTP] Resend exception:", err);
    }
  }

  // --- Fallback: print to console (local dev only) -----------------------------
  console.log(`[OTP] ===== VERIFICATION CODE (no email provider configured) =====`);
  console.log(`[OTP] Email: ${email}`);
  console.log(`[OTP] Code:  ${code}`);
  console.log(`[OTP] ================================================================`);
  return true;
}
