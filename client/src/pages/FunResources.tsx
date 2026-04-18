import { useState } from "react";
import { Link } from "wouter";
import AppHeader from "@/components/AppHeader";
import { ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";

const APP_URL = "https://fatuwr.up.railway.app";

const SECTIONS = [
  { label: "Membership",                  href: "/membership" },
  { label: "Club training policies",      href: "/fun-resources/policies" },
  { label: "Inviting people to try UWR",  href: "/fun-resources/invite" },
  { label: "FATUWR merchandise",          href: "/fun-resources/merch" },
  { label: "Resources",                   href: "/fun-resources/resources" },
  { label: "Videos",                      href: "/fun-resources/videos" },
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
      <AppHeader title="Fun Stuff" showBack backPath="/" />

      <main className="mx-auto max-w-[480px] px-4 pt-6 space-y-3">

        {/* Section links */}
        <div className="bg-[#1E1E1E] rounded-2xl overflow-hidden divide-y divide-[#2C2C2C]">
          {SECTIONS.map(({ label, href }) => (
            <Link key={href} href={href}>
              <div className="flex items-center justify-between px-4 min-h-[52px] hover:bg-white/5 transition-colors cursor-pointer">
                <span className="text-[15px] text-white">{label}</span>
                <ChevronRight className="w-4 h-4 text-[#888888]" />
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
