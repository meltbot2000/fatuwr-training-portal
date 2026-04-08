import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getMembershipOnTrainingDate, calculateFee } from "@/lib/feeUtils";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useParams, useLocation, Link } from "wouter";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

function formatFee(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function SignUpForm() {
  const { rowId } = useParams<{ rowId: string }>();
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });

  const { data: session, isLoading } = trpc.sessions.detail.useQuery(
    { rowId: rowId || "" },
    { enabled: !!rowId }
  );

  const [activity, setActivity] = useState<"Regular Training" | "Swims only">("Regular Training");
  const [numberOfPeople, setNumberOfPeople] = useState(1);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const currentStatus: string = (user as any)?.memberStatus || "Non-Member";
  const trialEndDate: string = (user as any)?.trialEndDate || "";
  const trialStartDate: string = (user as any)?.trialStartDate || "";
  const hasTrialled = trialStartDate !== "" && trialStartDate !== "NA";

  const membershipOnDate = useMemo(() => {
    if (!session) return currentStatus;
    return getMembershipOnTrainingDate(currentStatus, trialEndDate, session.trainingDate);
  }, [session, currentStatus, trialEndDate]);

  const trialExpiredWarning =
    currentStatus === "Trial" && membershipOnDate === "Non-Member";

  const debtQuery = trpc.signups.myDebt.useQuery(undefined, {
    enabled: !!user,
    retry: false,
  });
  const debt = debtQuery.data?.debt ?? 0;
  const debtBlocking = debt >= 54;
  const debtWarning = debt >= 26 && debt < 54;

  const fee = useMemo(() => {
    if (!session) return 0;
    return calculateFee(session, membershipOnDate, activity);
  }, [session, membershipOnDate, activity]);

  const totalFee = fee * numberOfPeople;

  const submitMutation = trpc.signups.submit.useMutation({
    onSuccess: (data) => {
      setSubmitted(true);
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to sign up");
    },
  });

  const handleSubmit = () => {
    if (!session || !user) return;
    submitMutation.mutate({
      sessionRowId: rowId || "",
      sessionDate: session.trainingDate,
      sessionPool: session.pool,
      name: user.name || "",
      activity,
      fee: totalFee,
      memberOnTrainingDate: membershipOnDate,
      numberOfPeople,
      notes: notes || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Sign Up" showBack backPath={`/session/${rowId}`} />
        <main className="mx-auto max-w-[480px] px-4 py-4 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-12 w-full" />
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Sign Up" showBack />
        <main className="mx-auto max-w-[480px] px-4 py-12 text-center">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-3" />
          <p className="text-destructive font-medium">Session not found</p>
        </main>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Sign Up" showBack />
        <main className="mx-auto max-w-[480px] px-4 py-12 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-navy mb-2">You're In!</h2>
          <p className="text-muted-foreground mb-2">
            See you at <span className="font-medium">{session.pool}</span> on{" "}
            <span className="font-medium">{session.trainingDate}</span>.
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Total: {formatFee(totalFee)} via PayNow
          </p>
          <Link href="/">
            <Button className="bg-navy hover:bg-navy-light text-white font-semibold">
              Back to Sessions
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  const trainingFee = calculateFee(session, membershipOnDate, "Regular Training");
  const swimFee = calculateFee(session, membershipOnDate, "Swims only");

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Sign Up" showBack backPath={`/session/${rowId}`} />

      <main className="mx-auto max-w-[480px] px-4 py-4 pb-8">
        {/* Session summary */}
        <Card className="mb-4">
          <CardContent className="p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-gold">{session.day}</p>
            <p className="text-lg font-bold text-navy">{session.trainingDate}</p>
            <p className="text-sm text-muted-foreground">{session.trainingTime} at {session.pool}</p>
          </CardContent>
        </Card>

        {/* Trial expiry warning */}
        {trialExpiredWarning && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p>
              <span className="font-semibold">Your trial membership will have expired by this training date.</span>{" "}
              You will be charged the non-member fee. Consider signing up for full membership!
            </p>
          </div>
        )}

        {/* Debt — blocking */}
        {debtBlocking && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <span className="font-semibold">Your outstanding balance is {formatFee(debt)}.</span>{" "}
              Please settle your fees before signing up.
            </p>
          </div>
        )}

        {/* Debt — warning only */}
        {debtWarning && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p>
              <span className="font-semibold">Reminder: you have an outstanding balance of {formatFee(debt)}.</span>{" "}
              Please make payment soon.
            </p>
          </div>
        )}

        {/* User info (read-only) */}
        <div className="space-y-3 mb-4">
          <div>
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={user?.name || ""} disabled className="bg-muted/50" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input value={user?.email || ""} disabled className="bg-muted/50" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Membership Status{trialExpiredWarning ? " (on training date)" : ""}
            </Label>
            <Input
              value={trialExpiredWarning ? "Non-Member (trial expired)" : membershipOnDate}
              disabled
              className="bg-muted/50"
            />
          </div>
        </div>

        <Separator className="my-4" />

        {/* Activity selection */}
        <div className="mb-4">
          <Label className="text-sm font-medium text-navy mb-2 block">Session Type</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setActivity("Regular Training")}
              className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                activity === "Regular Training"
                  ? "border-gold bg-gold/10 text-navy"
                  : "border-border bg-card text-muted-foreground hover:border-gold/50"
              }`}
            >
              Full Training
              <p className="text-xs mt-1 opacity-70">{formatFee(trainingFee)}</p>
            </button>
            <button
              onClick={() => setActivity("Swims only")}
              className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                activity === "Swims only"
                  ? "border-gold bg-gold/10 text-navy"
                  : "border-border bg-card text-muted-foreground hover:border-gold/50"
              }`}
            >
              Swim Only
              <p className="text-xs mt-1 opacity-70">{formatFee(swimFee)}</p>
            </button>
          </div>
        </div>

        {/* Number of people */}
        <div className="mb-4">
          <Label className="text-sm font-medium text-navy mb-2 block">Number of People</Label>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNumberOfPeople(Math.max(1, numberOfPeople - 1))}
              disabled={numberOfPeople <= 1}
            >
              -
            </Button>
            <span className="text-lg font-bold text-navy w-8 text-center">{numberOfPeople}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNumberOfPeople(numberOfPeople + 1)}
            >
              +
            </Button>
          </div>
        </div>

        {/* Notes */}
        <div className="mb-4">
          <Label className="text-sm font-medium text-navy mb-2 block">Notes (optional)</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any special requests or notes..."
            className="w-full p-3 rounded-lg border border-input bg-card text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <Separator className="my-4" />

        {/* Fee summary */}
        <Card className="mb-6 bg-navy text-white">
          <CardContent className="p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm opacity-80">Total Fee</p>
                <p className="text-2xl font-bold">{formatFee(totalFee)}</p>
                <p className="text-xs opacity-60 mt-0.5">{membershipOnDate} rate</p>
              </div>
              <div className="text-right text-sm opacity-80">
                <p>{activity}</p>
                <p>{numberOfPeople} {numberOfPeople === 1 ? "person" : "people"}</p>
                <p>via PayNow</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={submitMutation.isPending || debtBlocking}
          className="w-full h-12 bg-gold hover:bg-gold-dark text-navy font-semibold text-base"
        >
          {submitMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            "Confirm Sign Up"
          )}
        </Button>
      </main>
    </div>
  );
}
