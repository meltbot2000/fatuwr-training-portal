import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function getDayFromDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
}

/** Convert any date string (M/D/YYYY, YYYY-MM-DD, etc.) to YYYY-MM-DD for <input type="date"> */
function toInputDate(dateStr: string): string {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export interface SessionForEdit {
  rowId: string;
  trainingDate: string;
  trainingTime: string;
  pool: string;
  memberFee: number;
  nonMemberFee: number;
  memberSwimFee: number;
  nonMemberSwimFee: number;
  studentFee: number;
  studentSwimFee: number;
  trainerFee: number;
  notes: string | null;
  trainingObjective: string | null;
}

interface EditSessionSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: SessionForEdit;
  onDone?: () => void;
}

export function EditSessionSheet({ open, onOpenChange, session, onDone }: EditSessionSheetProps) {
  const utils = trpc.useUtils();

  const [form, setForm] = useState({
    trainingDate: toInputDate(session.trainingDate),
    trainingTime: session.trainingTime ?? "",
    pool: session.pool ?? "",
    memberFee: String(session.memberFee ?? 0),
    nonMemberFee: String(session.nonMemberFee ?? 0),
    memberSwimFee: String(session.memberSwimFee ?? 0),
    nonMemberSwimFee: String(session.nonMemberSwimFee ?? 0),
    studentFee: String(session.studentFee ?? 0),
    studentSwimFee: String(session.studentSwimFee ?? 0),
    trainerFee: String(session.trainerFee ?? 0),
    notes: session.notes ?? "",
    trainingObjective: session.trainingObjective ?? "",
  });

  useEffect(() => {
    setForm({
      trainingDate: toInputDate(session.trainingDate),
      trainingTime: session.trainingTime ?? "",
      pool: session.pool ?? "",
      memberFee: String(session.memberFee ?? 0),
      nonMemberFee: String(session.nonMemberFee ?? 0),
      memberSwimFee: String(session.memberSwimFee ?? 0),
      nonMemberSwimFee: String(session.nonMemberSwimFee ?? 0),
      studentFee: String(session.studentFee ?? 0),
      studentSwimFee: String(session.studentSwimFee ?? 0),
      trainerFee: String(session.trainerFee ?? 0),
      notes: session.notes ?? "",
      trainingObjective: session.trainingObjective ?? "",
    });
  }, [session]);

  const mutation = trpc.admin.editSession.useMutation({
    onSuccess: async () => {
      toast.success("Session updated.");
      await utils.admin.allSessions.invalidate();
      await utils.sessions.detail.invalidate({ rowId: session.rowId });
      onOpenChange(false);
      onDone?.();
    },
    onError: (err) => toast.error(err.message || "Failed to update session."),
  });

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = () => {
    if (!form.trainingDate || !form.pool || !form.trainingTime) {
      toast.error("Date, pool, and time are required.");
      return;
    }
    const parseFee = (s: string) => parseFloat(s) || 0;
    mutation.mutate({
      rowId: session.rowId,
      trainingDate: form.trainingDate,
      day: getDayFromDate(form.trainingDate),
      trainingTime: form.trainingTime,
      pool: form.pool,
      memberFee: parseFee(form.memberFee),
      nonMemberFee: parseFee(form.nonMemberFee),
      memberSwimFee: parseFee(form.memberSwimFee),
      nonMemberSwimFee: parseFee(form.nonMemberSwimFee),
      studentFee: parseFee(form.studentFee),
      studentSwimFee: parseFee(form.studentSwimFee),
      trainerFee: parseFee(form.trainerFee),
      notes: form.notes,
      trainingObjective: form.trainingObjective,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-navy">Edit Session</SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Training Date *</Label>
              <Input type="date" value={form.trainingDate} onChange={set("trainingDate")} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Time *</Label>
              <Input placeholder="0630-0830" value={form.trainingTime} onChange={set("trainingTime")} className="h-10" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Pool *</Label>
            <Input placeholder="e.g. Toa Payoh" value={form.pool} onChange={set("pool")} className="h-10" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Member Fee</Label>
              <Input type="number" min="0" step="0.50" placeholder="0" value={form.memberFee} onChange={set("memberFee")} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Non-Member Fee</Label>
              <Input type="number" min="0" step="0.50" placeholder="0" value={form.nonMemberFee} onChange={set("nonMemberFee")} className="h-10" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Member Swim Fee</Label>
              <Input type="number" min="0" step="0.50" placeholder="0" value={form.memberSwimFee} onChange={set("memberSwimFee")} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Non-Member Swim Fee</Label>
              <Input type="number" min="0" step="0.50" placeholder="0" value={form.nonMemberSwimFee} onChange={set("nonMemberSwimFee")} className="h-10" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Student Fee</Label>
              <Input type="number" min="0" step="0.50" placeholder="0" value={form.studentFee} onChange={set("studentFee")} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Student Swim Fee</Label>
              <Input type="number" min="0" step="0.50" placeholder="0" value={form.studentSwimFee} onChange={set("studentSwimFee")} className="h-10" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Trainer Fee</Label>
            <Input type="number" min="0" step="0.50" placeholder="0" value={form.trainerFee} onChange={set("trainerFee")} className="h-10" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Training Objective</Label>
            <Textarea placeholder="Optional" value={form.trainingObjective} onChange={set("trainingObjective")} className="resize-none" rows={2} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Notes</Label>
            <Textarea placeholder="Optional" value={form.notes} onChange={set("notes")} className="resize-none" rows={2} />
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="w-full bg-navy text-white hover:bg-navy/90"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save Changes
          </Button>
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
