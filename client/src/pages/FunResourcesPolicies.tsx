import AppHeader from "@/components/AppHeader";

const CONTENT = `
<h2>Cancellation Policy</h2>

<p>You get 1 penalty for cancelling 24 hours prior to the game, unless you find a suitable replacement 12 hours prior to the game, or you have medical reasons.</p>

<p>If you get your 2nd penalty within 2 months from the 1st penalty, you will be banned from booking a training slot (all sessions) for 2 weeks beginning from the date of your 2nd penalty (resets after 2 months from the date of the 1st penalty).</p>

<h2>Payment and Rain-off Policies</h2>

<h3>Payment</h3>

<p>Please pay for all trainings following the instructions in the Payments section of the app.</p>

<p>Please endeavour to maintain a $0 outstanding balance. If the outstanding amount you owe (including for future trainings) exceeds a certain sum (currently set at $50), the app will automatically prevent you from signing up for additional trainings.</p>

<h3>Rain-off policy for CCAB</h3>

<p>If we are rained out for more than half the time, a partial refund of half the pool fees will be returned to participants. If we are rained out for the full session, a full refund will be returned to the participants.</p>

<h3>Rain-off policy for MGS</h3>

<p>If we are rained out for half or more of the session, a refund of half the pool fees will be returned to participants.</p>

<h2>Training Locations</h2>

<h3>Methodist Girls' School Swimming Complex</h3>
<p>11 Blackmore Dr, Singapore 599986</p>
<p>Tuesday sessions are held at Methodist Girls' School Swimming Complex. It's located at the back of the school.</p>

<h3>MOE Evans Road CCAB Swimming Complex</h3>
<p>21 Evans Rd, Singapore 259368</p>
<p>Thursday sessions are held at MOE CCAB Swimming Complex at Evans Road. The entrance is through the main building — the pool itself is behind the hockey field (ask the security guards for directions if need be).</p>
`.trim();

export default function FunResourcesPolicies() {
  return (
    <div className="min-h-screen bg-[#111111] pb-32">
      <AppHeader title="Club Policies" showBack backPath="/fun-resources" />
      <main className="mx-auto max-w-[480px] px-4 pt-5 pb-8">
        <div
          className="bg-[#1E1E1E] rounded-2xl px-4 py-5 rich-content"
          dangerouslySetInnerHTML={{ __html: CONTENT }}
        />
      </main>
    </div>
  );
}
