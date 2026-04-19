import { Link } from "wouter";
import AppHeader from "@/components/AppHeader";
import { ChevronRight } from "lucide-react";

// ── Placeholder SVG art (replace with real photography when available) ────────
// Procedural scenes that evoke each section's content — faithful to the
// design handoff prototype. preserveAspectRatio="xMidYMid slice" ensures
// the image fills the 112×96 tile without letterboxing.

const ACCENT = "#2196F3";

function ArtPoolDeck() {
  return (
    <svg viewBox="0 0 400 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: "block" }}>
      <defs>
        <linearGradient id="sky1" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1a2733"/>
          <stop offset="1" stopColor="#0e1a24"/>
        </linearGradient>
        <linearGradient id="water1" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1e5f8c"/>
          <stop offset="1" stopColor="#0b3450"/>
        </linearGradient>
      </defs>
      <rect width="400" height="110" fill="url(#sky1)"/>
      <rect y="110" width="400" height="90" fill="url(#water1)"/>
      <rect x="0" y="96" width="400" height="18" fill="#2a3a48"/>
      <rect x="0" y="96" width="400" height="2" fill="#3a4e60" opacity=".6"/>
      {[0,1,2,3,4].map(i => (
        <g key={i}>
          <line x1="0" y1={128 + i*14} x2="400" y2={128 + i*14} stroke="#6da9c9" strokeWidth=".8" opacity=".4"/>
          {Array.from({length: 22}).map((_, j) => (
            <circle key={j} cx={10 + j*18} cy={128 + i*14} r="2" fill="#d9e8ef" opacity=".55"/>
          ))}
        </g>
      ))}
      <path d="M20 96 Q30 50 50 60 Q40 70 52 72 Q30 78 40 96 Z" fill="#0c1b18" opacity=".9"/>
      <path d="M330 96 Q345 40 370 55 Q355 65 375 70 Q345 76 355 96 Z" fill="#0c1b18" opacity=".9"/>
      <circle cx="300" cy="35" r="18" fill="#ffcb8a" opacity=".35"/>
      <circle cx="300" cy="35" r="10" fill="#ffdfb0" opacity=".6"/>
    </svg>
  );
}

function ArtPolicies() {
  return (
    <svg viewBox="0 0 400 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: "block" }}>
      <defs>
        <linearGradient id="pg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#263847"/>
          <stop offset="1" stopColor="#12202c"/>
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill="url(#pg)"/>
      <g transform="translate(200,100)">
        <path d="M0 -70 L60 -50 L55 30 Q45 60 0 75 Q-45 60 -55 30 L-60 -50 Z"
              fill="#1a2836" stroke={ACCENT} strokeWidth="2" opacity=".95"/>
        <path d="M-22 -5 L-4 14 L24 -18" fill="none" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      </g>
      {[0,1,2].map(i => (
        <rect key={i} x="40" y={30 + i*14} width={120 - i*18} height="3" rx="1.5" fill="#ffffff" opacity={0.2 - i*0.05}/>
      ))}
      {[0,1,2].map(i => (
        <rect key={i} x={250 + i*6} y={150 + i*8} width={100 - i*10} height="3" rx="1.5" fill="#ffffff" opacity={0.18 - i*0.04}/>
      ))}
    </svg>
  );
}

function ArtInvite() {
  return (
    <svg viewBox="0 0 400 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: "block" }}>
      <defs>
        <linearGradient id="ig" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#0d3a54"/>
          <stop offset="1" stopColor="#082633"/>
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill="url(#ig)"/>
      {[0,1,2,3].map(i => (
        <circle key={i} cx="120" cy="100" r={30 + i*28} fill="none" stroke={ACCENT} strokeWidth="1.2" opacity={0.5 - i*0.1}/>
      ))}
      <g fill="#0a1a24" opacity=".95">
        <g transform="translate(250,110)">
          <circle cx="0" cy="-20" r="14"/>
          <path d="M-22 30 Q0 -4 22 30 Z"/>
        </g>
        <g transform="translate(295,125)">
          <circle cx="0" cy="-16" r="11"/>
          <path d="M-18 24 Q0 -2 18 24 Z"/>
        </g>
        <g transform="translate(335,118)">
          <circle cx="0" cy="-18" r="12"/>
          <path d="M-19 26 Q0 -3 19 26 Z"/>
        </g>
      </g>
      <g transform="translate(120,100)" stroke={ACCENT} strokeWidth="3" strokeLinecap="round">
        <line x1="-10" y1="0" x2="10" y2="0"/>
        <line x1="0" y1="-10" x2="0" y2="10"/>
      </g>
    </svg>
  );
}

