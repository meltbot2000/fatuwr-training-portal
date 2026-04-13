import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

function FeeScheduleCard() {
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-sm font-bold text-navy mb-3">Fee Schedule</h3>
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-3 text-xs font-medium text-muted-foreground mb-1">
            <span>Membership</span>
            <span className="text-right">Full Training</span>
            <span className="text-right">Swim Only</span>
          </div>
          <Separator />
          {[
            { label: "Annual Member", full: "$13", swim: "$7" },
            { label: "Student", full: "$13", swim: "$7" },
            { label: "Trial Member", full: "$13", swim: "$7" },
            { label: "Non-Member", full: "$20", swim: "$10" },
          ].map(({ label, full, swim }) => (
            <div key={label} className="grid grid-cols-3 py-1">
              <span className="text-navy font-medium">{label}</span>
              <span className="text-right tabular-nums">{full}</span>
              <span className="text-right tabular-nums">{swim}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Fees may vary by session. Check session details for exact pricing.
        </p>
      </CardContent>
    </Card>
  );
}

const CLUB_UEN = "T14SS0144D";

function parseDDMMYYYY(str: string): Date | null {
  if (!str || str === "NA") return null;
  const [d, m, y] = str.split("/").map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function formatDisplayDate(str: string): string {
  const d = parseDDMMYYYY(str);
  if (!d) return str;
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });
}

function PaymentInstructionsCard({ paymentId }: { paymentId: string }) {
  return (
    <Card className="border-navy/20">
      <CardContent className="p-4 text-sm text-navy/80 space-y-2">
        <p className="font-semibold text-navy">How to become a Member</p>
        <ol className="list-decimal list-inside space-y-1.5 text-sm">
          <li>
            Transfer the annual fee via PayNow to UEN{" "}
            <span className="font-mono font-semibold">{CLUB_UEN}</span>.
          </li>
          <li>
            Use your Payment ID{" "}
            <span className="font-mono font-semibold">{paymentId || "—"}</span>{" "}
            as the <span className="font-semibold">only text</span> in the transfer notes/reference field.
          </li>
          <li>Send your receipt to the club admin.</li>
        </ol>
        <p className="text-xs text-muted-foreground pt-1">
          Your membership will be activated within 24 hours of receipt confirmation.
        </p>
      </CardContent>
    </Card>
  );
}

export default function Membership() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const utils = trpc.useUtils();
  const [trialSuccess, setTrialSuccess] = useState(false);

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

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <AppHeader title="Membership" />
      </div>
    );
  }

  const memberStatus: string = (user as any)?.memberStatus || "Non-Member";
  const trialStartDate: string = (user as any)?.trialStartDate || "";
  const trialEndDate: string = (user as any)?.trialEndDate || "";
  const paymentId: string = (user as any)?.paymentId || "";

  const hasTrialled = trialStartDate !== "" && trialStartDate !== "NA";

  const trialEndParsed = parseDDMMYYYY(trialEndDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const trialActive = trialEndParsed !== null && trialEndParsed >= today;

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader title="Membership" />

      <main className="mx-auto max-w-[480px] px-4 py-4 space-y-4">

        {/* ── MEMBER ───────────────────────────────────────────── */}
        {memberStatus === "Member" && (
          <>
            <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <div>
                <p className="font-semibold text-green-800">You're an Annual Member.</p>
                <p className="text-xs text-green-700 mt-0.5">Enjoy member rates at all training sessions.</p>
              </div>
              <Badge className="ml-auto bg-green-500 text-white hover:bg-green-500">Member</Badge>
            </div>
          </>
        )}

        {/* ── STUDENT ──────────────────────────────────────────── */}
        {memberStatus === "Student" && (
          <div className="flex items-center gap-3 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" />
            <div>
              <p className="font-semibold text-blue-800">You have Student membership.</p>
              <p className="text-xs text-blue-700 mt-0.5">Granted by Admin. Contact admin for changes.</p>
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
                <p className="font-semibold text-navy">You're on a free trial.</p>
                <p className="text-xs text-navy/70 mt-0.5">
                  Valid until <span className="font-medium">{formatDisplayDate(trialEndDate)}</span>.
                </p>
              </div>
              <Badge className="ml-auto bg-gold text-navy hover:bg-gold">Trial</Badge>
            </div>

            <div>
              <p className="text-sm font-medium text-navy mb-2">Upgrade to Annual Member</p>
              <PaymentInstructionsCard paymentId={paymentId} />
            </div>
          </>
        )}

        {/* ── TRIAL (expired or missing end date) ──────────────── */}
        {memberStatus === "Trial" && (trialEndParsed === null || !trialActive) && (
          <>
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p>
                {trialEndParsed !== null
                  ? <>Your trial expired on <span className="font-semibold">{formatDisplayDate(trialEndDate)}</span>.</>
                  : "Your trial period has ended."}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-navy mb-2">Become an Annual Member</p>
              <PaymentInstructionsCard paymentId={paymentId} />
            </div>
          </>
        )}

        {/* ── NON-MEMBER ───────────────────────────────────────── */}
        {memberStatus === "Non-Member" && (
          <>
            <p className="text-sm text-muted-foreground">
              {hasTrialled
                ? "Your trial has ended. Sign up for annual membership to continue training."
                : "You're currently a Non-Member."}
            </p>

            {/* Trial card — only shown if never trialled */}
            {!hasTrialled && (
              <Card className="border-gold/40 bg-gold/5">
                <CardContent className="p-4">
                  <p className="font-semibold text-navy mb-0.5">30-Day Free Trial</p>
                  <p className="text-sm text-navy/70 mb-3">
                    Try training with us — no payment required for 30 days.
                  </p>
                  {trialSuccess ? (
                    <div className="flex items-center gap-2 text-green-700 text-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      Trial activated! You have 30 days of member-rate training.
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
                        "Sign up for Trial"
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Member card */}
            <div>
              <p className="text-sm font-medium text-navy mb-2">Become an Annual Member</p>
              <PaymentInstructionsCard paymentId={paymentId} />
            </div>
          </>
        )}

        {/* Fee schedule — always visible */}
        <FeeScheduleCard />

      </main>
    </div>
  );
}
