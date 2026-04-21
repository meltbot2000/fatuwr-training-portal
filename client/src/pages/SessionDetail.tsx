import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import EditSignupSheet from "@/components/EditSignupSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Link, useParams } from "wouter";
import { AlertTriangle, Pencil, ChevronRight } from "lucide-react";
import { EditSessionSheet } from "@/components/EditSessionSheet";
import { toast } from "sonner";

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(p => p[0]?.toUpperCase() || "").slice(0, 2).join("");
}

function hasSessionStarted(trainingDate: string, trainingTime?: string): boolean {
  const date = new Date(trainingDate);
  if (isNaN(date.getTime())) return false;
  if (trainingTime) {
    const m = trainingTime.match(/(\d+):?(\d*)\s*(am|pm)?/i);
    if (m) {
      let h = parseInt(m[1]);
      const mins = parseInt(m[2] || "0");
      const ampm = m[3]?.toLowerCase();
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      date.setHours(h, mins, 0, 0);
    }
  }
  return new Date() >= date;
}

export default function SessionDetail() {
  const { rowId } = useParams<{ rowId: string }>();
  const { user, isAuthenticated } = useAuth();

  const { data: session, isLoading, error } = trpc.sessions.detail.useQuery(
    { rowId: rowId || "" },
    { enabled: !!rowId }
  );

  const userEmail = ((user as any)?.email || "").toLowerCase().trim();
  const isAdminUser = (user as any)?.clubRole === "Admin" || (user as any)?.clubRole === "Helper";

  const utils = trpc.useUtils();

  const [editSessionOpen, setEditSessionOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editingSignup, setEditingSignup] = useState<{
    id: number | null;
    name: string;
    email: string;
    activity: string;
    memberOnTrainingDate: string;
    paymentId: string;
    actualFees: number;
  } | null>(null);

  // Admin pencil icon for top bar right slot
  const adminTopBarAction = isAdminUser ? (
    <button
      onClick={() => setEditSessionOpen(true)}
      className="p-2 rounded-full hover:bg-white/10 transition-colors"
      aria-label="Edit session"
    >
      <Pencil className="w-5 h-5 text-white" />
    </button>
  ) : undefined;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#111111]">
        <AppHeader title="Session" showBack backPath="/" rightAction={adminTopBarAction} />
        <main className="mx-auto max-w-[480px] space-y-3 px-4 py-4">
          <Skeleton className="h-48 w-full rounded-none" style={{ background: "#1E1E1E" }} />
          <Skeleton className="h-20 w-full rounded-xl" style={{ background: "#1E1E1E" }} />
          <Skeleton className="h-12 w-full rounded-xl" style={{ background: "#1E1E1E" }} />
        </main>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-[#111111]">
        <AppHeader title="Session" showBack backPath="/" />
        <main className="mx-auto max-w-[480px] px-4 py-16 text-center">
          <AlertTriangle className="w-10 h-10 text-white/30 mx-auto mb-3" />
          <p className="text-[13px] text-white/50">Session not found</p>
          <Link href="/">
            <button className="mt-4 px-5 py-2 rounded-full border-[1.5px] border-white/20 text-white/60 text-[15px] font-medium">
              Back to sessions
            </button>
          </Link>
        </main>
      </div>
    );
  }

  const isClosed = session.isClosed && session.isClosed.trim().length > 0;
  const sessionStarted = hasSessionStarted(session.trainingDate, session.trainingTime ?? "");
  const mySignup = session.signups?.find(s => s.email.toLowerCase().trim() === userEmail);
  const signupCount = session.signups?.length ?? 0;
  const userCanEdit = !!mySignup && !isClosed && !sessionStarted;

  return (
    <div className="min-h-screen bg-[#111111]">
      {/* Admin pencil icon lives in the top bar right slot */}
      <AppHeader title="Session" showBack backPath="/" rightAction={adminTopBarAction} />

      <main className="mx-auto max-w-[480px]" style={{ paddingBottom: "calc(10rem + env(safe-area-inset-bottom, 0px))" }}>
        {/* 1. Hero image */}
        <div className="relative h-48 overflow-hidden">
          {session.poolImageUrl ? (
            <img
              src={session.poolImageUrl}
              alt={`${session.pool} pool`}
              className="w-full h-full object-cover"
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
              <span className="bg-white/10 border border-white/20 text-white/80 font-medium text-[15px] px-4 py-1.5 rounded-full">
                Session closed
              </span>
            </div>
          )}
        </div>

        {/* 2. Day name + location + training time */}
        <div className="bg-[#1E1E1E] px-4 pt-3 pb-3.5">
          {/* Day heading — fs-header: 17px/600, white, normal case (NOT badge/uppercase) */}
          <p className="text-[17px] font-semibold text-white leading-tight mb-1">
            {session.day}
          </p>
          {/* Location — fs-meta: 13px/400, grey */}
          <p className="text-[13px] text-[#888888]">
            {session.pool}
            {" · "}
            {isClosed ? `Attendance: ${signupCount}` : `${signupCount} signed up`}
          </p>
          {/* Training time — label + value */}
          {session.trainingDate && (
            <p className="text-[14px] text-white mt-0.5">
              {session.trainingDate}{session.trainingTime ? `, ${session.trainingTime}` : ""}
            </p>
          )}
        </div>

        <div className="px-4 pt-4">

          {/* Training objective */}
          {session.trainingObjective && (
            <div className="bg-[#1E1E1E] rounded-xl px-4 py-3 mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 mb-1.5">
                Training objective
              </p>
              <p className="text-[13px] text-[#888888] leading-relaxed">{session.trainingObjective}</p>
            </div>
          )}

          {/* Warning banner (notes) */}
          {session.notes && (
            <div className="bg-[#3D3500] rounded-xl px-4 py-4 mb-3">
              <p className="text-[13px] text-[#F5C518] leading-snug">{session.notes}</p>
            </div>
          )}

          {/* 3. Splits pill — self-sized, outlined chip style, left-aligned */}
          {isAuthenticated && (
            <div className="mb-4">
              <Link href={`/session/${rowId}/splits`}>
                <button className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-[#888888] bg-transparent text-white text-[14px] px-[14px] py-[6px] hover:bg-white/5 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                  Splits
                </button>
              </Link>
            </div>
          )}

          {/* 5. Sign up button — full width, primary. 16px gap below Splits. */}
          <div className="mb-6">
            {!isAuthenticated ? (
              <Link href="/login">
                <button className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[15px]">
                  Sign in to register
                </button>
              </Link>
            ) : isClosed ? (
              <button disabled className="w-full h-[48px] rounded-full bg-white/6 text-white/25 text-[15px] font-medium cursor-default">
                Sign-ups closed
              </button>
            ) : sessionStarted && !mySignup && !isAdminUser ? (
              <button disabled className="w-full h-[48px] rounded-full bg-white/6 text-white/25 text-[15px] font-medium cursor-default">
                Session in progress
              </button>
            ) : mySignup ? (
              <div className="w-full h-[48px] rounded-full bg-white/5 text-white/30 cursor-default text-[15px] flex items-center justify-center">
                You're signed up
              </div>
            ) : (
              <Link href={`/signup/${rowId}`}>
                <button className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[15px]">
                  Sign up
                </button>
              </Link>
            )}
          </div>

          {/* 6 & 7. "Training Sign-ups" header + list — always below Sign up button */}
          {session.signups && session.signups.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 mb-2">
                Training sign-ups
              </p>
              <div className="bg-[#1E1E1E] rounded-xl divide-y divide-[#2C2C2C] overflow-hidden">
                {session.signups.map((su, idx) => {
                  const isMe = isAuthenticated && su.email.toLowerCase().trim() === userEmail;
                  const tappable = isAdminUser || (isMe && userCanEdit);
                  return (
                    <button
                      key={idx}
                      onClick={() => { if (tappable) { setEditingSignup(su); setEditSheetOpen(true); } }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left ${tappable ? "hover:bg-white/4 active:bg-white/6" : "cursor-default"}`}
                    >
                      <div className={`w-9 h-9 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[12px] font-semibold ${isMe ? "bg-[#2196F3] text-white" : "bg-white/8 text-white/50"}`}>
                        {(su as any).image
                          ? <img src={(su as any).image} alt={su.name} className="w-full h-full object-cover" />
                          : (getInitials(su.name) || "?")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium text-white truncate">
                          {su.name}
                          {isMe && <span className="ml-1.5 text-[11px] text-[#2196F3] font-normal">you</span>}
                        </p>
                        <p className="text-[13px] text-[#888888]">{su.activity}</p>
                      </div>
                      {tappable && <ChevronRight className="w-4 h-4 text-white/25 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </main>

      {/* 8. Admin edit session sheet — triggered from top bar icon */}
      {isAdminUser && session && (
        <EditSessionSheet open={editSessionOpen} onOpenChange={setEditSessionOpen} session={session} />
      )}

      {editingSignup && (
        <EditSignupSheet
          open={editSheetOpen}
          onOpenChange={setEditSheetOpen}
          sessionRowId={rowId || ""}
          sessionDate={session.trainingDate}
          sessionPool={session.pool}
          session={session}
          signup={editingSignup}
          onDone={() => setEditingSignup(null)}
        />
      )}
    </div>
  );
}