function ArtMerch() {
  return (
    <svg viewBox="0 0 400 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: "block" }}>
      <defs>
        <linearGradient id="mg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#2b2e3a"/>
          <stop offset="1" stopColor="#15171e"/>
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill="url(#mg)"/>
      <g transform="translate(70,40)">
        <path d="M0 20 L30 0 L50 10 L70 0 L100 20 L90 50 L80 45 L80 120 L20 120 L20 45 L10 50 Z"
              fill="#1a3b55" stroke={ACCENT} strokeWidth="1.5"/>
        <text x="50" y="85" textAnchor="middle" fontFamily="Inter,sans-serif" fontWeight="700" fontSize="14" fill={ACCENT}>FATUWR</text>
      </g>
      <g transform="translate(230,70)">
        <path d="M0 40 Q60 0 120 40 L120 55 L0 55 Z" fill="#1a3b55" stroke={ACCENT} strokeWidth="1.5"/>
        <path d="M0 55 Q60 68 120 55 L120 62 Q60 75 0 62 Z" fill="#123044" stroke={ACCENT} strokeWidth="1.2"/>
        <circle cx="60" cy="28" r="4" fill={ACCENT}/>
      </g>
      <g transform="translate(350,40)" fill={ACCENT} opacity=".8">
        <path d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2 Z"/>
      </g>
    </svg>
  );
}

function ArtBeginner() {
  return (
    <svg viewBox="0 0 400 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: "block" }}>
      <defs>
        <linearGradient id="bg2" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1d5070"/>
          <stop offset="1" stopColor="#082233"/>
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill="url(#bg2)"/>
      {[0,1,2,3,4,5].map(i => (
        <path key={i}
              d={`M0 ${40 + i*28} Q 100 ${30 + i*28} 200 ${42 + i*28} T 400 ${40 + i*28}`}
              fill="none" stroke="#9cd4ee" strokeWidth="1.2" opacity={0.45 - i*0.05}/>
      ))}
      {[{x:80,y:150,r:5},{x:110,y:130,r:3},{x:95,y:105,r:2},{x:320,y:160,r:6},{x:345,y:140,r:3},{x:330,y:118,r:2}].map((b,i) => (
        <circle key={i} cx={b.x} cy={b.y} r={b.r} fill="none" stroke="#cfeaf5" strokeWidth="1" opacity=".7"/>
      ))}
      <g transform="translate(200,100)">
        <circle r="36" fill="#0a2a3d" stroke={ACCENT} strokeWidth="2"/>
        <text y="10" textAnchor="middle" fontFamily="Inter,sans-serif" fontWeight="600" fontSize="38" fill="#fff">1</text>
      </g>
    </svg>
  );
}

function ArtResources() {
  return (
    <svg viewBox="0 0 400 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: "block" }}>
      <defs>
        <linearGradient id="rg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#1e2a36"/>
          <stop offset="1" stopColor="#0f161e"/>
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill="url(#rg)"/>
      {[0,1,2].map(i => (
        <g key={i} transform={`translate(${120 + i*14}, ${50 + i*14}) rotate(${-6 + i*6})`}>
          <rect width="160" height="100" rx="6" fill="#1f3445" stroke={ACCENT} strokeWidth="1.2" opacity={0.8 + i*0.05}/>
          <rect x="14" y="18" width="100" height="6" rx="2" fill="#ffffff" opacity=".7"/>
          <rect x="14" y="34" width="120" height="3" rx="1.5" fill="#ffffff" opacity=".25"/>
          <rect x="14" y="44" width="110" height="3" rx="1.5" fill="#ffffff" opacity=".25"/>
          <rect x="14" y="54" width="80" height="3" rx="1.5" fill="#ffffff" opacity=".25"/>
          <circle cx="24" cy="80" r="4" fill={ACCENT}/>
          <rect x="34" y="77" width="60" height="6" rx="2" fill={ACCENT} opacity=".6"/>
        </g>
      ))}
    </svg>
  );
}

