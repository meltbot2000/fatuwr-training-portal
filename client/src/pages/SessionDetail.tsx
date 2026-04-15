import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import EditSignupSheet from "@/components/EditSignupSheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Link, useParams } from "wouter";
import { Clock, MapPin, Users, AlertTriangle, Pencil, ChevronRight, DollarSign } from "lucide-react";
import { EditSessionSheet } from "@/components/EditSessionSheet";
import { toast } from "sonner";

function formatFee(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(p => p[0]?.toUpperCase() || "").slice(0, 2).join("");
}

export default function SessionDetail() {
  const { rowId } = useParams<{ rowId: string }>();
  const { user, isAuthenticated } = useAuth();

  const { data: session, isLoading, error } = trpc.sessions.detail.useQuery(
    { rowId: rowId || "" },
    { enabled: !!rowId }
  );

  const memberStatus = ((user as any)?.memberStatus || "Non-Member").toLowerCase();
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
    activity: string;
    memberOnTrainingDate: string;
    paymentId: string;
    actualFees: number;
  } | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Session Details" showBack />
        <main className="mx-auto max-w-[480px] px-4 py-4">
          <Skeleton className="h-48 w-full rounded-lg" />
          <div className="mt-4 space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Session Details" showBack />
        <main className="mx-auto max-w-[480px] px-4 py-12 text-center">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-3" />
          <p className="text-destructive font-medium">Session not found</p>
          <Link href="/">
            <Button variant="outline" className="mt-4">Back to Sessions</Button>
          </Link>
        </main>
      </div>
    );
  }

  const isClosed = session.isClosed && session.isClosed.trim().length > 0;
  const mySignup = session.signups?.find(s => s.email.toLowerCase().trim() === userEmail);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Session Details" showBack />

      <main className="mx-auto max-w-[480px] pb-24">
        {/* Hero image */}
        {session.poolImageUrl && (
          <div className="h-48 overflow-hidden bg-muted">
            <img
              src={session.poolImageUrl}
              alt={`${session.pool} pool`}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        )}

        <div className="px-4 py-4 space-y-4">
          {/* Header */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <p className="text-xs font-bold uppercase tracking-wider text-gold">{session.day}</p>
              {isClosed && <Badge variant="destructive">Closed</Badge>}
            </div>
            <h1 className="text-2xl font-bold text-navy">{session.pool}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {session.trainingDate}, {session.trainingTime}
              </span>
              {session.signups && session.signups.length > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {session.signups.length} signed up
                </span>
              )}
            </div>
          </div>

          {/* Training objective */}
          {session.trainingObjective && (
            <Card>
              <CardContent className="p-3">
                <p className="text-sm font-medium text-navy mb-1">Training Objective</p>
                <p className="text-sm text-muted-foreground">{session.trainingObjective}</p>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {session.notes && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {session.notes}
            </div>
          )}

          {/* Splits + CTA */}
          <div className="space-y-2.5">
            {isAuthenticated && (
              <Link href={`/session/${rowId}/splits`}>
                <Button variant="outline" size="sm" className="border-navy/30 text-navy">
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Splits
                </Button>
              </Link>
            )}

            {!isClosed && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <p>
                  If the splits have already been sent, please inform the splits team if you're
                  signing up or dropping out so they can adjust the split.
                </p>
              </div>
            )}

            {/* Sign up CTA */}
            {!isAuthenticated ? (
              <Link href="/login">
                <Button className="w-full h-12 bg-[#007AFF] hover:bg-[#0066DD] text-white font-semibold text-base rounded-xl">
                  Sign In to Register
                </Button>
              </Link>
            ) : isClosed ? (
              <Button disabled className="w-full h-12 text-base rounded-xl">
                Sign-ups Closed
              </Button>
            ) : mySignup ? (
              <Button
                variant="outline"
                className="w-full h-12 text-base rounded-xl border-navy/30 text-navy"
                onClick={() => { setEditingSignup(mySignup); setEditSheetOpen(true); }}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit My Sign-up
              </Button>
            ) : (
              <Link href={`/signup/${rowId}`}>
                <Button className="w-full h-12 bg-[#007AFF] hover:bg-[#0066DD] text-white font-semibold text-base rounded-xl">
                  Sign up
                </Button>
              </Link>
            )}
          </div>

          {/* Sign-ups list */}
          {session.signups && session.signups.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-foreground mb-2">
                Training Sign-ups
              </h2>
              <div className="divide-y divide-border rounded-xl border overflow-hidden bg-card">
                {session.signups.map((su, idx) => {
                  const isMe = isAuthenticated && su.email.toLowerCase().trim() === userEmail;
                  const canEdit = isMe && !isClosed;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        if (canEdit) { setEditingSignup(su); setEditSheetOpen(true); }
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${canEdit ? "hover:bg-muted/50 active:bg-muted" : "cursor-default"}`}
                    >
                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold ${isMe ? "bg-navy text-white" : "bg-muted text-muted-foreground"}`}>
                        {getInitials(su.name) || "?"}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">
                          {su.name}
                          {isMe && <span className="ml-1.5 text-xs text-gold font-normal">(you)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{su.activity}</p>
                      </div>
                      {canEdit && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fee table — shown below sign-ups */}
          <details className="group">
            <summary className="flex items-center gap-2 text-sm font-medium text-muted-foreground cursor-pointer list-none py-1">
              <DollarSign className="w-4 h-4" />
              Session Fees
              <ChevronRight className="w-4 h-4 ml-auto transition-transform group-open:rotate-90" />
            </summary>
            <Card className="mt-2">
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Full Training</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Swim Only</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={`border-b ${memberStatus === "member" || memberStatus === "student" ? "bg-gold/5" : ""}`}>
                      <td className="p-3 font-medium">
                        Member
                        {memberStatus === "member" && <Badge variant="outline" className="ml-2 text-xs">You</Badge>}
                      </td>
                      <td className="text-right p-3">{formatFee(session.memberFee)}</td>
                      <td className="text-right p-3">{formatFee(session.memberSwimFee)}</td>
                    </tr>
                    <tr className={`border-b ${memberStatus === "non-member" ? "bg-gold/5" : ""}`}>
                      <td className="p-3 font-medium">
                        Non-Member
                        {memberStatus === "non-member" && <Badge variant="outline" className="ml-2 text-xs">You</Badge>}
                      </td>
                      <td className="text-right p-3">{formatFee(session.nonMemberFee)}</td>
                      <td className="text-right p-3">{formatFee(session.nonMemberSwimFee)}</td>
                    </tr>
                    <tr className={memberStatus === "student" ? "bg-gold/5" : ""}>
                      <td className="p-3 font-medium">
                        Student
                        {memberStatus === "student" && <Badge variant="outline" className="ml-2 text-xs">You</Badge>}
                      </td>
                      <td className="text-right p-3">{formatFee(session.studentFee)}</td>
                      <td className="text-right p-3">{formatFee(session.studentSwimFee)}</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </details>

          {/* Admin controls */}
          {isAdminUser && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <Button
                variant="outline"
                className="w-full h-10 text-sm border-navy/30 text-navy hover:bg-navy/5"
                onClick={() => setEditSessionOpen(true)}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Admin: Edit Session
              </Button>

              {!isClosed && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full h-10 border-destructive/40 text-destructive text-sm hover:bg-destructive/10"
                      disabled={closeSessionMutation.isPending}
                    >
                      Admin: Close Sign-ups
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Close sign-ups?</AlertDialogTitle>
                      <AlertDialogDescription>
                        No new sign-ups will be accepted for {session.trainingDate} at {session.pool}. This cannot be undone here.
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
        <EditSessionSheet
          open={editSessionOpen}
          onOpenChange={setEditSessionOpen}
          session={session}
        />
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
