import { Resend } from "resend";
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

export async function sendOtpEmail(email: string, code: string): Promise<boolean> {
  console.log(`[OTP] Sending code to ${email}`);
  console.log(`[OTP] RESEND_API_KEY is ${ENV.resendApiKey ? "set" : "NOT set"}`);
  console.log(`[OTP] FROM address: ${ENV.resendApiFrom}`);

  if (ENV.resendApiKey) {
    const resend = new Resend(ENV.resendApiKey);
    try {
      const result = await resend.emails.send({
        from: ENV.resendApiFrom,
        to: email,
        subject: "Your FATUWR Training Portal Login Code",
        html: buildOtpHtml(code),
      });
      console.log(`[OTP] Resend response:`, JSON.stringify(result, null, 2));
      if (!result.error) {
        console.log(`[OTP] Email sent successfully to ${email}`);
        return true;
      }
      console.warn(`[OTP] Resend returned an error:`);
      console.warn(`[OTP]   name:    ${result.error.name}`);
      console.warn(`[OTP]   message: ${result.error.message}`);
      console.warn(`[OTP]   full:   `, JSON.stringify(result.error, null, 2));
    } catch (err) {
      console.warn("[OTP] Exception thrown while calling Resend:", err);
    }
  }

  // Fallback for local dev (no API key configured)
  console.log(`[OTP] ===== VERIFICATION CODE =====`);
  console.log(`[OTP] Email: ${email}`);
  console.log(`[OTP] Code:  ${code}`);
  console.log(`[OTP] ==============================`);
  return true;
}
