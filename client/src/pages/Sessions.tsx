import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Calendar, AlertTriangle, Star } from "lucide-react";
import { useMemo } from "react";

function parseFlexDate(s: string): Date | null {
  if (!s || s === "NA") return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  const parts = s.split("/");
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    const d2 = new Date(`${yyyy}-${mm}-${dd}`);
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

const MAX_SESSIONS = 6;

function SessionCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden">
      <Skeleton className="h-48 w-full bg-[#2a2a2a]" />
      <div className="bg-[#1E1E1E] px-4 py-3 space-y-2">
        <Skeleton className="h-3 w-20 bg-[#2a2a2a]" />
        <Skeleton className="h-5 w-40 bg-[#2a2a2a]" />
        <Skeleton className="h-4 w-32 bg-[#2a2a2a]" />
      </div>
    </div>
  );
}

export default function Sessions() {
  const { user, isAuthenticated } = useAuth();
  const { data: sessions, isLoading, error } = trpc.sessions.list.useQuery();

  const memberStatus: string = (user as any)?.memberStatus || "Non-Member";
  const trialEndDate: string = (user as any)?.trialEndDate || "";
  const isNonMember = isAuthenticated && memberStatus === "Non-Member";
  const isTrial = isAuthenticated && memberStatus === "Trial";

  // Trial expiry: warn if within 14 days
  const trialEndDisplay = useMemo(() => {
    if (!isTrial || !trialEndDate) return null;
    const end = parseFlexDate(trialEndDate);
    if (!end) return null;
    const daysLeft = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft > 14) return null;
    return end.toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });
  }, [isTrial, trialEndDate]);

  const visibleSessions = useMemo(() => {
    if (!sessions) return [];
    return sessions.slice(0, MAX_SESSIONS);
  }, [sessions]);

  return (
    <div className="min-h-screen bg-[#111111]">
      <AppHeader title="Training Sessions" />

      <main className="mx-auto max-w-[480px] px-4 py-4 pb-8">
        {!isAuthenticated && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-[#1E1E1E] border border-[#2C2C2C]">
            <p className="text-[16px] text-[#888888]">
              <Link href="/login" className="font-semibold text-[#2196F3] underline">Sign in</Link>
              {" "}to register for sessions and view your fees.
            </p>
          </div>
        )}

        {/* Non-member membership nudge */}
        {isNonMember && (
          <div className="mb-4 space-y-2">
            <div className="px-4 py-3.5 rounded-xl bg-[#1A2A3A]">
              <p className="text-[14px] text-white leading-snug">
                You're currently not a member — click the button below to find out how to become a Trial or Annual Member
              </p>
            </div>
            <Link href="/membership">
              <div className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[15px] flex items-center justify-center gap-2 cursor-pointer">
                <Star className="w-4 h-4" />
                How to become a Member
              </div>
            </Link>
          </div>
        )}

        {/* Trial expiry warning (within 14 days) */}
        {trialEndDisplay && (
          <div className="mb-4 px-4 py-3.5 rounded-xl bg-[#2A2A2A]">
            <p className="text-[14px] text-white leading-snug">
              Your Trial Membership ends on {trialEndDisplay} — go to the{" "}
              <Link href="/membership" className="text-[#2196F3] underline">Membership tab</Link>{" "}
              to sign up for annual membership
            </p>
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            <SessionCardSkeleton />
            <SessionCardSkeleton />
            <SessionCardSkeleton />
          </div>
        )}

        {error && (
          <div className="text-center py-12">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-[15px] font-medium text-red-400">Failed to load sessions</p>
            <p className="text-[13px] text-white/40 mt-1">{error.message}</p>
          </div>
        )}

        {!isLoading && !error && sessions?.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <p className="text-[15px] font-medium text-white/60">No upcoming sessions</p>
            <p className="text-[13px] text-white/30 mt-1">Check back later for new training sessions.</p>
          </div>
        )}

        {visibleSessions.length > 0 && (
          <div className="space-y-3">
            {visibleSessions.map((session) => {
              const isClosed = session.isClosed && session.isClosed.trim().length > 0;
              const signupCount = (session as any).signupCount ?? 0;

              return (
                <Link
                  key={session.rowId}
                  href={`/session/${session.rowId}`}
                >
                  <div className="rounded-2xl overflow-hidden active:scale-[0.99] transition-transform">
                    <div className="relative h-48 overflow-hidden">
                      {session.poolImageUrl ? (
                        <img
                          src={session.poolImageUrl}
                          alt={`${session.pool} pool`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            const el = e.target as HTMLImageElement;
                            el.style.display = "none";
                            el.parentElement!.style.background = "linear-gradient(135deg, #1E3A5F, #1E73D2)";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#1E3A5F] to-[#1E73D2]" />
                      )}
                      {isClosed && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <span className="bg-white/10 border border-white/20 text-white/80 font-medium text-[15px] px-4 py-1.5 rounded-full tracking-wide">
                            Session closed
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="bg-[#1E1E1E] px-4 pt-3 pb-3.5">
                      <p className="text-[11px] font-semibold uppercase text-[#2196F3] mb-0.5" style={{ letterSpacing: "0.08em" }}>
                        {session.day}
                      </p>
                      <p className="text-[14px] text-white leading-tight mb-1">
                        {session.trainingDate}{session.trainingTime ? `, ${session.trainingTime}` : ""}
                      </p>
                      <p className="text-[13px] text-[#888888]">
                        {session.pool}
                        {" · "}
                        {isClosed
                          ? `Attendance: ${signupCount}`
                          : `${signupCount} signed up`}
                      </p>
                      {session.notes && !isClosed && (
                        <div className="mt-2.5 bg-[#3D3500] rounded-xl px-4 py-4 text-[13px] text-[#F5C518]">
                          {session.notes}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