function ArtVideos() {
  return (
    <svg viewBox="0 0 400 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: "block" }}>
      <defs>
        <linearGradient id="vg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#081827"/>
          <stop offset="1" stopColor="#03080e"/>
        </linearGradient>
        <radialGradient id="vspot" cx=".5" cy=".5" r=".6">
          <stop offset="0" stopColor={ACCENT} stopOpacity=".35"/>
          <stop offset="1" stopColor={ACCENT} stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width="400" height="200" fill="url(#vg)"/>
      <rect width="400" height="200" fill="url(#vspot)"/>
      {Array.from({length: 10}).map((_,i) => (
        <rect key={"t"+i} x={10 + i*40} y="10" width="20" height="10" rx="2" fill="#000" stroke="#1f2f3d" strokeWidth=".5"/>
      ))}
      {Array.from({length: 10}).map((_,i) => (
        <rect key={"b"+i} x={10 + i*40} y="180" width="20" height="10" rx="2" fill="#000" stroke="#1f2f3d" strokeWidth=".5"/>
      ))}
      <g transform="translate(200,100)">
        <circle r="34" fill="#ffffff" opacity=".06"/>
        <circle r="30" fill="none" stroke={ACCENT} strokeWidth="2"/>
        <path d="M-10 -14 L18 0 L-10 14 Z" fill="#fff"/>
      </g>
    </svg>
  );
}

// ── Section definitions ───────────────────────────────────────────────────────

const SECTIONS = [
  {
    key: "membership",
    eyebrow: "MEMBERSHIP",
    title: "Membership",
    subtitle: "Fees, trials & renewals",
    href: "/membership",
    Art: ArtPoolDeck,
  },
  {
    key: "policies",
    eyebrow: "CLUB POLICIES",
    title: "Club Policies",
    subtitle: "Training rules & guidelines",
    href: "/fun-resources/policies",
    Art: ArtPolicies,
  },
  {
    key: "invite",
    eyebrow: "GET INVOLVED",
    title: "Invite a Friend",
    subtitle: "Bring someone new to try UWR",
    href: "/fun-resources/invite",
    Art: ArtInvite,
  },
  {
    key: "merch",
    eyebrow: "SHOP",
    title: "Merchandise",
    subtitle: "FATUWR gear & apparel",
    href: "/fun-resources/merch",
    Art: ArtMerch,
  },
  {
    key: "new",
    eyebrow: "GETTING STARTED",
    title: "New to the Club",
    subtitle: "Beginner's guide to FATUWR",
    href: "/newbie",
    Art: ArtBeginner,
  },
  {
    key: "resources",
    eyebrow: "REFERENCE",
    title: "Resources & Links",
    subtitle: "Useful documents & websites",
    href: "/fun-resources/resources",
    Art: ArtResources,
  },
  {
    key: "videos",
    eyebrow: "WATCH",
    title: "Videos",
    subtitle: "Highlights & tutorials",
    href: "/fun-resources/videos",
    Art: ArtVideos,
  },
] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FunResources() {
  return (
    <div className="min-h-screen bg-[#111111] pb-32">
      <AppHeader title="More" showBack={false} />

      <main className="mx-auto max-w-[480px] px-4 pt-4" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {SECTIONS.map(({ key, eyebrow, title, subtitle, href, Art: ArtComponent }) => (
          <Link key={key} href={href}>
            {/* Compact Card — spec: bg-card, radius-lg (16px), min-height 96px, flex stretch */}
            <div
              className="active:opacity-75 transition-opacity cursor-pointer"
              style={{
                background: "#1E1E1E",
                borderRadius: 16,
                minHeight: 96,
                display: "flex",
                alignItems: "stretch",
                overflow: "hidden",
              }}
            >
              {/* Left image tile — 112px wide, fills card height */}
              <div style={{ width: 112, flexShrink: 0, overflow: "hidden" }}>
                <ArtComponent />
              </div>

              {/* Right text block — padding 14px 16px, flex col, justify center */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "14px 16px" }}>
                {/* Eyebrow — fs-badge: 11px/600, primary, uppercase, 0.08em tracking */}
                <p style={{ fontSize: 11, fontWeight: 600, color: "#2196F3", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, lineHeight: 1 }}>
                  {eyebrow}
                </p>
                {/* Title — fs-primary: 15px/500, white */}
                <p style={{ fontSize: 15, fontWeight: 500, color: "#FFFFFF", marginBottom: 2, lineHeight: 1.2 }}>
                  {title}
                </p>
                {/* Subtitle — fs-meta: 13px/400, secondary */}
                <p style={{ fontSize: 13, fontWeight: 400, color: "#888888", lineHeight: 1.3 }}>
                  {subtitle}
                </p>
              </div>

              {/* Trailing chevron — 14×14, stroke #666, sw 2 */}
              <div style={{ padding: "0 16px", display: "flex", alignItems: "center" }}>
                <ChevronRight size={14} strokeWidth={2} color="#666" />
              </div>
            </div>
          </Link>
        ))}
      </main>
    </div>
  );
}
