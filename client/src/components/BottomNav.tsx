import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

// Custom outlined SVG icons per design spec (24×24 viewBox, stroke: currentColor, stroke-width: 1.8, fill: none)

function IconTrainings({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2.5" stroke={color} strokeWidth="1.8"/>
      <path d="M3 9h18M8 3v4M16 3v4" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="12" cy="15" r="1.5" fill={color}/>
    </svg>
  );
}

function IconInfo({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10v4l14 6V4L4 10z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M8 14v4" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

function IconPayments({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8"/>
      <path d="M15 9a3 3 0 00-3-1.5c-1.7 0-3 1-3 2.3 0 1.3 1.2 1.9 3 2.2 1.8.3 3 .9 3 2.2 0 1.3-1.3 2.3-3 2.3a3 3 0 01-3-1.5M12 6v12" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

function IconMore({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5"  width="7" height="7" rx="1.8" stroke={color} strokeWidth="1.8"/>
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" stroke={color} strokeWidth="1.8"/>
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" stroke={color} strokeWidth="1.8"/>
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" stroke={color} strokeWidth="1.8"/>
    </svg>
  );
}

function IconAdmin({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M9 12l2 2 4-4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

const ACTIVE   = "#2196F3";
const INACTIVE = "#888888";

export default function BottomNav() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = (user as any)?.clubRole === "Admin";

  const tabs = [
    { label: "Trainings", Icon: IconTrainings, path: "/",              exact: true  },
    { label: "Info",      Icon: IconInfo,      path: "/home",          exact: true  },
    { label: "Payments",  Icon: IconPayments,  path: "/payments",      exact: false },
    { label: "More",      Icon: IconMore,      path: "/fun-resources", exact: false },
    ...(isAdmin ? [{ label: "Admin", Icon: IconAdmin, path: "/admin", exact: false }] : []),
  ] as const;

  function isActive(tab: (typeof tabs)[number]) {
    return (tab as any).exact ? location === tab.path : location.startsWith(tab.path);
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
      <div className="mx-auto max-w-[480px] flex" style={{ height: 72 }}>
        {tabs.map((tab) => {
          const active = isActive(tab);
          const color = active ? ACTIVE : INACTIVE;
          return (
            <button
              key={tab.label}
              onClick={() => navigate(tab.path)}
              className="flex-1 flex flex-col items-center justify-start relative"
              style={{ gap: 4, paddingTop: 15 }}
              aria-label={tab.label}
            >
              {/* Active indicator — top edge, 28×3px, rounded bottom corners */}
              {active && (
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 28,
                    height: 3,
                    background: ACTIVE,
                    borderRadius: "0 0 4px 4px",
                  }}
                />
              )}
              <tab.Icon color={color} />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: active ? 600 : 500,
                  color,
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
