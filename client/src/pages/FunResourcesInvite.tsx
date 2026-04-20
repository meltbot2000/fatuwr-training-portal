import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { Copy, Check, ExternalLink } from "lucide-react";

const FORM_URL = "https://bit.ly/fatuwr-newbie";

const CONTENT_BEFORE = `
<p>Know someone who is interested to try Underwater Rugby (UWR) with us? The Newbie Subcommittee (Gaya, Hayley, Dylia, Steph, Sophie, Charlotte, Sid, Owen, Fiona and Chong Zhi) are here to help! Read on for how to proceed.</p>

<p>We regularly host formal Newcomer Trial Sessions (aka Newbie Sessions) each month alongside normal UWR trainings and we encourage newcomers to the club to come join! These Newbie Sessions are carefully planned to give a clear introduction to the sport and our club and to provide a fun and supportive environment to learn UWR for the first time!</p>

<h3>When are the next sessions?</h3>
<p>In 2026 the next newbie sessions are currently:</p>
<ul>
  <li>Feb 8, Mar 1, Apr 19, Apr 21, Apr 26, Apr 28</li>
</ul>
<p>There are up to 10 slots per session subject to available gear. Priority for fin size requested will be given in order of sign ups.</p>

<h3>What do I need to do?</h3>
<p>Please send the interest and indemnity form below to your newcomer to fill up.<br/>
<i>If they are below 18 years of age, please ensure their parent or guardian fills up this form on their behalf.</i></p>
<p>Newbie Subcomm will take it from there! But do try and attend training when they come for their Newbie Session, for added moral support!</p>
`.trim();

const CONTENT_AFTER = `
<h2>Additional Information</h2>

<h3>How much does it cost?</h3>
<p>The first Newbie Session is FREE for anyone new to our club!</p>

<h3>What should they bring?</h3>
<p><i>FYI this is mentioned in the interest form and Newbie Subcomm will remind before session.</i></p>
<ul>
  <li><b>Swimsuit &amp; Rashguard</b>. If possible avoid loose swimwear which is not recommended for UWR. We highly advise to wear a rash guard for sunny days.</li>
  <li><b>Pair of socks</b>. To avoid chafing your feet when wearing fins.</li>
  <li><b>Water bottle</b>. For hydration purposes.</li>
  <li><b>Trimmed nails</b>. To avoid scratching others.</li>
  <li><b>No Jewellery</b>. To avoid getting caught and injuring yourself/others.</li>
  <li><b><i>Optional</i> Shower stuff</b>. The pools have showers and changing facilities.</li>
</ul>

<h3>Any further questions?</h3>
<p>Feel free to reach out to our Newbie Subcomm: Gaya (Lead), Hayley, Dylia, Steph, Sophie, Charlotte, Sid, Owen, Fiona and Chong Zhi.</p>

<p style="font-size:11px;color:#555555;margin-top:1.5em;">Image attribution — <a href="https://www.freepik.com/free-vector/cute-diver-riding-bike-with-puffer-fish-balloon-ocean-cartoon-vector-icon-illustration-science_30137891.htm#query=puffer%20fish%20cartoon&position=29&from_view=keyword&track=ais" target="_blank" rel="noopener noreferrer">Image by catalyststuff</a> on Freepik</p>
`.trim();

export default function FunResourcesInvite() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(FORM_URL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-[#111111] pb-32">
      <AppHeader title="Invite a Friend" showBack backPath="/fun-resources" />
      <main className="mx-auto max-w-[480px] px-4 pt-5 pb-8 space-y-3">

        <div
          className="bg-[#1E1E1E] rounded-2xl px-4 py-5 rich-content"
          dangerouslySetInnerHTML={{ __html: CONTENT_BEFORE }}
        />

        {/* Form URL card */}
        <div className="bg-[#1E1E1E] rounded-2xl px-4 py-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
            Interest &amp; Indemnity Form
          </p>
          <p className="text-[13px] text-[#888888] font-mono break-all">{FORM_URL}</p>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 h-[44px] rounded-full flex items-center justify-center gap-2 text-[13px] font-medium transition-colors"
              style={copied
                ? { background: "rgba(76,175,80,0.12)", border: "1px solid rgba(76,175,80,0.3)", color: "#4CAF50" }
                : { background: "rgba(33,150,243,0.08)", border: "1px solid rgba(33,150,243,0.22)", color: "#2196F3" }
              }
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy link"}
            </button>
            <a
              href={FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-[44px] rounded-full bg-[#2196F3] text-white text-[13px] font-medium flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Open form
            </a>
          </div>
        </div>

        <div
          className="bg-[#1E1E1E] rounded-2xl px-4 py-5 rich-content"
          dangerouslySetInnerHTML={{ __html: CONTENT_AFTER }}
        />

      </main>
    </div>
  );
}
