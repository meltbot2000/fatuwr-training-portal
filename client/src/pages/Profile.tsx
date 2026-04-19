import { useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { LogOut, Camera, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLOR: Record<string, string> = {
  "Member":     "bg-green-400/15 text-green-300",
  "Student":    "bg-blue-400/15 text-blue-300",
  "Trial":      "bg-amber-400/15 text-amber-300",
  "Non-Member": "bg-white/8 text-white/50",
};

const APP_URL = "https://fatuwr.up.railway.app";

export default function Profile() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });

  const { data: profile, isLoading, refetch } = trpc.profile.get.useQuery(undefined, { enabled: isAuthenticated });
  const updatePhoto = trpc.profile.updatePhoto.useMutation({ onSuccess: () => refetch() });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const handleLogout = async () => {
    try { await logout(); toast.success("Signed out"); navigate("/"); }
    catch { toast.error("Failed to sign out"); }
  };

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Photo must be under 2 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      updatePhoto.mutate({ image: dataUrl }, {
        onSuccess: () => toast.success("Photo updated"),
        onError: () => toast.error("Failed to update photo"),
      });
    };
    reader.readAsDataURL(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(APP_URL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
          {/* Clickable avatar */}
          <button
            onClick={handleAvatarClick}
            className="relative w-[72px] h-[72px] rounded-full overflow-hidden focus:outline-none group"
            aria-label="Change profile photo"
          >
            {displayProfile.image ? (
              <img src={displayProfile.image} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-[#2a2a2a] flex items-center justify-center text-white text-2xl font-bold">
                {initials}
              </div>
            )}
            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
              <Camera className="w-5 h-5 text-white" />
            </div>
            {/* Loading indicator while uploading */}
            {updatePhoto.isPending && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
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
          className="w-full h-[52px] rounded-full border border-red-500/25 text-red-400 text-[13px] font-medium flex items-center justify-center gap-2 hover:bg-red-400/8 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>

        {/* App URL */}
        <div className="bg-card rounded-xl px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide font-medium">App Link</p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-foreground truncate">{APP_URL}</span>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 flex items-center gap-1.5 text-[12px] font-medium text-[#2196F3] hover:opacity-80 transition-opacity"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
