import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Calendar, AlertTriangle, ChevronDown } from "lucide-react";
import { useState, useMemo } from "react";
import { getMembershipOnTrainingDate, calculateFee } from "@/lib/feeUtils";

const PAGE_SIZE = 10;

function formatFee(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function getFeeForUser(
  session: any,
  memberStatus: string,
  trialEndDate: string
): { fee: number; label: string } {
  const effectiveStatus = getMembershipOnTrainingDate(memberStatus, trialEndDate, session.trainingDate);
  const fee = calculateFee(session, effectiveStatus, "Regular Training");
  const statusLabel = effectiveStatus.toLowerCase();
  const label =
    statusLabel === "member" || statusLabel === "trial" ? "Member fee" :
    statusLabel === "student" ? "Student fee" :
    "Non-member fee";
  return { fee, label };
}

function SessionCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden shadow-md">
      <Skeleton className="h-44 w-full" />
    </div>
  );
}

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const { data: sessions, isLoading, error } = trpc.sessions.list.useQuery();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const memberStatus: string = (user as any)?.memberStatus || "Non-Member";
  const trialEndDate: string = (user as any)?.trialEndDate || "";
  const isNonMember = isAuthenticated && memberStatus === "Non-Member";

  const visibleSessions = useMemo(() => {
    if (!sessions) return [];
    return sessions.slice(0, visibleCount);
  }, [sessions, visibleCount]);

  const hasMore = sessions ? visibleCount < sessions.length : false;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="FATUWR" />

      <main className="mx-auto max-w-[480px] px-4 py-4 pb-8">
        {/* Non-member banner */}
        {isNonMember && (
          <div className="mb-4 rounded-xl bg-navy px-4 py-3 space-y-2">
            <p className="text-sm text-white">
              You're currently a <span className="font-semibold">Non-Member</span>.
              Tap below to find out how to join!
            </p>
            <Link href="/membership">
              <Button
                size="sm"
                className="w-full bg-gold hover:bg-gold-dark text-navy font-semibold h-9 text-sm"
              >
                How to become a Member →
              </Button>
            </Link>
          </div>
        )}

        {!isAuthenticated && (
          <div className="mb-4 p-3 rounded-lg bg-gold/10 border border-gold/20">
            <p className="text-sm text-navy">
              <Link href="/login" className="font-semibold underline">Sign in</Link> to sign up for training sessions and see your personalised fees.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-navy">Upcoming Sessions</h2>
          {sessions && sessions.length > 0 && (
            <span className="text-xs text-muted-foreground">{sessions.length} sessions</span>
          )}
        </div>

        {isLoading && (
          <div className="space-y-4">
            <SessionCardSkeleton />
            <SessionCardSkeleton />
            <SessionCardSkeleton />
          </div>
        )}

        {error && (
          <div className="text-center py-12">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-3" />
            <p className="text-destructive font-medium">Failed to load sessions</p>
            <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
          </div>
        )}

        {!isLoading && !error && sessions?.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-foreground">No upcoming sessions</p>
            <p className="text-sm text-muted-foreground mt-1">Check back later for new training sessions.</p>
          </div>
        )}

        {visibleSessions.length > 0 && (
          <div className="space-y-4">
            {visibleSessions.map((session) => {
              const isClosed = session.isClosed && session.isClosed.trim().length > 0;
              const { fee, label } = getFeeForUser(session, memberStatus, trialEndDate);
              const liveSignups: number = (session as any).signups?.length ?? 0;
              const signupCount = isClosed ? (session.attendance ?? liveSignups) : liveSignups;

              return (
                <Link
                  key={session.rowId}
                  href={isClosed ? "#" : `/session/${session.rowId}`}
                  className={isClosed ? "pointer-events-none" : ""}
                >
                  <div className="rounded-2xl overflow-hidden shadow-md active:scale-[0.99] transition-transform">
                    {/* Hero image / gradient */}
                    <div className="relative h-44 overflow-hidden">
                      {session.poolImageUrl ? (
                        <img
                          src={session.poolImageUrl}
                          alt={`${session.pool} pool`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            const el = e.target as HTMLImageElement;
                            el.style.display = "none";
                            el.parentElement!.classList.add("bg-gradient-to-br", "from-[#1E3A5F]", "to-[#1E73D2]");
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#1E3A5F] to-[#1E73D2]" />
                      )}

                      {/* Dark overlay for text legibility */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                      {/* Closed overlay */}
                      {isClosed && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <span className="bg-white/90 text-gray-800 font-semibold text-sm px-4 py-1.5 rounded-full">
                            Session Closed
                          </span>
                        </div>
                      )}

                      {/* Text overlaid on image */}
                      <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
                        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1 text-[#4DA6FF]">
                          {session.day}
                        </p>
                        <p className="text-[22px] font-bold text-white leading-none mb-1">
                          {session.trainingDate}
                        </p>
                        <p className="text-sm text-white/75 leading-snug">
                          {session.pool}
                          {" | "}
                          {isClosed ? `Attendance: ${signupCount}` : `${signupCount} signed up`}
                        </p>
                      </div>
                    </div>

                    {/* Card footer */}
                    <div className="bg-card px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{session.trainingTime}</span>
                        <span className="font-semibold text-navy tabular-nums">
                          {formatFee(fee)}{" "}
                          <span className="text-muted-foreground font-normal text-xs">{label}</span>
                        </span>
                      </div>

                      {session.trainingObjective && (
                        <p className="text-xs italic text-muted-foreground line-clamp-1">
                          {session.trainingObjective}
                        </p>
                      )}

                      {session.notes && !isClosed && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          {session.notes}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}

            {hasMore && (
              <Button
                variant="outline"
                className="w-full border-navy/20 text-navy hover:bg-navy/5"
                onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
              >
                <ChevronDown className="w-4 h-4 mr-2" />
                Load More ({sessions!.length - visibleCount} remaining)
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
