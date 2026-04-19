import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Megaphone, CalendarPlus, CircleDollarSign, ShieldCheck, Sparkles } from "lucide-react";

export default function BottomNav() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const clubRole = (user as any)?.clubRole || "";
  const isAdmin = clubRole === "Admin";

  const tabs = [
    { label: "Trainings", Icon: CalendarPlus,    path: "/",              exact: true  },
    { label: "Info",      Icon: Megaphone,        path: "/home",          exact: true  },
    { label: "Payments",  Icon: CircleDollarSign, path: "/payments",      exact: false },
    { label: "More",      Icon: Sparkles,         path: "/fun-resources", exact: false },
    ...(isAdmin ? [{ label: "Admin", Icon: ShieldCheck, path: "/admin", exact: false }] : []),
  ] as const;

  function isActive(tab: typeof tabs[number]) {
    if ((tab as any).exact) return location === tab.path;
    return location.startsWith(tab.path);
  }

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: "#1E1E1E",
        borderTop: "1px solid #2C2C2C",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="mx-auto max-w-[480px] flex">
        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <button
              key={tab.label}
              onClick={() => navigate(tab.path)}
              style={{ minHeight: 84, paddingTop: 10, paddingBottom: 8 }}
              className="flex-1 flex flex-col items-center justify-start gap-1 relative"
              aria-label={tab.label}
            >
              {active && (
                <span className="absolute top-0 inset-x-3 h-0.5 rounded-b bg-[#2196F3]" />
              )}
              <tab.Icon
                style={{ width: 22, height: 22, color: active ? "#2196F3" : "#888888", flexShrink: 0 }}
                strokeWidth={1.8}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: active ? "#2196F3" : "#888888",
                  lineHeight: 1,
                  letterSpacing: "0.01em",
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
