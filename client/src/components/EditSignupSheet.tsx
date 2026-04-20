import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { calculateFee, type FeeSession } from "@/lib/feeUtils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const ACTIVITIES = ["Regular Training", "Swims only", "Trainer", "First-timer"] as const;
type Activity = (typeof ACTIVITIES)[number];

function formatFee(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionRowId: string;
  sessionDate: string;
  sessionPool: string;
  session: FeeSession;
  signup: {
    name: string;
    email: string;
    activity: string;
    memberOnTrainingDate: string;
    paymentId: string;
    actualFees: number;
  };
  onDone: () => void;
};

export default function EditSignupSheet({
  open,
  onOpenChange,
  sessionRowId,
  sessionDate,
  sessionPool,
  session,
  signup,
  onDone,
}: Props) {
  const { user } = useAuth();
  const isAdmin = (user as any)?.clubRole === "Admin";
  const [, navigate] = useLocation();

  const debtQuery = trpc.signups.myDebt.useQuery(undefined, { enabled: !isAdmin });
  const currentDebt = debtQuery.data?.debt ?? 0;

  const [activity, setActivity] = useState<Activity>(
    (ACTIVITIES.includes(signup.activity as Activity) ? signup.activity : "Regular Training") as Activity
  );
  const [name, setName] = useState(signup.name);
  const [memberStatus, setMemberStatus] = useState(signup.memberOnTrainingDate || "Non-Member");
  const [paymentId, setPaymentId] = useState(signup.paymentId || "");
  const [actualFee, setActualFee] = useState(signup.actualFees?.toString() ?? "");

  // Reset all fields when the sheet opens or the signup changes (different user)
  useEffect(() => {
    if (!open) return;
    setActivity((ACTIVITIES.includes(signup.activity as Activity) ? signup.activity : "Regular Training") as Activity);
    setName(signup.name);
    setMemberStatus(signup.memberOnTrainingDate || "Non-Member");
    setPaymentId(signup.paymentId || "");
    setActualFee(signup.actualFees?.toString() ?? "");
  }, [open, signup.email]);

  const utils = trpc.useUtils();
  const refreshMutation = trpc.sessions.refresh.useMutation();

  const afterMutation = async () => {
    await refreshMutation.mutateAsync();
    await utils.sessions.detail.invalidate({ rowId: sessionRowId });
    onOpenChange(false);
    onDone();
    if (!isAdmin) navigate("/");
  };

  const editMutation = trpc.signups.edit.useMutation({
    onSuccess: async () => { toast.success("Sign-up updated."); await afterMutation(); },
    onError: (err) => toast.error(err.message || "Failed to update sign-up."),
  });

  const deleteMutation = trpc.signups.delete.useMutation({
    onSuccess: async () => { toast.success("Sign-up deleted."); await afterMutation(); },
    onError: (err) => toast.error(err.message || "Failed to delete sign-up."),
  });

  const calculatedFee = calculateFee(session, memberStatus, activity);
  const displayFee = isAdmin ? (parseFloat(actualFee) || 0) : calculatedFee;

  // Debt guard: projected debt = existing debt − old fee + new fee
  const projectedDebt = currentDebt - signup.actualFees + displayFee;
  const debtWouldBlock = !isAdmin && projectedDebt > 50;

  const isPending = editMutation.isPending || deleteMutation.isPending || refreshMutation.isPending;

  const handleSave = () => {
    editMutation.mutate({
      sessionDate,
      sessionPool,
      activity,
      baseFee: calculatedFee,
      actualFee: isAdmin ? (parseFloat(actualFee) || 0) : calculatedFee,
      ...(isAdmin ? {
        targetEmail: signup.email,
        name: name.trim(),
        memberOnTrainingDate: memberStatus.trim(),
        paymentId: paymentId.trim(),
      } : {}),
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate({
      sessionDate,
      sessionPool,
      ...(isAdmin ? { targetEmail: signup.email } : {}),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Bottom sheet — bg-modal: #2A2A2A */}
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto bg-[#2A2A2A] border-t border-white/8">
        <SheetHeader className="pb-3">
          {/* Sheet title — fs-primary: 15px/500 */}
          <SheetTitle className="text-white text-[15px] font-medium">
            {isAdmin ? `Edit — ${signup.name}` : "Edit my sign-up"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pb-6">

          {/* ── Admin fields — horizontal label/value rows: fs-body 16px/400 ── */}
          {isAdmin && (
            <div className="space-y-3">
              <div className="bg-[#1E1E1E] rounded-xl divide-y divide-[#2C2C2C]">
                <div className="px-4 py-2.5 flex items-center gap-3 min-h-[48px]">
                  <span className="text-[16px] text-[#888888] w-32 shrink-0">Name</span>
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="h-8 bg-transparent border-0 p-0 text-[16px] text-white focus-visible:ring-0"
                  />
                </div>
                <div className="px-4 py-2.5 flex items-center gap-3 min-h-[48px]">
                  <span className="text-[16px] text-[#888888] w-32 shrink-0">Status</span>
                  <Input
                    value={memberStatus}
                    onChange={e => setMemberStatus(e.target.value)}
                    className="h-8 bg-transparent border-0 p-0 text-[16px] text-white focus-visible:ring-0"
                  />
                </div>
                <div className="px-4 py-2.5 flex items-center gap-3 min-h-[48px]">
                  <span className="text-[16px] text-[#888888] w-32 shrink-0">Payment ID</span>
                  <Input
                    value={paymentId}
                    onChange={e => setPaymentId(e.target.value)}
                    className="h-8 bg-transparent border-0 p-0 text-[16px] text-white font-mono focus-visible:ring-0"
                  />
                </div>
                <div className="px-4 py-2.5 flex items-center gap-3 min-h-[48px]">
                  <span className="text-[16px] text-[#888888] w-32 shrink-0">Actual fee</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={actualFee}
                    onChange={e => setActualFee(e.target.value)}
                    className="h-8 bg-transparent border-0 p-0 text-[16px] text-white focus-visible:ring-0"
                  />
                </div>
              </div>
              {/* Helper text — fs-meta: 13px/400 */}
              <p className="text-[13px] text-[#888888] px-1">
                Calculated fee for this activity: {formatFee(calculatedFee)}
              </p>
            </div>
          )}

          {/* ── Activity chips ── */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/55 mb-2">
              Activity
            </p>
            <div className="flex flex-wrap gap-2">
              {ACTIVITIES.map((a) => {
                const fee = calculateFee(session, memberStatus, a);
                return (
                  <button
                    key={a}
                    onClick={() => {
                      setActivity(a);
                      setActualFee(fee.toString());
                    }}
                    className={`rounded-full border-[1.5px] px-[14px] py-[6px] transition-all flex flex-col items-start ${
                      activity === a
                        ? "bg-[#2196F3] border-[#2196F3]"
                        : "bg-[#1E1E1E] border-[#888888]"
                    }`}
                  >
                    {/* Chip label — fs-content: 14px */}
                    <span className="text-[14px] font-medium text-white leading-tight">{a}</span>
                    {/* Price sub-label — fs-meta: 13px/400 */}
                    <span className={`text-[13px] mt-0.5 ${activity === a ? "text-white/80" : "text-[#888888]"}`}>
                      {formatFee(fee)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Fee summary — stacked label/value ── */}
          <div className="bg-[#1E1E1E] rounded-xl px-4 py-4 flex items-center justify-between">
            {/* Stacked label — fs-meta: 13px */}
            <span className="text-[13px] text-[#888888]">Fee</span>
            {/* Stacked value — fs-content: 14px */}
            <span className="text-[14px] text-white">{formatFee(displayFee)}</span>
          </div>

          {/* Debt block warning */}
          {debtWouldBlock && (
            <div className="bg-[#3D3500] rounded-xl px-4 py-3">
              <p className="text-[13px] text-[#F5C518] leading-snug">
                This change would bring your outstanding balance to {formatFee(projectedDebt)}, which exceeds the $50 limit. Please settle your balance first.
              </p>
            </div>
          )}

          {/* ── Actions — fs-primary: 15px/500 ── */}
          <div className="space-y-2">
            <button
              onClick={handleSave}
              disabled={isPending || debtWouldBlock}
              className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[15px] disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {editMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editMutation.isPending ? "Saving…" : "Save changes"}
            </button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  disabled={isPending}
                  className="w-full h-[48px] rounded-full border border-red-500/40 text-red-400 text-[15px] font-medium disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-red-400/8 transition-colors"
                >
                  {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {deleteMutation.isPending ? "Deleting…" : "Delete sign-up"}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete sign-up?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the sign-up for{" "}
                    <span className="font-medium">{sessionDate}</span> at{" "}
                    <span className="font-medium">{sessionPool}</span>. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                    Yes, delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
