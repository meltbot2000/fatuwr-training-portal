import "dotenv/config";
import { Resend } from "resend";
import { ENV } from "../server/_core/env";

async function main() {
  const resend = new Resend(ENV.resendApiKey);

  // Try sending to the Resend account owner email (meltbot2000@gmail.com)
  // with onboarding@resend.dev as from — this is the only combo that works in sandbox
  const result = await resend.emails.send({
    from: "onboarding@resend.dev",
    to: "meltbot2000@gmail.com",
    subject: "FATUWR OTP Test — send-to-self",
    html: "<p>This is a test. Resend sandbox only allows sending to the account owner.</p>",
  });

  if (result.error) {
    console.error("Error:", JSON.stringify(result.error, null, 2));
  } else {
    console.log("Success! ID:", result.data?.id);
  }
}
main().catch(console.error);
