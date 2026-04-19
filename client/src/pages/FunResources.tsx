import { useState } from "react";
import { Link } from "wouter";
import AppHeader from "@/components/AppHeader";
import { Copy, Users, ShieldCheck, UserPlus, ShoppingBag, Video, BookOpen, Waves } from "lucide-react";
import { toast } from "sonner";

const APP_URL = "https://fatuwr.up.railway.app";

const SECTIONS = [
  {
    label: "New to the Club",
    sub: "Beginner's guide to FATUWR",
    href: "/newbie",
    Icon: Waves,
    gradient: "linear-gradient(135deg, #1565C0 0%, #1E88E5 100%)",
  },
  {
    label: "Membership",
    sub: "Fees, trials & renewals",
    href: "/membership",
    Icon: Users,
    gradient: "linear-gradient(135deg, #0D47A1 0%, #1976D2 100%)",
  },
  {
    label: "Club Policies",
    sub: "Training rules & guidelines",
    href: "/fun-resources/policies",
    Icon: ShieldCheck,
    gradient: "linear-gradient(135deg, #2E7D32 0%, #43A047 100%)",
  },
  {
    label: "Invite a Friend",
    sub: "Bring someone new to try UWR",
    href: "/fun-resources/invite",
    Icon: UserPlus,
    gradient: "linear-gradient(135deg, #6A1B9A 0%, #AB47BC 100%)",
  },
  {
    label: "Merchandise",
    sub: "FATUWR gear & apparel",
    href: "/fun-resources/merch",
    Icon: ShoppingBag,
    gradient: "linear-gradient(135deg, #BF360C 0%, #EF6C00 100%)",
  },
  {
    label: "Resources & Links",
    sub: "Useful documents & websites",
    href: "/fun-resources/resources",
    Icon: BookOpen,
    gradient: "linear-gradient(135deg, #00695C 0%, #26A69A 100%)",
  },
  {
    label: "Videos",
    sub: "Highlights & tutorials",
    href: "/fun-resources/videos",
    Icon: Video,
    gradient: "linear-gradient(135deg, #AD1457 0%, #E91E63 100%)",
  },
] as const;

const CARD_HEIGHT = 80;

export default function FunResources() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(APP_URL);
      setCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="min-h-screen bg-[#111111] pb-32">
      <AppHeader title="More" showBack={false} />

      <main className="mx-auto max-w-[480px] px-4 pt-5 space-y-2.5">

        {/* Section cards — full width, equal height */}
        {SECTIONS.map(({ label, sub, href, Icon, gradient }) => (
          <Link key={href} href={href}>
            <div
              className="relative overflow-hidden rounded-2xl cursor-pointer active:opacity-75 transition-opacity"
              style={{ background: gradient, height: CARD_HEIGHT }}
            >
              {/* Decorative circle */}
              <div
                className="absolute rounded-full opacity-15"
                style={{ width: 110, height: 110, background: "white", bottom: -28, right: -20 }}
              />
              {/* Content */}
              <div className="relative flex items-center gap-4 px-4 h-full">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-white" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  {/* fs-header: 17px/600 */}
                  <p className="text-[17px] font-semibold text-white leading-tight">{label}</p>
                  {/* fs-meta: 13px/400 */}
                  <p className="text-[13px] text-white/70 mt-0.5">{sub}</p>
                </div>
              </div>
            </div>
          </Link>
        ))}

        {/* Share app */}
        <div className="bg-[#1E1E1E] rounded-2xl px-4 py-4 mt-1">
          <p className="text-[13px] text-[#888888] mb-2">Share the app</p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] text-white truncate">{APP_URL}</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-[13px] text-[#2196F3] shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}
