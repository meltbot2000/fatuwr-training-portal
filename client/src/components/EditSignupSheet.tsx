import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
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

  const [activity, setActivity] = useState<Activity>(
    (ACTIVITIES.includes(signup.activity as Activity) ? signup.activity : "Regular Training") as Activity
  );
  // Admin-only editable fields
  const [name, setName] = useState(signup.name);
  const [memberStatus, setMemberStatus] = useState(signup.memberOnTrainingDate || "Non-Member");
  const [paymentId, setPaymentId] = useState(signup.paymentId || "");
  const [actualFee, setActualFee] = useState(signup.actualFees?.toString() ?? "");

  const utils = trpc.useUtils();
  const refreshMutation = trpc.sessions.refresh.useMutation();

  const afterMutation = async () => {
    await refreshMutation.mutateAsync();
    await utils.sessions.detail.invalidate({ rowId: sessionRowId });
    onOpenChange(false);
    onDone();
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
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto bg-[#1E1E1E] border-t border-white/8">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-white text-[16px]">
            {isAdmin ? `Edit — ${signup.name}` : "Edit my sign-up"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pb-6">

          {/* ── Admin fields ───────────────────────── */}
          {isAdmin && (
            <div className="space-y-3">
              <div className="bg-[#2a2a2a] rounded-xl divide-y divide-white/8">
                {/* Name */}
                <div className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-[12px] text-white/55 w-28 shrink-0">Name</span>
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="h-8 bg-transparent border-0 p-0 text-[13px] text-white focus-visible:ring-0"
                  />
                </div>
                {/* Member status */}
                <div className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-[12px] text-white/55 w-28 shrink-0">Status</span>
                  <Input
                    value={memberStatus}
                    onChange={e => setMemberStatus(e.target.value)}
                    className="h-8 bg-transparent border-0 p-0 text-[13px] text-white focus-visible:ring-0"
                  />
                </div>
                {/* Payment ID */}
                <div className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-[12px] text-white/55 w-28 shrink-0">Payment ID</span>
                  <Input
                    value={paymentId}
                    onChange={e => setPaymentId(e.target.value)}
                    className="h-8 bg-transparent border-0 p-0 text-[13px] text-white font-mono focus-visible:ring-0"
                  />
                </div>
                {/* Actual fee */}
                <div className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-[12px] text-white/55 w-28 shrink-0">Actual Fee</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={actualFee}
                    onChange={e => setActualFee(e.target.value)}
                    className="h-8 bg-transparent border-0 p-0 text-[13px] text-white focus-visible:ring-0"
                  />
                </div>
              </div>
              <p className="text-[11px] text-white/45 px-1">
                Calculated fee for this activity: {formatFee(calculatedFee)}
              </p>
            </div>
          )}

          {/* ── Activity picker (all users) ─────────── */}
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
                      if (!isAdmin) setActualFee(fee.toString());
                    }}
                    className={`rounded-full border-2 text-[13px] font-medium px-[14px] py-[6px] bg-transparent transition-all flex flex-col items-start ${
                      activity === a
                        ? "border-[#2196F3] text-[#2196F3]"
                        : "border-[#888888] text-white"
                    }`}
                  >
                    <span className="leading-tight">{a}</span>
                    <span className={`text-[12px] mt-0.5 ${activity === a ? "text-[#2196F3]" : "text-[#888888]"}`}>
                      {formatFee(fee)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Fee summary ─────────────────────────── */}
          <div className="bg-[#2a2a2a] rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-[13px] text-white/60">Fee</span>
            <span className="text-[15px] font-semibold text-white">{formatFee(displayFee)}</span>
          </div>

          {/* ── Actions ─────────────────────────────── */}
          <div className="space-y-2">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[13px] disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {editMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editMutation.isPending ? "Saving…" : "Save changes"}
            </button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  disabled={isPending}
                  className="w-full h-[48px] rounded-full border border-red-500/40 text-red-400 text-[13px] font-medium disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-red-400/8 transition-colors"
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
