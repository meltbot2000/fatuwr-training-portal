import { Fragment, useState } from "react";
import { useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
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
import { CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { parseAnyDate, formatDisplayDate } from "@/lib/dateUtils";

// ── Constants ─────────────────────────────────────────────────────────────────
const ANNUAL_FEE = 80;
const CLUB_UEN = "T14SS0144D";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const PRORATED_SCHEDULE = MONTHS.map((month, i) => ({
  month,
  fee: Math.round((ANNUAL_FEE * (12 - i)) / 12),
}));

// ── Pro-rated schedule dropdown ───────────────────────────────────────────────

function ProRatedSchedule() {
  const [expanded, setExpanded] = useState(false);
  const monthIdx = new Date().getMonth();
  const current = PRORATED_SCHEDULE[monthIdx];

  return (
    <div
      className="mx-[-16px]"
      style={{
        background: "rgba(255,255,255,0.025)",
        borderTop: "1px solid #2C2C2C",
        borderBottom: "1px solid #2C2C2C",
      }}
    >
      {/* Toggle row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <span className="text-[15px] font-medium text-white">Pro-rated schedule</span>
        <span className="flex items-center gap-1.5">
          <span className="text-[13px] text-white">{expanded ? "Hide" : "View all 12 months"}</span>
          <ChevronDown
            className="w-4 h-4 text-white transition-transform duration-200"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </span>
      </button>

      <div className="px-4 pb-3">
        {expanded ? (
          // 4-col grid: month · price · month · price (6 rows)
          <div
            className="grid gap-y-1.5"
            style={{ gridTemplateColumns: "1fr auto 1fr auto", columnGap: "12px" }}
          >
            {PRORATED_SCHEDULE.map(({ month, fee }, i) => {
              const isCurrent = i === monthIdx;
              return (
                <Fragment key={month}>
                  <span
                    className={`text-[14px] ${isCurrent ? "font-medium text-[#2196F3]" : "text-white"}`}
                  >
                    {month}
                  </span>
                  <span
                    className={`text-[14px] tabular-nums ${isCurrent ? "font-medium text-[#2196F3]" : "text-white"}`}
                  >
                    ${fee}
                  </span>
                </Fragment>
              );
            })}
          </div>
        ) : (
          // Collapsed: current month only
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium text-[#2196F3]">{current.month}</span>
            <span className="text-[14px] font-medium text-[#2196F3] tabular-nums">${current.fee}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Annual membership card ────────────────────────────────────────────────────

interface AnnualCardProps {
  paymentId: string;
  onConfirm: () => void;
  isPending: boolean;
  succeeded: boolean;
  /** When true, CTA shows "Already a member" and is disabled */
  disabled?: boolean;
}

function AnnualCard({ paymentId, onConfirm, isPending, succeeded, disabled }: AnnualCardProps) {
  const monthIdx = new Date().getMonth();
  const { month, fee } = PRORATED_SCHEDULE[monthIdx];
  const halfFee = Math.round(fee / 2);

  return (
    <div className="bg-[#1E1E1E] rounded-2xl overflow-hidden px-4 pt-4 pb-4">
      {/* Header row */}
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-medium text-[#2196F3]">Annual Membership</p>
      </div>

      {/* Sub-copy */}
      <p className="text-[13px] text-white mt-2">
        Pro-rated to the month you join. Valid until end of the calendar year.
      </p>

      {/* Pro-rated schedule dropdown */}
      <div className="mt-3">
        <ProRatedSchedule />
      </div>

      {/* Student note — full-bleed strip */}
      <div
        className="mx-[-16px] px-4 py-3"
        style={{ background: "rgba(33,150,243,0.07)" }}
      >
        <p className="text-[15px] font-medium text-[#2196F3]">Student? Pay half — ${halfFee}</p>
        <p className="text-[13px] text-white mt-1">
          Sign up at the regular rate first, then show the committee your student ID. We'll refund the difference and switch your status to Student.
        </p>
      </div>

      {/* CTA */}
      <div className="mt-3">
        {succeeded ? (
          <div className="flex items-center gap-2 text-[13px] text-[#4CAF50]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Membership activated! Welcome as an Annual Member.
          </div>
        ) : disabled ? (
          <button
            disabled
            className="w-full h-[48px] rounded-full font-medium text-[15px] text-white/40"
            style={{ background: "rgba(33,150,243,0.2)" }}
          >
            Already a member
          </button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                disabled={isPending}
                className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[15px] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {isPending ? "Activating…" : "Sign up for annual membership"}
              </button>
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
                      <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                        Payment — if you haven't already
                      </p>
                      <ol className="list-decimal list-inside space-y-1.5 text-foreground/70">
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
                <AlertDialogAction onClick={onConfirm}>
                  Confirm sign up
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

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
      <div className="min-h-screen bg-[#111111] pb-32">
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
    <div className="min-h-screen bg-[#111111] pb-32">
      <AppHeader title="Membership" showBack backPath={backPath} />

      <main className="mx-auto max-w-[480px] px-4 py-4 space-y-3">

        {/* ── MEMBER ───────────────────────────────────────────── */}
        {memberStatus === "Member" && (
          <>
            <div className="bg-[#1E1E1E] rounded-2xl px-4 py-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#4CAF50] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-white">You're an Annual Member</p>
                <p className="text-[13px] text-[#888888] mt-0.5">Enjoy member rates at all training sessions.</p>
              </div>
              <span className="shrink-0 text-[11px] font-medium text-[#4CAF50] bg-[#4CAF50]/15 rounded-full px-2.5 py-1">
                Member
              </span>
            </div>
            <AnnualCard
              paymentId={paymentId}
              onConfirm={() => memberMutation.mutate()}
              isPending={memberMutation.isPending}
              succeeded={memberSuccess}
              disabled
            />
          </>
        )}

        {/* ── STUDENT ──────────────────────────────────────────── */}
        {memberStatus === "Student" && (
          <div className="bg-[#1E1E1E] rounded-2xl px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#2196F3] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium text-white">You have Student membership</p>
              <p className="text-[13px] text-[#888888] mt-0.5">Granted by Admin. Contact admin for changes.</p>
            </div>
            <span className="shrink-0 text-[11px] font-medium text-[#2196F3] bg-[#2196F3]/15 rounded-full px-2.5 py-1">
              Student
            </span>
          </div>
        )}

        {/* ── TRIAL (active) ───────────────────────────────────── */}
        {memberStatus === "Trial" && trialActive && (
          <>
            <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: "rgba(245,197,24,0.1)" }}>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[#F5C518]">
                  Trial active until{" "}
                  <span className="font-medium">{formatDisplayDate(trialEndDate)}</span>
                </p>
              </div>
              <span className="shrink-0 text-[11px] font-medium text-[#F5C518] bg-[#F5C518]/15 rounded-full px-2.5 py-1">
                Trial
              </span>
            </div>
            <AnnualCard
              paymentId={paymentId}
              onConfirm={() => memberMutation.mutate()}
              isPending={memberMutation.isPending}
              succeeded={memberSuccess}
            />
          </>
        )}

        {/* ── TRIAL (expired / no end date) ────────────────────── */}
        {memberStatus === "Trial" && !trialActive && (
          <>
            <div className="px-4">
              <p className="text-[13px] text-[#888888]">
                Your trial has ended. Sign up for annual membership below to keep training at member rates.
              </p>
            </div>
            <AnnualCard
              paymentId={paymentId}
              onConfirm={() => memberMutation.mutate()}
              isPending={memberMutation.isPending}
              succeeded={memberSuccess}
            />
          </>
        )}

        {/* ── NON-MEMBER ───────────────────────────────────────── */}
        {memberStatus === "Non-Member" && (
          <>
            {/* Value line */}
            <div className="px-4">
              <p className="text-[16px] text-white">Become a member and save $2–$4 on every training session.</p>
            </div>

            {/* Trial card — only if never trialled */}
            {!hasTrialled && (
              <div className="bg-[#1E1E1E] rounded-2xl px-4 pt-4 pb-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-[15px] font-medium text-[#F5C518]">Trial Membership</p>
                  <p className="text-[15px] font-medium text-[#F5C518] tabular-nums">$10</p>
                </div>
                <p className="text-[13px] text-white mt-2">
                  Try training with us at member rates for 3 months.
                </p>
                <div className="mt-3">
                  {trialSuccess ? (
                    <div className="flex items-center gap-2 text-[13px] text-[#4CAF50]">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Trial activated! You have 3 months of member-rate training.
                    </div>
                  ) : (
                    <button
                      onClick={() => trialMutation.mutate()}
                      disabled={trialMutation.isPending}
                      className="w-full h-[48px] rounded-full bg-[#F5C518] text-[#111111] font-medium text-[15px] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {trialMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      {trialMutation.isPending ? "Activating…" : "Sign up for 3 month trial"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Already trialled note */}
            {hasTrialled && (
              <div className="px-4">
                <p className="text-[13px] text-[#888888]">
                  Your trial has ended. Sign up for annual membership below to keep training at member rates.
                </p>
              </div>
            )}

            {/* Annual card */}
            <AnnualCard
              paymentId={paymentId}
              onConfirm={() => memberMutation.mutate()}
              isPending={memberMutation.isPending}
              succeeded={memberSuccess}
            />
          </>
        )}

      </main>
    </div>
  );
}
