import { useAuth } from "@/_core/hooks/useAuth";
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

  return (
    <header className="sticky top-0 z-50 bg-[#1E1E1E] text-white" style={{ borderBottom: "1px solid #2C2C2C" }}>
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
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">
                {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U"}
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
  );
}
