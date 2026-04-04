import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import EditSignupSheet from "@/components/EditSignupSheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Link, useParams } from "wouter";
import { Clock, MapPin, Users, DollarSign, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

function formatFee(amount: number): string {
  return `$${amount.toFixed(2)}`;
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
            <Skeleton className="h-4 w-2/3" />
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

        <div className="px-4 py-4">
          {/* Date and status */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-wider text-gold">{session.day}</p>
            {isClosed && <Badge variant="destructive">Closed</Badge>}
          </div>

          <h1 className="text-2xl font-bold text-navy">{session.trainingDate}</h1>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {session.trainingTime}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              {session.pool}
            </span>
            {session.signups && session.signups.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {session.signups.length} signed up
              </span>
            )}
          </div>

          {/* Training objective */}
          {session.trainingObjective && (
            <Card className="mt-4">
              <CardContent className="p-3">
                <p className="text-sm font-medium text-navy mb-1">Training Objective</p>
                <p className="text-sm text-muted-foreground">{session.trainingObjective}</p>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {session.notes && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {session.notes}
            </div>
          )}

          <Separator className="my-4" />

          {/* Fee table */}
          <h2 className="text-base font-bold text-navy mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Session Fees
          </h2>

          <Card>
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
                  <tr className={`border-b ${memberStatus === "member" ? "bg-gold/5" : ""}`}>
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

          {/* Participants */}
          {session.signups && session.signups.length > 0 && (
            <>
              <Separator className="my-4" />
              <h2 className="text-base font-bold text-navy mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Signed Up ({session.signups.length})
              </h2>
              <Card>
                <CardContent className="p-3">
                  <div className="space-y-2">
                    {session.signups.map((su, idx) => {
                      const isMe = isAuthenticated && su.email.toLowerCase().trim() === userEmail;
                      const canEdit = isMe && !isClosed;
                      return (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className={`font-medium ${isMe ? "text-navy" : ""}`}>
                            {su.name}
                            {isMe && <span className="ml-1.5 text-xs text-gold font-normal">(you)</span>}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-xs">{su.activity}</span>
                            {canEdit && (
                              <button
                                onClick={() => {
                                  setEditingSignup(su);
                                  setEditSheetOpen(true);
                                }}
                                className="text-xs text-navy underline hover:text-navy/70 transition-colors"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* CTA */}
          <div className="mt-6 space-y-2">
            {!isAuthenticated ? (
              <Link href="/login">
                <Button className="w-full h-12 bg-gold hover:bg-gold-dark text-navy font-semibold text-base">
                  Sign In to Register
                </Button>
              </Link>
            ) : isClosed ? (
              <Button disabled className="w-full h-12 text-base">
                Sign-ups Closed
              </Button>
            ) : (
              <Link href={`/signup/${rowId}`}>
                <Button className="w-full h-12 bg-gold hover:bg-gold-dark text-navy font-semibold text-base">
                  Sign Up for This Session
                </Button>
              </Link>
            )}
            {isAuthenticated && (
              <Link href={`/session/${rowId}/splits`}>
                <Button variant="outline" className="w-full h-10 border-navy/20 text-navy text-sm">
                  View Splits
                </Button>
              </Link>
            )}

            {/* Splits courtesy notice — shown for all open sessions */}
            {!isClosed && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <p>
                  If the splits have already been sent, please inform the splits team if you're
                  signing up or dropping out so they can adjust the split.
                </p>
              </div>
            )}

            {isAdminUser && !isClosed && (
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
        </div>
      </main>

      {/* Edit sheet */}
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
