import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

type Tab = {
  label: string;
  icon: string;
  path: string;
};

const TABS: Tab[] = [
  { label: "Training", icon: "📋", path: "/" },
  { label: "Payments", icon: "💰", path: "/payments" },
  { label: "Membership", icon: "🏊", path: "/membership" },
  { label: "Profile", icon: "👤", path: "/profile" },
];

const ADMIN_TAB: Tab = { label: "Admin", icon: "⚙️", path: "/admin" };

export default function BottomNav() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();

  const clubRole = (user as any)?.clubRole || "";
  const isAdminOrHelper = clubRole === "Admin" || clubRole === "Helper";

  const tabs = isAdminOrHelper ? [...TABS, ADMIN_TAB] : TABS;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-background border-t border-border safe-area-inset-bottom">
      <div className="mx-auto max-w-[480px] flex">
        {tabs.map((tab) => {
          const isActive = tab.path === "/"
            ? location === "/"
            : location.startsWith(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-3 min-h-[64px] relative transition-colors"
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <span className="absolute top-0 inset-x-3 h-0.5 rounded-b bg-[#4DA6FF]" />
              )}
              <span className="text-[22px] leading-none">{tab.icon}</span>
              <span
                className={`text-[11px] font-medium leading-none ${
                  isActive ? "text-[#4DA6FF]" : "text-muted-foreground"
                }`}
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
