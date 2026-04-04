import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { calculateFee, type FeeSession } from "@/lib/feeUtils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [activity, setActivity] = useState<Activity>(
    (ACTIVITIES.includes(signup.activity as Activity) ? signup.activity : "Regular Training") as Activity
  );

  const utils = trpc.useUtils();

  const refreshMutation = trpc.sessions.refresh.useMutation();

  const editMutation = trpc.signups.edit.useMutation({
    onSuccess: async () => {
      toast.success("Sign-up updated.");
      await refreshMutation.mutateAsync();
      await utils.sessions.detail.invalidate({ rowId: sessionRowId });
      onOpenChange(false);
      onDone();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update sign-up.");
    },
  });

  const deleteMutation = trpc.signups.delete.useMutation({
    onSuccess: async () => {
      toast.success("Sign-up deleted.");
      await refreshMutation.mutateAsync();
      await utils.sessions.detail.invalidate({ rowId: sessionRowId });
      onOpenChange(false);
      onDone();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to delete sign-up.");
    },
  });

  const calculatedFee = calculateFee(session, signup.memberOnTrainingDate, activity);
  const isPending = editMutation.isPending || deleteMutation.isPending || refreshMutation.isPending;

  const handleSave = () => {
    editMutation.mutate({
      sessionDate,
      sessionPool,
      activity,
      baseFee: calculatedFee,
      actualFee: calculatedFee,
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate({ sessionDate, sessionPool });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-navy">Edit Sign-up</SheetTitle>
        </SheetHeader>

        <div className="px-4 space-y-4">
          {/* Read-only fields */}
          <div>
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={signup.name} disabled className="bg-muted/50" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Member on Training Date</Label>
            <Input value={signup.memberOnTrainingDate || "Non-Member"} disabled className="bg-muted/50" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Payment ID</Label>
            <Input value={signup.paymentId || "—"} disabled className="bg-muted/50" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Actual Fee</Label>
            <Input value={formatFee(calculatedFee)} disabled className="bg-muted/50 font-semibold" />
          </div>

          {/* Activity selection */}
          <div>
            <Label className="text-sm font-medium text-navy mb-2 block">Activity</Label>
            <div className="grid grid-cols-2 gap-2">
              {ACTIVITIES.map((a) => (
                <button
                  key={a}
                  onClick={() => setActivity(a)}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    activity === a
                      ? "border-gold bg-gold/10 text-navy"
                      : "border-border bg-card text-muted-foreground hover:border-gold/50"
                  }`}
                >
                  {a}
                  <p className="text-xs mt-0.5 opacity-70">
                    {formatFee(calculateFee(session, signup.memberOnTrainingDate, a))}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <SheetFooter className="px-4 pt-4 gap-2">
          <Button
            onClick={handleSave}
            disabled={isPending}
            className="w-full bg-navy hover:bg-navy/90 text-white font-semibold"
          >
            {editMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
            ) : (
              "Save changes"
            )}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                disabled={isPending}
                className="w-full border-destructive/50 text-destructive hover:bg-destructive/5"
              >
                {deleteMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting...</>
                ) : (
                  "Delete sign-up"
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete sign-up?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove your sign-up for{" "}
                  <span className="font-medium">{sessionDate}</span> at{" "}
                  <span className="font-medium">{sessionPool}</span>. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Yes, delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            variant="ghost"
            disabled={isPending}
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
