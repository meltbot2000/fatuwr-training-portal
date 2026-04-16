import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLOR: Record<string, string> = {
  "Member":     "bg-green-400/15 text-green-300",
  "Student":    "bg-blue-400/15 text-blue-300",
  "Trial":      "bg-amber-400/15 text-amber-300",
  "Non-Member": "bg-white/8 text-white/50",
};

export default function Profile() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });

  const { data: profile, isLoading } = trpc.profile.get.useQuery(undefined, { enabled: isAuthenticated });

  const handleLogout = async () => {
    try { await logout(); toast.success("Signed out"); navigate("/"); }
    catch { toast.error("Failed to sign out"); }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Profile" showBack />
        <main className="mx-auto max-w-[480px] px-4 py-6 space-y-3">
          <Skeleton className="h-20 w-20 rounded-full mx-auto" />
          <Skeleton className="h-5 w-36 mx-auto" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </main>
      </div>
    );
  }

  const displayProfile = profile || {
    name: user?.name || "",
    email: user?.email || "",
    memberStatus: (user as any)?.memberStatus || "Non-Member",
    image: "",
  };

  const statusColor = STATUS_COLOR[displayProfile.memberStatus] ?? STATUS_COLOR["Non-Member"];
  const initials = displayProfile.name?.charAt(0)?.toUpperCase() || "U";

  const rows = [
    { label: "Name",   value: displayProfile.name  || "Not set" },
    { label: "Email",  value: displayProfile.email || "Not set" },
    { label: "Status", value: displayProfile.memberStatus },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Profile" showBack />

      <main className="mx-auto max-w-[480px] px-4 py-6 pb-10 space-y-4">
        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-2 pb-2">
          <div className="w-18 h-18 w-[72px] h-[72px] rounded-full bg-[#2a2a2a] flex items-center justify-center text-white text-2xl font-bold">
            {initials}
          </div>
          <p className="text-[18px] font-bold text-foreground">{displayProfile.name || "User"}</p>
          <span className={`text-[12px] font-medium px-3 py-0.5 rounded-full ${statusColor}`}>
            {displayProfile.memberStatus}
          </span>
        </div>

        {/* Info rows */}
        <div className="bg-card rounded-xl divide-y divide-border">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="text-[13px] text-muted-foreground">{label}</span>
              <span className="text-[13px] text-foreground">{value}</span>
            </div>
          ))}
        </div>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          className="w-full h-[52px] rounded-full border border-red-500/25 text-red-400 text-[14px] font-medium flex items-center justify-center gap-2 hover:bg-red-400/8 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </main>
    </div>
  );
}
