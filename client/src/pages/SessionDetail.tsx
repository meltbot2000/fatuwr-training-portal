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

/** Returns true if the session start datetime has passed. */
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
  const isAdminUser = (user as any)?.clubRole === "Admin";

  const utils = trpc.useUtils();
  const closeSessionMutation = trpc.admin.closeSession.useMutation({
    onSuccess: async () => {
      toast.success("Session closed.");
      await utils.sessions.detail.invalidate({ rowId: rowId || "" });
    },
    onError: (err) => toast.error(err.message || "Failed to close session."),
  });

  const [editSessionOpen, setEditSessionOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editingSignup, setEditingSignup] = useState<{
    name: string;
    email: string;
    activity: string;
    memberOnTrainingDate: string;
    paymentId: string;
    actualFees: number;
  } | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#111111]">
        <AppHeader title="Session" showBack />
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
        <AppHeader title="Session" showBack />
        <main className="mx-auto max-w-[480px] px-4 py-16 text-center">
          <AlertTriangle className="w-10 h-10 text-white/30 mx-auto mb-3" />
          <p className="text-white/50">Session not found</p>
          <Link href="/">
            <button className="mt-4 px-5 py-2 rounded-xl border border-white/10 text-white/60 text-[13px]">
              Back to Sessions
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

  // Non-admins cannot edit/delete once session has started
  const userCanEdit = !!mySignup && !isClosed && !sessionStarted;

  return (
    <div className="min-h-screen bg-[#111111]">
      <AppHeader title="Session" showBack />

      <main className="mx-auto max-w-[480px] pb-28">
        {/* Hero image */}
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
              <span className="bg-white/10 border border-white/20 text-white/80 font-medium text-sm px-4 py-1.5 rounded-full tracking-wide">
                Session Closed
              </span>
            </div>
          )}
        </div>

        {/* Session info card */}
        <div className="bg-[#1E1E1E] px-4 pt-3 pb-3.5">
          <p className="text-[12px] font-bold uppercase text-[#2196F3] mb-0.5" style={{ letterSpacing: "0.08em" }}>
            {session.day}
          </p>
          <p className="text-[18px] font-bold text-white leading-tight mb-1">
            {session.trainingDate}{session.trainingTime ? `, ${session.trainingTime}` : ""}
          </p>
          <p className="text-[13px] text-[#888888]">
            {session.pool}
            {" · "}
            {isClosed ? `Attendance: ${signupCount}` : `${signupCount} signed up`}
          </p>
        </div>

        <div className="px-4 pt-4 space-y-3">
          {/* Training objective */}
          {session.trainingObjective && (
            <div className="bg-[#1E1E1E] rounded-xl px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 mb-1.5">
                Training Objective
              </p>
              <p className="text-[13px] text-white/70 leading-relaxed">{session.trainingObjective}</p>
            </div>
          )}

          {/* Notes */}
          {session.notes && (
            <div className="bg-[#3D3500] rounded-xl px-4 py-3">
              <p className="text-[14px] text-[#F5C518] leading-snug">{session.notes}</p>
            </div>
          )}

          {/* Splits reminder — only when open */}
          {!isClosed && (
            <div className="bg-[#1E1E1E] rounded-xl px-4 py-3">
              <p className="text-[13px] text-[#888888] leading-snug">
                If splits have been sent, let the splits team know if you sign up or drop out.
              </p>
            </div>
          )}

          {/* ── Primary CTA (full width) ── */}
          {!isAuthenticated ? (
            <Link href="/login">
              <button className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[13px]">
                Sign In to Register
              </button>
            </Link>
          ) : isClosed ? (
            <button disabled className="w-full h-[48px] rounded-full bg-white/6 text-white/25 text-[13px] cursor-default">
              Sign-ups Closed
            </button>
          ) : sessionStarted && !mySignup ? (
            <button disabled className="w-full h-[48px] rounded-full bg-white/6 text-white/25 text-[13px] cursor-default">
              Session In Progress
            </button>
          ) : mySignup ? (
            <button
              disabled={!userCanEdit}
              className={`w-full h-[48px] rounded-full text-[13px] font-medium flex items-center justify-center gap-2 transition-colors ${
                userCanEdit
                  ? "bg-[#2196F3] text-white"
                  : "bg-white/6 text-white/25 cursor-default"
              }`}
              onClick={() => { if (userCanEdit) { setEditingSignup(mySignup!); setEditSheetOpen(true); } }}
            >
              <Pencil className="w-4 h-4" />
              {sessionStarted ? "Session In Progress" : "Edit My Sign-up"}
            </button>
          ) : (
            <Link href={`/signup/${rowId}`}>
              <button className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[13px]">
                Sign Up
              </button>
            </Link>
          )}

          {/* Sign-ups list */}
          {session.signups && session.signups.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 mb-2 mt-1">
                Sign-ups
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
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[12px] font-semibold ${isMe ? "bg-[#2196F3] text-white" : "bg-white/8 text-white/50"}`}>
                        {getInitials(su.name) || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-white/85 truncate">
                          {su.name}
                          {isMe && <span className="ml-1.5 text-[11px] text-[#2196F3] font-normal">you</span>}
                        </p>
                        <p className="text-[12px] text-white/40">{su.activity}</p>
                      </div>
                      {tappable && <ChevronRight className="w-4 h-4 text-white/25 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Splits button — below sign-ups list, above admin */}
          {isAuthenticated && (
            <Link href={`/session/${rowId}/splits`}>
              <button className="w-full h-[48px] rounded-full border border-white/20 text-white font-medium text-[13px] flex items-center justify-center gap-2 hover:bg-white/5 transition-colors">
                <Pencil className="w-4 h-4" />
                Splits
              </button>
            </Link>
          )}

          {/* Admin controls */}
          {isAdminUser && (
            <div className="space-y-2 pt-1 border-t border-white/8">
              <button
                className="w-full h-10 rounded-xl bg-red-500/15 border border-red-500/30 text-[13px] text-red-400 font-medium flex items-center justify-center gap-2 hover:bg-red-500/25 transition-colors"
                onClick={() => setEditSessionOpen(true)}
              >
                <Pencil className="w-3.5 h-3.5" />
                Admin: Edit Session
              </button>

              {!isClosed && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="w-full h-10 rounded-xl bg-red-500/15 border border-red-500/30 text-[13px] text-red-400 font-medium flex items-center justify-center hover:bg-red-500/25 transition-colors"
                      disabled={closeSessionMutation.isPending}
                    >
                      Admin: Close Sign-ups
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Close sign-ups?</AlertDialogTitle>
                      <AlertDialogDescription>
                        No new sign-ups for {session.trainingDate} at {session.pool}. This cannot be undone here.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-white hover:bg-destructive/90"
                        onClick={() => closeSessionMutation.mutate({ rowId: rowId || "" })}
                      >
                        Close Session
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}
        </div>
      </main>

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
