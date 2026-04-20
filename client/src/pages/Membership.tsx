import { useState } from "react";
import { useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { parseAnyDate, formatDisplayDate } from "@/lib/dateUtils";

// ── Annual membership fee (full year) ────────────────────────────────────────
const ANNUAL_FEE = 80;

const PRORATED_SCHEDULE = (function () {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return months.map(function (month, i) {
    return { month, fee: Math.round((ANNUAL_FEE * (12 - i)) / 12) };
  });
})();

function getCurrentMonthEntry() {
  return PRORATED_SCHEDULE[new Date().getMonth()];
}

const CLUB_UEN = "T14SS0144D";


// ── Annual membership fee schedule ───────────────────────────────────────────

function MembershipFeeCard() {
  const currentMonth = getCurrentMonthEntry().month;
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-sm font-bold text-foreground mb-1">Annual membership fee</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Fees are pro-rated based on the month you join, valid until end of the calendar year.
        </p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {PRORATED_SCHEDULE.map(({ month, fee }) => {
            const isCurrent = month === currentMonth;
            return (
              <div key={month} className={`flex justify-between ${isCurrent ? "font-semibold" : ""}`}>
                <span className={isCurrent ? "text-[#2196F3]" : "text-white"}>{month}</span>
                <span className={`tabular-nums ${isCurrent ? "text-gold" : ""}`}>${fee}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Benefits info note ───────────────────────────────────────────────────────

function BenefitsNote() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-foreground/70">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-foreground/40" />
      <p>
        Membership gives you discounted training fees — typically around{" "}
        <span className="font-medium">$4 less per session</span> depending on pool and activity.
        Student membership is available at <span className="font-medium">half the annual fee</span> and
        offers additional discounts on each training session.
      </p>
    </div>
  );
}

// ── Student membership note ──────────────────────────────────────────────────

function StudentMembershipNote() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-blue-400/20 bg-blue-400/10 px-3 py-3 text-sm text-blue-300/90">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
      <div className="space-y-1">
        <p className="font-medium">Interested in Student Membership?</p>
        <p className="text-blue-300/80">
          Please sign up for regular annual membership first, then approach the committee
          to have your student ID verified. The committee will amend the cost of membership
          and update your membership status once your student ID has been verified.
        </p>
      </div>
    </div>
  );
}

// ── Annual membership sign-up block with confirm dialog ──────────────────────

interface MembershipSignupBlockProps {
  paymentId: string;
  onConfirm: () => void;
  isPending: boolean;
  succeeded: boolean;
  /** Optional heading override, e.g. "Upgrade to Annual Member" */
  heading?: string;
}

function MembershipSignupBlock({ paymentId, onConfirm, isPending, succeeded, heading }: MembershipSignupBlockProps) {
  const { month, fee } = getCurrentMonthEntry();

  if (succeeded) {
    return (
      <div className="flex items-center gap-2 text-green-300 text-sm rounded-lg border border-green-400/20 bg-green-400/10 px-3 py-2.5">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        Membership activated! Welcome as an Annual Member.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-blue-300">{heading ?? "Annual Membership"}</p>
        <span className="text-sm font-semibold text-blue-300 tabular-nums">${fee} <span className="text-xs font-normal text-muted-foreground">joining {month}</span></span>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            disabled={isPending}
            className="w-full bg-navy hover:bg-navy/90 text-white font-semibold"
          >
            {isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Activating...</>
            ) : (
              "Sign up for annual membership"
            )}
          </Button>
        </AlertDialogTrigger>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annual Membership — ${fee}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-foreground">
                <p>
                  Click <strong>Confirm sign up</strong> to register for annual membership
                  (joining <strong>{month}</strong>), valid until end of the calendar year.
                </p>
                <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
                  <p className="font-medium text-navy text-xs uppercase tracking-wide">
                    Payment — if you haven't already
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-sm text-foreground/70">
                    <li>
                      Transfer <strong>${fee}</strong> via PayNow to UEN{" "}
                      <span className="font-mono font-semibold">{CLUB_UEN}</span>.
                    </li>
                    <li>
                      Use your Payment ID{" "}
                      <span className="font-mono font-semibold">{paymentId || "—"}</span>{" "}
                      as the <strong>only text</strong> in the reference field.
                    </li>
                  </ol>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-navy text-white hover:bg-navy/90"
              onClick={onConfirm}
            >
              Confirm sign up
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Membership() {
  const search = useSearch();
  const backPath = new URLSearchParams(search).get("back") || "/";
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const utils = trpc.useUtils();
  const [trialSuccess, setTrialSuccess] = useState(false);
  const [memberSuccess, setMemberSuccess] = useState(false);

  const trialMutation = trpc.membership.signupTrial.useMutation({
    onSuccess: async () => {
      setTrialSuccess(true);
      toast.success("Trial activated!");
      await utils.auth.me.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to activate trial.");
    },
  });

  const memberMutation = trpc.membership.signupMember.useMutation({
    onSuccess: async () => {
      setMemberSuccess(true);
      toast.success("Membership activated!");
      await utils.auth.me.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to activate membership.");
    },
  });

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background pb-32">
        <AppHeader title="Membership" showBack backPath={backPath} />
      </div>
    );
  }

  const memberStatus: string = (user as any)?.memberStatus || "Non-Member";
  const trialStartDate: string = (user as any)?.trialStartDate || "";
  const trialEndDate: string = (user as any)?.trialEndDate || "";
  const paymentId: string = (user as any)?.paymentId || "";

  const hasTrialled = trialStartDate !== "" && trialStartDate !== "NA";
  const trialEndParsed = parseAnyDate(trialEndDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const trialActive = trialEndParsed !== null && trialEndParsed >= today;

  return (
    <div className="min-h-screen bg-background pb-32">
      <AppHeader title="Membership" showBack backPath="/" />

      <main className="mx-auto max-w-[480px] px-4 py-4 space-y-4">

        {/* ── MEMBER ───────────────────────────────────────────── */}
        {memberStatus === "Member" && (
          <>
            <div className="flex items-center gap-3 rounded-lg bg-green-400/10 border border-green-400/20 px-4 py-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <div>
                <p className="font-semibold text-green-300">You're an Annual Member.</p>
                <p className="text-xs text-green-300/80 mt-0.5">Enjoy member rates at all training sessions.</p>
              </div>
              <Badge className="ml-auto bg-green-500 text-white hover:bg-green-500">Member</Badge>
            </div>
            <StudentMembershipNote />
          </>
        )}

        {/* ── STUDENT ──────────────────────────────────────────── */}
        {memberStatus === "Student" && (
          <div className="flex items-center gap-3 rounded-lg bg-blue-400/10 border border-blue-400/20 px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" />
            <div>
              <p className="font-semibold text-blue-300">You have Student membership.</p>
              <p className="text-xs text-blue-300/80 mt-0.5">Granted by Admin. Contact admin for changes.</p>
            </div>
            <Badge className="ml-auto bg-blue-500 text-white hover:bg-blue-500">Student</Badge>
          </div>
        )}

        {/* ── TRIAL (active) ───────────────────────────────────── */}
        {memberStatus === "Trial" && trialEndParsed !== null && trialActive && (
          <>
            <div className="flex items-center gap-3 rounded-lg bg-gold/10 border border-gold/30 px-4 py-3">
              <CheckCircle2 className="w-5 h-5 text-gold shrink-0" />
              <div>
                <p className="font-semibold text-navy">You're on a 3-month trial.</p>
                <p className="text-xs text-foreground/70 mt-0.5">
                  Valid until <span className="font-medium">{formatDisplayDate(trialEndDate)}</span>.
                </p>
              </div>
              <Badge className="ml-auto bg-gold text-navy hover:bg-gold">Trial</Badge>
            </div>

            <MembershipSignupBlock
              paymentId={paymentId}
              onConfirm={() => memberMutation.mutate()}
              isPending={memberMutation.isPending}
              succeeded={memberSuccess}
              heading="Upgrade to Annual Member"
            />
            <StudentMembershipNote />
          </>
        )}

        {/* ── TRIAL (expired or missing end date) ──────────────── */}
        {memberStatus === "Trial" && (trialEndParsed === null || !trialActive) && (
          <>
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-300/90">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p>
                {trialEndParsed !== null
                  ? <>Your trial expired on <span className="font-semibold">{formatDisplayDate(trialEndDate)}</span>.</>
                  : "Your trial period has ended."}
              </p>
            </div>

            <MembershipSignupBlock
              paymentId={paymentId}
              onConfirm={() => memberMutation.mutate()}
              isPending={memberMutation.isPending}
              succeeded={memberSuccess}
              heading="Become an Annual Member"
            />
            <StudentMembershipNote />
          </>
        )}

        {/* ── NON-MEMBER ───────────────────────────────────────── */}
        {memberStatus === "Non-Member" && (
          <>
            <BenefitsNote />

            {/* Trial card — only shown if never trialled */}
            {!hasTrialled && (
              <Card className="border-gold/40 bg-gold/5">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <p className="font-semibold text-blue-300">3-Month Trial — $10</p>
                    <Badge className="bg-gold text-navy hover:bg-gold shrink-0">Trial</Badge>
                  </div>
                  <p className="text-sm text-foreground/70 mb-3">
                    Try training with us at member rates for 3 months. Transfer $10 to UEN{" "}
                    <span className="font-mono font-semibold">{CLUB_UEN}</span> with your Payment ID{" "}
                    <span className="font-mono font-semibold">{paymentId || "—"}</span> as the reference.
                  </p>
                  {trialSuccess ? (
                    <div className="flex items-center gap-2 text-green-300/80 text-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      Trial activated! You have 3 months of member-rate training.
                    </div>
                  ) : (
                    <Button
                      onClick={() => trialMutation.mutate()}
                      disabled={trialMutation.isPending}
                      className="w-full bg-gold hover:bg-gold-dark text-navy font-semibold"
                    >
                      {trialMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Activating...</>
                      ) : (
                        "Sign up for trial"
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {hasTrialled && (
              <p className="text-sm text-muted-foreground">
                Your trial has ended. Sign up for annual membership to continue at member rates.
              </p>
            )}

            <MembershipSignupBlock
              paymentId={paymentId}
              onConfirm={() => memberMutation.mutate()}
              isPending={memberMutation.isPending}
              succeeded={memberSuccess}
              heading="Annual Membership"
            />

            <StudentMembershipNote />
          </>
        )}

        {/* Fee schedule — always visible */}
        <MembershipFeeCard />

      </main>
    </div>
  );
}
