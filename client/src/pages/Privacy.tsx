// Public page (no sign-in required) — linked from the Google OAuth consent
// screen, which needs a reachable privacy policy URL to publish the GAS app.

const CONTENT = `
<p>Last updated: 21 September 2026</p>

<p>This policy explains what the FATUWR Training Portal collects and why. The portal is run by FATUWR for its members and trial participants.</p>

<h2>What we collect</h2>

<p><strong>Your email address.</strong> We use it to:</p>
<ul>
  <li>sign you in, by sending a one-time verification code to it;</li>
  <li>keep one unique account per person; and</li>
  <li>track payments against your account, so your training fees and outstanding balance are recorded correctly.</li>
</ul>

<p><strong>Profile details you give us.</strong> Your name, and optionally your phone number, date of birth and profile photo. These are used to identify you within the club (for example on session sign-up lists) and to manage membership.</p>

<p><strong>Your activity in the portal.</strong> The training sessions you sign up for, and your membership status.</p>

<h2>How we use and share it</h2>

<p>Your data is used only to run the club's training sign-ups, membership and payment records. We do not sell it, and we do not use it for advertising.</p>

<p>It is stored with the services that run the portal (our hosting provider, database and the club's Google account) and is visible to club administrators. We do not share it with anyone else.</p>

<h2>Deleting your data</h2>

<p>You can ask us to delete your account and personal data at any time by writing to <a href="mailto:fatuwr@gmail.com">fatuwr@gmail.com</a>.</p>

<h2>Contact</h2>

<p>Questions about this policy can be sent to <a href="mailto:fatuwr@gmail.com">fatuwr@gmail.com</a>.</p>
`.trim();

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#111111] pb-16">
      <main className="mx-auto max-w-[480px] px-4 pt-8">
        <h1 className="text-white text-[22px] font-bold mb-4">Privacy Policy</h1>
        <div
          className="bg-[#1E1E1E] rounded-2xl px-4 py-5 rich-content"
          dangerouslySetInnerHTML={{ __html: CONTENT }}
        />
      </main>
    </div>
  );
}
