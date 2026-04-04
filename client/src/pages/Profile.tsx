import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useLocation } from "wouter";
import { User, Mail, Shield, LogOut } from "lucide-react";
import { toast } from "sonner";

export default function Profile() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });

  const { data: profile, isLoading } = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Signed out successfully");
      navigate("/");
    } catch {
      toast.error("Failed to sign out");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Profile" showBack />
        <main className="mx-auto max-w-[480px] px-4 py-4 space-y-4">
          <Skeleton className="h-24 w-24 rounded-full mx-auto" />
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-32 w-full" />
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

  const statusColorMap: Record<string, string> = {
    "Member": "bg-green-100 text-green-800",
    "Student": "bg-blue-100 text-blue-800",
    "Non-Member": "bg-gray-100 text-gray-800",
  };
  const statusColor = statusColorMap[displayProfile.memberStatus] || "bg-gray-100 text-gray-800";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Profile" showBack />

      <main className="mx-auto max-w-[480px] px-4 py-6 pb-8">
        {/* Avatar */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 rounded-full bg-navy flex items-center justify-center text-white text-3xl font-bold mb-3">
            {displayProfile.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <h2 className="text-xl font-bold text-navy">{displayProfile.name || "User"}</h2>
          <Badge className={`mt-2 ${statusColor}`}>
            {displayProfile.memberStatus}
          </Badge>
        </div>

        {/* Info card */}
        <Card className="mb-4">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm font-medium">{displayProfile.name || "Not set"}</p>
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium">{displayProfile.email || "Not set"}</p>
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Membership Status</p>
                <p className="text-sm font-medium">{displayProfile.memberStatus}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fee reference */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <h3 className="text-sm font-bold text-navy mb-3">Your Fee Rates</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Full Training</p>
                <p className="font-bold text-navy">
                  {displayProfile.memberStatus === "Member" ? "$5.00" :
                   displayProfile.memberStatus === "Student" ? "$5.00" : "$10.00"}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Swim Only</p>
                <p className="font-bold text-navy">
                  {displayProfile.memberStatus === "Member" ? "$3.00" :
                   displayProfile.memberStatus === "Student" ? "$3.00" : "$5.00"}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Fees may vary by session. Check session details for exact pricing.
            </p>
          </CardContent>
        </Card>

        {/* Logout */}
        <Button
          onClick={handleLogout}
          variant="outline"
          className="w-full h-12 text-destructive border-destructive/30 hover:bg-destructive/5"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </main>
    </div>
  );
}
