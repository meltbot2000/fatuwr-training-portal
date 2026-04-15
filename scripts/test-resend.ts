import "dotenv/config";
import { Resend } from "resend";
import { ENV } from "../server/_core/env";

async function main() {
  console.log("RESEND_API_KEY:", ENV.resendApiKey ? `${ENV.resendApiKey.slice(0,8)}...` : "(not set)");
  console.log("RESEND_API_FROM:", ENV.resendApiFrom);

  if (!ENV.resendApiKey) {
    console.error("No API key — set RESEND_API_KEY in .env");
    process.exit(1);
  }

  const resend = new Resend(ENV.resendApiKey);
  const result = await resend.emails.send({
    from: ENV.resendApiFrom,
    to: "tanmelanie@gmail.com",
    subject: "FATUWR OTP Test",
    html: "<p>Test email from FATUWR portal. If you see this, Resend is working correctly.</p><p><strong>Test code: 123456</strong></p>",
  });

  if (result.error) {
    console.error("Resend error:", JSON.stringify(result.error, null, 2));
    process.exit(1);
  }
  console.log("Sent successfully! ID:", result.data?.id);
}

main().catch(err => { console.error(err); process.exit(1); });
