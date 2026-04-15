import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getMembershipOnTrainingDate, calculateFee } from "@/lib/feeUtils";
import AppHeader from "@/components/AppHeader";
import { useParams, useLocation } from "wouter";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

function formatFee(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

type Activity = "Regular Training" | "Swims only" | "First Timer" | "Trainer";

export default function SignUpForm() {
  const { rowId } = useParams<{ rowId: string }>();
  const { user } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });

  const { data: session, isLoading } = trpc.sessions.detail.useQuery(
    { rowId: rowId || "" },
    { enabled: !!rowId }
  );

  const [activity, setActivity] = useState<Activity>("Regular Training");
  const [submitted, setSubmitted] = useState(false);
  const [, navigate] = useLocation();

  const currentStatus: string = (user as any)?.memberStatus || "Non-Member";
  const trialEndDate: string = (user as any)?.trialEndDate || "";

  const membershipOnDate = useMemo(() => {
    if (!session) return currentStatus;
    return getMembershipOnTrainingDate(currentStatus, trialEndDate, session.trainingDate);
  }, [session, currentStatus, trialEndDate]);

  const trialExpiredWarning = currentStatus === "Trial" && membershipOnDate === "Non-Member";

  const debtQuery = trpc.signups.myDebt.useQuery(undefined, { enabled: !!user, retry: false });
  const debt = debtQuery.data?.debt ?? 0;
  const debtBlocking = debt >= 54;
  const debtWarning = debt >= 26 && debt < 54;

  const isFreeActivity = activity === "First Timer" || activity === "Trainer";

  const fee = useMemo(() => {
    if (!session || isFreeActivity) return 0;
    return calculateFee(session, membershipOnDate, activity);
  }, [session, membershipOnDate, activity, isFreeActivity]);

  useEffect(() => {
    if (submitted) {
      const t = setTimeout(() => navigate(`/session/${rowId}`), 1800);
      return () => clearTimeout(t);
    }
  }, [submitted, rowId, navigate]);

  const submitMutation = trpc.signups.submit.useMutation({
    onSuccess: (data) => { setSubmitted(true); toast.success(data.message); },
    onError: (error) => { toast.error(error.message || "Failed to sign up"); },
  });

  const handleSubmit = () => {
    if (!session || !user) return;
    submitMutation.mutate({
      sessionRowId: rowId || "",
      sessionDate: session.trainingDate,
      sessionPool: session.pool,
      name: user.name || "",
      activity,
      fee,
      memberOnTrainingDate: membershipOnDate,
      numberOfPeople: 1,
    });
  };

  // ── Loading ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#111111]">
        <AppHeader title="Sign Up" showBack backPath={`/session/${rowId}`} />
        <main className="mx-auto max-w-[480px] px-4 py-6 space-y-3">
          {[80, 160, 120, 48].map((h, i) => (
            <div key={i} className={`h-[${h}px] rounded-xl bg-[#1c1c1c] animate-pulse`} style={{ height: h }} />
          ))}
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#111111]">
        <AppHeader title="Sign Up" showBack />
        <main className="mx-auto max-w-[480px] px-4 py-16 text-center">
          <AlertTriangle className="w-10 h-10 text-white/30 mx-auto mb-3" />
          <p className="text-white/50">Session not found</p>
        </main>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#111111]">
        <AppHeader title="Sign Up" showBack />
        <main className="mx-auto max-w-[480px] px-4 py-16 text-center">
          <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto mb-4" />
          <p className="text-[22px] font-bold text-white mb-1">You're in!</p>
          <p className="text-[15px] text-white/50 mb-1">
            {session.pool} · {session.trainingDate}
          </p>
          {fee > 0 && (
            <p className="text-[15px] text-white/50">{formatFee(fee)} to pay</p>
          )}
        </main>
      </div>
    );
  }

  // ── Activity options ─────────────────────────────────────────
  const trainingFee = calculateFee(session, membershipOnDate, "Regular Training");
  const swimFee    = calculateFee(session, membershipOnDate, "Swims only");

  const ACTIVITY_OPTIONS: { value: Activity; label: string; fee: string }[] = [
    { value: "Regular Training", label: "Full Training",  fee: formatFee(trainingFee) },
    { value: "Swims only",       label: "Swim Only",      fee: formatFee(swimFee) },
    { value: "First Timer",      label: "First Timer",    fee: "$0.00" },
    { value: "Trainer",          label: "Trainer",        fee: "$0.00" },
  ];

  return (
    <div className="min-h-screen bg-[#111111]">
      <AppHeader title="Sign Up" showBack backPath={`/session/${rowId}`} />

      <main className="mx-auto max-w-[480px] px-4 py-4 pb-10 space-y-3">

        {/* Session summary */}
        <div className="bg-[#1c1c1c] rounded-xl px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4DA6FF] mb-0.5">
            {session.day}
          </p>
          <p className="text-[20px] font-bold text-white leading-tight">{session.trainingDate}</p>
          <p className="text-[13px] text-white/50 mt-0.5">{session.trainingTime} · {session.pool}</p>
        </div>

        {/* Warnings */}
        {trialExpiredWarning && (
          <div className="flex items-start gap-2.5 bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[13px] text-amber-300/90 leading-snug">
              Your trial will have expired by this date — you'll be charged the non-member rate.
            </p>
          </div>
        )}
        {debtBlocking && (
          <div className="flex items-start gap-2.5 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-[13px] text-red-300/90 leading-snug">
              Outstanding balance of {formatFee(debt)} — please settle before signing up.
            </p>
          </div>
        )}
        {debtWarning && (
          <div className="flex items-start gap-2.5 bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[13px] text-amber-300/90 leading-snug">
              Reminder: outstanding balance of {formatFee(debt)}. Please pay soon.
            </p>
          </div>
        )}

        {/* User info */}
        <div className="bg-[#1c1c1c] rounded-xl divide-y divide-white/6">
          {[
            { label: "Name",   value: user?.name  || "—" },
            { label: "Email",  value: user?.email || "—" },
            { label: "Status", value: trialExpiredWarning ? "Non-Member (trial expired)" : membershipOnDate },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="text-[13px] text-white/40">{label}</span>
              <span className="text-[13px] text-white/80">{value}</span>
            </div>
          ))}
        </div>

        {/* Session type */}
        <div className="bg-[#1c1c1c] rounded-xl px-4 pt-3.5 pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 mb-3">
            Session Type
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ACTIVITY_OPTIONS.map(({ value, label, fee: optFee }) => (
              <button
                key={value}
                onClick={() => setActivity(value)}
                className={`rounded-xl px-3 py-3 text-left transition-all ${
                  activity === value
                    ? "bg-white text-[#111111]"
                    : "bg-[#2a2a2a] text-white/70 hover:bg-[#333]"
                }`}
              >
                <p className="text-[14px] font-semibold leading-tight">{label}</p>
                <p className={`text-[12px] mt-0.5 ${activity === value ? "text-black/50" : "text-white/35"}`}>
                  {optFee}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Fee summary */}
        <div className="bg-[#1c1c1c] rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 mb-0.5">Total</p>
            <p className="text-[16px] font-normal text-white leading-tight">{formatFee(fee)}</p>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
            {isFreeActivity ? "Complimentary" : `${membershipOnDate} rate`}
          </p>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitMutation.isPending || debtBlocking}
          className="w-full h-11 rounded-xl bg-[#4DA6FF] text-white font-semibold text-[14px] disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity"
        >
          {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitMutation.isPending ? "Submitting…" : "Confirm Sign Up"}
        </button>

      </main>
    </div>
  );
}
