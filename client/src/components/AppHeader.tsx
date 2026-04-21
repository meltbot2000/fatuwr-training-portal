import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Link, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";

interface AppHeaderProps {
  title?: string;
  showBack?: boolean;
  backPath?: string;
  rightAction?: React.ReactNode;
}

export default function AppHeader({ title = "FATUWR", showBack = false, backPath = "/", rightAction }: AppHeaderProps) {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { data: profile } = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // cache for 5 min — no need to re-fetch on every nav
  });
  const avatarImage = profile?.image || "";

  return (
    <>
    {/* Spacer — same height as the fixed header so content doesn't hide behind it */}
    <div style={{ height: "calc(56px + env(safe-area-inset-top, 0px))", flexShrink: 0 }} aria-hidden="true" />
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: "#1E1E1E",
        borderBottom: "1px solid #2C2C2C",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div className="mx-auto max-w-[480px] flex items-center justify-between px-4 h-14 relative">
        <div className="flex items-center gap-2">
          {showBack && (
            <button
              onClick={() => navigate(backPath)}
              className="p-1 rounded-full hover:bg-white/10 transition-colors"
              aria-label="Go back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
        </div>

        <span className="absolute left-1/2 -translate-x-1/2 text-[18px] font-bold text-white">
          {title}
        </span>

        <div className="flex items-center gap-2">
          {rightAction}
          {isAuthenticated ? (
            <Link href="/profile" className="flex items-center gap-2 hover:bg-white/10 rounded-full p-1.5 transition-colors">
              <div className="w-8 h-8 rounded-full bg-white/20 overflow-hidden flex items-center justify-center text-white font-bold text-sm">
                {avatarImage
                  ? <img src={avatarImage} alt="Profile" className="w-full h-full object-cover" />
                  : (user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U")
                }
              </div>
            </Link>
          ) : (
            <Link href="/login" className="text-white text-[14px] font-medium border border-white/40 rounded-full px-4 py-1.5">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
    </>
  );
}
