import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Home, CalendarPlus, CircleDollarSign, MoreHorizontal, ShieldCheck, CreditCard, Sparkles, BookOpen, ChevronRight } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Link } from "wouter";

const MORE_ITEMS = [
  { icon: CreditCard,  label: "Membership",       href: "/membership" },
  { icon: Sparkles,    label: "Fun Resources",     href: "/fun-resources" },
  { icon: BookOpen,    label: "New to the Club?",  href: "/newbie" },
];

export default function BottomNav() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const clubRole = (user as any)?.clubRole || "";
  const isAdmin = clubRole === "Admin";

  const tabs = [
    { label: "Home",     Icon: Home,              path: "/",         exact: true  },
    { label: "Training", Icon: CalendarPlus,       path: "/sessions", exact: false },
    { label: "Payments", Icon: CircleDollarSign,   path: "/payments", exact: false },
    { label: "More",     Icon: MoreHorizontal,     path: null,        exact: false },
    ...(isAdmin ? [{ label: "Admin", Icon: ShieldCheck, path: "/admin", exact: false }] : []),
  ] as const;

  function isActive(tab: typeof tabs[number]) {
    if (tab.path === null) return false;
    if ((tab as any).exact) return location === tab.path;
    return location.startsWith(tab.path);
  }

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-[#1E1E1E] border-t border-[#2C2C2C] safe-area-inset-bottom" style={{ transform: "translateZ(0)" }}>
        <div className="mx-auto max-w-[480px] flex">
          {tabs.map((tab) => {
            const active = isActive(tab);
            return (
              <button
                key={tab.label}
                onClick={() => {
                  if (tab.path === null) { setMoreOpen(true); return; }
                  navigate(tab.path);
                }}
                className="flex-1 flex flex-col items-center justify-center py-[17px] min-h-[72px] relative"
                aria-label={tab.label}
              >
                {active && (
                  <span className="absolute top-0 inset-x-3 h-0.5 rounded-b bg-[#2196F3]" />
                )}
                <tab.Icon
                  className={`w-5 h-5 ${active ? "text-[#2196F3]" : "text-[#888888]"}`}
                  strokeWidth={1.8}
                />
              </button>
            );
          })}
        </div>
      </nav>

      {/* More — bottom sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl bg-[#2A2A2A] border-t-0 px-0 pb-8">
          <div className="px-4 pt-4 pb-2">
            <p className="text-[15px] font-medium text-white">More</p>
          </div>
          <div className="bg-[#1E1E1E] rounded-2xl mx-4 overflow-hidden divide-y divide-[#2C2C2C]">
            {MORE_ITEMS.map(({ icon: Icon, label, href }) => (
              <Link key={href} href={href} onClick={() => setMoreOpen(false)}>
                <div className="flex items-center gap-3 px-4 min-h-[56px]">
                  <Icon className="w-5 h-5 text-[#2196F3] shrink-0" />
                  <span className="flex-1 text-[16px] text-white">{label}</span>
                  <ChevronRight className="w-4 h-4 text-[#888888]" />
                </div>
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
