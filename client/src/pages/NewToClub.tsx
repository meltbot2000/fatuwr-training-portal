import AppHeader from "@/components/AppHeader";
import { useSearch } from "wouter";

const sections = [
  {
    heading: "1. Worried about picking it up?",
    bullets: [
      "UWR is a super fun sport but it can be tough to learn at the start since it's so different and combines so many different skills (swimming, breath-hold, positioning, ball handling etc.).",
      "It helps if you have any water sport background but even so, most people struggle at the start — e.g. swimmers may still struggle with equalisation and breath-hold, free divers may find the ball handling/speed/positioning tough.",
      "Don't worry if you don't have any background though. We do have players who could barely swim at the start but found a way to pick the game up — some have grown to compete for the club internationally. It doesn't matter where you start; this is a place where everyone is learning and trying to help each other improve.",
    ],
  },
  {
    heading: "2. Am I good enough to join trainings and regular games? The gap seems too big 🥺",
    bullets: [
      "We give newer players a red/yellow polo cap to designate that they're new. We avoid tackling new players and generally go easy. You'll also play as a \"7th player\" — an extra player — so you needn't feel too pressured.",
      "Once you're a bit more ready you should try to move off playing as a red cap, since it'll help you learn faster.",
    ],
  },
  {
    heading: "3. Is it safe? What if I have pre-existing injuries?",
    bullets: [
      "UWR is a safe sport — we look out for each other and the game rules are primarily designed to keep everyone safe. That said, it's a contact sport so you need to be mentally prepared. We usually go easy on newer players, and most injuries are minor. It might surprise you that they're frequently caused by newer players who play a more \"scrappy\" game and haven't learnt as much control.",
      "As a newer player, please be mindful of the game rules. People might seem stronger/more skilled but the point is to play a controlled game — you shouldn't use pure brute force or forget rules like not pulling fingers.",
      "UWR is played in the water so it's great for people with stress injuries. Feel free to talk to someone about your pre-existing injuries. We have lots of people who've moved to UWR because of injuries from land sport.",
    ],
  },
  {
    heading: "4. Can I keep borrowing gear?",
    bullets: [
      "We do our best to support newer players by lending them gear, but this isn't available at all training locations. It's great if you can get your own gear once you're keen to continue.",
      "Once you're fairly certain you want to continue, you can start by getting mask/snorkel/polo caps/suits — refer to the gear guide under Resources and the FATUWR Merchandise sections of the app.",
      "Try out gear before purchasing — ask around, as most people don't mind lending gear to try. Just ask on the social chat.",
      "Speciality fins (Leaderfins, Najades etc.) are typically harder to get as they need to be shipped from overseas. Check the social channel if anyone is ordering, or start your own group order to share/save on shipping.",
      "Alternatively, Stratos fins are available at dive shops. Sports Center may give you a discount if you mention you're from underwater rugby.",
    ],
    note: {
      label: "Sports Center",
      phone: "6296 0939",
      mapUrl: "https://maps.app.goo.gl/otVuq7Dm1EynD4Lt5",
    },
    warning: "If you're borrowing gear from the store, please rinse it thoroughly and hang it up properly in the cage to dry.",
  },
  {
    heading: "5. What are fees like?",
    bullets: [
      "Fees are charged per session on a cost-recovery basis for pool rental — the fees are shown in the app. Member fees are $4 cheaper. Refer to the Membership page (accessible from the side bar) for info on membership rates.",
    ],
  },
  {
    heading: "6. What's expected of me and how can I contribute?",
    bullets: [
      "Turn up for training on time",
      "Play safely",
      "Pay pool fees on time",
      "Help to set up and tear down",
      "Feel free to ask others and the committee if there are other ways you can contribute! It takes a ton of work to run the club so there's always opportunities to help and be involved more 🙂",
    ],
  },
];

export default function NewToClub() {
  const search = useSearch();
  const backPath = new URLSearchParams(search).get("back") || "/";
  return (
    <div className="min-h-screen bg-[#111111] pb-32">
      <AppHeader title="New to the Club?" showBack backPath={backPath} />

      <main className="mx-auto max-w-[480px] px-4 pt-6 pb-8 space-y-4">

        {/* Intro */}
        <div className="bg-[#1E1E1E] rounded-2xl px-4 py-4">
          <p className="text-[14px] text-[#CCCCCC] leading-relaxed">
            Enjoyed your first session but wondering if this is the right club or sport for you? Here's a guide to life at FATUWR.
          </p>
        </div>

        {/* Sections */}
        {sections.map((s, i) => (
          <div key={i} className="bg-[#1E1E1E] rounded-2xl px-4 py-4 space-y-3">
            {/* Heading */}
            <p className="text-[15px] font-semibold text-white leading-snug">{s.heading}</p>

            {/* Bullets */}
            <ul className="space-y-2">
              {s.bullets.map((b, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[#2196F3] shrink-0" />
                  <p className="text-[14px] text-[#CCCCCC] leading-relaxed">{b}</p>
                </li>
              ))}
            </ul>

            {/* Sports Center note (section 4) */}
            {"note" in s && s.note && (
              <div className="bg-[#2A2A2A] rounded-xl px-3 py-3 space-y-0.5">
                <p className="text-[14px] font-medium text-white">{s.note.label}</p>
                <p className="text-[13px] text-[#888888]">{s.note.phone}</p>
                <a
                  href={s.note.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] text-[#2196F3] underline-offset-2 hover:underline"
                >
                  View on map
                </a>
              </div>
            )}

            {/* Gear warning (section 4) */}
            {"warning" in s && s.warning && (
              <div className="bg-[#3D3500] rounded-xl px-3 py-3">
                <p className="text-[13px] text-[#F5C518] leading-snug">⚠️ {s.warning}</p>
              </div>
            )}
          </div>
        ))}

      </main>
    </div>
  );
}
