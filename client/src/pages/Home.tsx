import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Calendar, AlertTriangle } from "lucide-react";
import { useMemo } from "react";

const MAX_SESSIONS = 6;

function SessionCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden">
      <Skeleton className="h-48 w-full bg-[#2a2a2a]" />
      <div className="bg-[#1E1E1E] px-4 py-3 space-y-2">
        <Skeleton className="h-3 w-20 bg-[#2a2a2a]" />
        <Skeleton className="h-6 w-40 bg-[#2a2a2a]" />
        <Skeleton className="h-4 w-32 bg-[#2a2a2a]" />
      </div>
    </div>
  );
}

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const { data: sessions, isLoading, error } = trpc.sessions.list.useQuery();

  const visibleSessions = useMemo(() => {
    if (!sessions) return [];
    return sessions.slice(0, MAX_SESSIONS);
  }, [sessions]);

  return (
    <div className="min-h-screen bg-[#111111]">
      <AppHeader title="Training Sessions" />

      <main className="mx-auto max-w-[480px] px-4 py-4 pb-8">
        {/* Sign-in prompt */}
        {!isAuthenticated && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-[#1E1E1E] border border-[#2C2C2C]">
            <p className="text-sm text-white/70">
              <Link href="/login" className="font-semibold text-[#2196F3] underline">Sign in</Link>
              {" "}to register for sessions and view your fees.
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
            <p className="text-red-400 font-medium">Failed to load sessions</p>
            <p className="text-sm text-white/40 mt-1">{error.message}</p>
          </div>
        )}

        {!isLoading && !error && sessions?.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <p className="font-medium text-white/60">No upcoming sessions</p>
            <p className="text-sm text-white/30 mt-1">Check back later for new training sessions.</p>
          </div>
        )}

        {visibleSessions.length > 0 && (
          <div className="space-y-3">
            {visibleSessions.map((session) => {
              const isClosed = session.isClosed && session.isClosed.trim().length > 0;
              const liveSignups: number = (session as any).signups?.length ?? 0;
              const signupCount = isClosed ? (session.attendance ?? liveSignups) : liveSignups;

              return (
                <Link
                  key={session.rowId}
                  href={isClosed ? "#" : `/session/${session.rowId}`}
                  className={isClosed ? "pointer-events-none" : ""}
                >
                  <div className="rounded-2xl overflow-hidden active:scale-[0.99] transition-transform">
                    {/* Hero image */}
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

                      {/* Closed overlay */}
                      {isClosed && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <span className="bg-white/10 border border-white/20 text-white/80 font-medium text-sm px-4 py-1.5 rounded-full tracking-wide">
                            Session Closed
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Card body — dark */}
                    <div className="bg-[#1E1E1E] px-4 pt-3 pb-3.5">
                      {/* Day */}
                      <p className="text-[12px] font-bold uppercase text-[#2196F3] mb-0.5" style={{ letterSpacing: "0.08em" }}>
                        {session.day}
                      </p>
                      {/* Date + time */}
                      <p className="text-[18px] font-bold text-white leading-tight mb-1">
                        {session.trainingDate}{session.trainingTime ? `, ${session.trainingTime}` : ""}
                      </p>
                      {/* Pool + count */}
                      <p className="text-[13px] text-[#888888]">
                        {session.pool}
                        {" · "}
                        {isClosed
                          ? `Attendance: ${signupCount}`
                          : `${signupCount} signed up`}
                      </p>

                      {/* Notes warning */}
                      {session.notes && !isClosed && (
                        <div className="mt-2.5 bg-[#3D3500] rounded-xl px-2.5 py-2 text-[12px] text-[#F5C518]">
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
