import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Home, CalendarPlus, CircleDollarSign, ShieldCheck, Sparkles } from "lucide-react";

export default function BottomNav() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const clubRole = (user as any)?.clubRole || "";
  const isAdmin = clubRole === "Admin";

  const tabs = [
    { label: "Home",       Icon: Home,              path: "/",              exact: true  },
    { label: "Training",   Icon: CalendarPlus,       path: "/sessions",      exact: false },
    { label: "Payments",   Icon: CircleDollarSign,   path: "/payments",      exact: false },
    { label: "Fun Stuff",  Icon: Sparkles,           path: "/fun-resources", exact: false },
    ...(isAdmin ? [{ label: "Admin", Icon: ShieldCheck, path: "/admin", exact: false }] : []),
  ] as const;

  function isActive(tab: typeof tabs[number]) {
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
                onClick={() => navigate(tab.path)}
                className="flex-1 flex flex-col items-center justify-start pt-[9px] min-h-[72px] relative"
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

    </>
  );
}
