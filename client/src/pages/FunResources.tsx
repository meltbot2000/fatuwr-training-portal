import { useState } from "react";
import { Link } from "wouter";
import AppHeader from "@/components/AppHeader";
import { Copy, Users, ShieldCheck, UserPlus, ShoppingBag, Video, BookOpen } from "lucide-react";
import { toast } from "sonner";

const APP_URL = "https://fatuwr.up.railway.app";

const SECTIONS = [
  {
    label: "Membership",
    sub: "Fees, trials & renewals",
    href: "/membership",
    Icon: Users,
    gradient: "linear-gradient(135deg, #1565C0 0%, #1E88E5 100%)",
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

      <main className="mx-auto max-w-[480px] px-4 pt-5 space-y-3">

        {/* Section cards — 2-column grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {SECTIONS.map(({ label, sub, href, Icon, gradient }) => (
            <Link key={href} href={href}>
              <div
                className="relative overflow-hidden rounded-2xl cursor-pointer active:opacity-80 transition-opacity"
                style={{ background: gradient, minHeight: 88 }}
              >
                {/* Decorative circle */}
                <div
                  className="absolute -bottom-4 -right-4 rounded-full opacity-20"
                  style={{ width: 72, height: 72, background: "white" }}
                />
                <div className="relative px-3.5 pt-3.5 pb-3">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center mb-2">
                    <Icon className="w-4 h-4 text-white" strokeWidth={2} />
                  </div>
                  <p className="text-[14px] font-semibold text-white leading-tight">{label}</p>
                  <p className="text-[11px] text-white/70 mt-0.5 leading-snug">{sub}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Share app */}
        <div className="bg-[#1E1E1E] rounded-2xl px-4 py-4">
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
