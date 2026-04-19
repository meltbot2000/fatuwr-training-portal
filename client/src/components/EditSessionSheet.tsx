import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function getDayFromDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
}

function toInputDate(dateStr: string): string {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  venueCost?: number;
  revenue?: number;
  rainOff?: string;
  isClosed?: string;
}

interface EditSessionSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: SessionForEdit;
  onDone?: () => void;
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 min-h-[48px] border-b border-[#2C2C2C] last:border-0">
      <span className="text-[16px] text-[#888888] w-36 shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      {...props}
      className="bg-transparent border-0 p-0 text-[16px] text-white focus-visible:ring-0 h-8"
    />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 px-4 pt-4 pb-1">
      {children}
    </p>
  );
}

type RainOffType = "" | "half" | "full";

function normaliseRainOff(raw: string | undefined): RainOffType {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("full")) return "full";
  if (s.includes("half") || s.trim().length > 0) return "half";
  return "";
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
    venueCost: String(session.venueCost ?? 0),
    isClosed: session.isClosed ?? "",
  });

  const [rainOff, setRainOff] = useState<RainOffType>(normaliseRainOff(session.rainOff));
  const [pendingRainOff, setPendingRainOff] = useState<RainOffType | null>(null); // awaiting confirmation

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
      venueCost: String(session.venueCost ?? 0),
      isClosed: session.isClosed ?? "",
    });
    setRainOff(normaliseRainOff(session.rainOff));
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

  const rainOffMutation = trpc.admin.processRainOff.useMutation({
    onSuccess: async (data) => {
      const label = data.type === "full" ? "Full" : "Half";
      toast.success(`${label} rain off processed — ${data.refundsIssued} refund${data.refundsIssued !== 1 ? "s" : ""} issued.`);
      await utils.admin.allSessions.invalidate();
      await utils.admin.sessionAttendees.invalidate({ rowId: session.rowId });
      onOpenChange(false);
      onDone?.();
    },
    onError: (err) => toast.error(err.message || "Failed to process rain off."),
  });

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const parseFee = (s: string) => parseFloat(s) || 0;
  const isClosed = form.isClosed.trim().length > 0;

  const handleSubmit = () => {
    if (!form.trainingDate || !form.pool || !form.trainingTime) {
      toast.error("Date, pool, and time are required.");
      return;
    }

    const rainOffRaw = rainOff === "full" ? "Full Rain Off" : rainOff === "half" ? "Half Rain Off" : "";

    // If rain off is being set (or changed), confirm before processing refunds
    const prevRainOff = normaliseRainOff(session.rainOff);
    if (rainOff && rainOff !== prevRainOff) {
      setPendingRainOff(rainOff);
      return;
    }

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
      venueCost: parseFee(form.venueCost),
      rainOff: rainOffRaw,
      isClosed: form.isClosed,
    });
  };

  const confirmRainOff = () => {
    if (!pendingRainOff) return;
    // First save the session fields, then process the refunds
    const rainOffRaw = pendingRainOff === "full" ? "Full Rain Off" : "Half Rain Off";
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
      venueCost: parseFee(form.venueCost),
      rainOff: rainOffRaw,
      isClosed: form.isClosed,
    });
    rainOffMutation.mutate({ rowId: session.rowId, type: pendingRainOff });
    setPendingRainOff(null);
  };

  const revenue = session.revenue ?? 0;
  const pnl = revenue - parseFee(form.venueCost);

  const rainOffLabel = pendingRainOff === "full"
    ? "Full Rain Off — 100% refund to all attendees"
    : "Half Rain Off — 50% refund to all attendees";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto bg-[#2A2A2A] border-t border-white/8 px-0">
          <SheetHeader className="px-4 pb-2">
            <SheetTitle className="text-[15px] font-medium text-white">Edit session</SheetTitle>
          </SheetHeader>

          <div className="pb-8">

            {/* ── Session status ──────────────────────────── */}
            <SectionLabel>Status</SectionLabel>
            <div className="bg-[#1E1E1E] rounded-xl mx-4 overflow-hidden">
              {/* Close session toggle */}
              <div className="flex items-center justify-between px-4 min-h-[48px] border-b border-[#2C2C2C]">
                <span className="text-[16px] text-[#888888]">Session closed</span>
                <button
                  onClick={() => setForm(f => ({ ...f, isClosed: f.isClosed.trim() ? "" : "Closed" }))}
                  className={`w-11 h-6 rounded-full transition-colors relative overflow-hidden ${isClosed ? "bg-[#2196F3]" : "bg-white/15"}`}
                >
                  <span className={`absolute top-[2px] left-0 w-5 h-5 rounded-full bg-white shadow transition-transform ${isClosed ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
                </button>
              </div>

              {/* Rain off — 3-way selector */}
              <div className="px-4 py-3">
                <p className="text-[16px] text-[#888888] mb-2">Rain off</p>
                <div className="flex gap-2">
                  {(["", "half", "full"] as RainOffType[]).map((opt) => {
                    const label = opt === "" ? "None" : opt === "half" ? "Half" : "Full";
                    const active = rainOff === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => setRainOff(opt)}
                        className={`flex-1 h-9 rounded-full text-[13px] font-medium border transition-colors ${
                          active
                            ? opt === "full"
                              ? "bg-[#F44336] border-[#F44336] text-white"
                              : opt === "half"
                              ? "bg-[#F5C518] border-[#F5C518] text-[#1A1A1A]"
                              : "bg-[#2196F3] border-[#2196F3] text-white"
                            : "border-white/15 text-white/50"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {rainOff !== "" && (
                  <p className="text-[12px] text-[#888888] mt-2">
                    {rainOff === "full"
                      ? "Full refund (100%) will be issued to all attendees when saved."
                      : "Half refund (50%) will be issued to all attendees when saved."}
                  </p>
                )}
              </div>
            </div>

            {/* ── Session details ─────────────────────────── */}
            <SectionLabel>Session details</SectionLabel>
            <div className="bg-[#1E1E1E] rounded-xl mx-4 overflow-hidden">
              <FieldRow label="Date *">
                <FieldInput type="date" value={form.trainingDate} onChange={set("trainingDate")} />
              </FieldRow>
              <FieldRow label="Time *">
                <FieldInput placeholder="e.g. 0630-0830" value={form.trainingTime} onChange={set("trainingTime")} />
              </FieldRow>
              <FieldRow label="Pool *">
                <FieldInput placeholder="e.g. Toa Payoh" value={form.pool} onChange={set("pool")} />
              </FieldRow>
            </div>

            {/* ── Member fees ─────────────────────────────── */}
            <SectionLabel>Member fees</SectionLabel>
            <div className="bg-[#1E1E1E] rounded-xl mx-4 overflow-hidden">
              <FieldRow label="Training">
                <FieldInput type="number" min="0" step="0.50" value={form.memberFee} onChange={set("memberFee")} />
              </FieldRow>
              <FieldRow label="Swims only">
                <FieldInput type="number" min="0" step="0.50" value={form.memberSwimFee} onChange={set("memberSwimFee")} />
              </FieldRow>
              <FieldRow label="Student training">
                <FieldInput type="number" min="0" step="0.50" value={form.studentFee} onChange={set("studentFee")} />
              </FieldRow>
              <FieldRow label="Student swims">
                <FieldInput type="number" min="0" step="0.50" value={form.studentSwimFee} onChange={set("studentSwimFee")} />
              </FieldRow>
            </div>

            {/* ── Non-member fees ─────────────────────────── */}
            <SectionLabel>Non-member fees</SectionLabel>
            <div className="bg-[#1E1E1E] rounded-xl mx-4 overflow-hidden">
              <FieldRow label="Training">
                <FieldInput type="number" min="0" step="0.50" value={form.nonMemberFee} onChange={set("nonMemberFee")} />
              </FieldRow>
              <FieldRow label="Swims only">
                <FieldInput type="number" min="0" step="0.50" value={form.nonMemberSwimFee} onChange={set("nonMemberSwimFee")} />
              </FieldRow>
              <FieldRow label="Trainer">
                <FieldInput type="number" min="0" step="0.50" value={form.trainerFee} onChange={set("trainerFee")} />
              </FieldRow>
            </div>

            {/* ── Cost & revenue ──────────────────────────── */}
            <SectionLabel>Cost & revenue</SectionLabel>
            <div className="bg-[#1E1E1E] rounded-xl mx-4 overflow-hidden">
              <FieldRow label="Venue cost">
                <FieldInput type="number" min="0" step="0.50" value={form.venueCost} onChange={set("venueCost")} />
              </FieldRow>
              <div className="flex items-center gap-3 px-4 min-h-[48px] border-b border-[#2C2C2C]">
                <span className="text-[16px] text-[#888888] w-36 shrink-0">Revenue</span>
                <span className="flex-1 text-[16px] text-white/70">
                  ${revenue.toFixed(2)}
                  <span className="ml-2 text-[12px] text-white/30">from sign-ups</span>
                </span>
              </div>
              <div className="flex items-center gap-3 px-4 min-h-[48px]">
                <span className="text-[16px] text-[#888888] w-36 shrink-0">Session PnL</span>
                <span className={`flex-1 text-[16px] font-medium ${pnl >= 0 ? "text-[#4CAF50]" : "text-[#F44336]"}`}>
                  {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                </span>
              </div>
            </div>

            {/* ── Notes ───────────────────────────────────── */}
            <SectionLabel>Notes</SectionLabel>
            <div className="bg-[#1E1E1E] rounded-xl mx-4 overflow-hidden">
              <div className="px-4 py-3">
                <p className="text-[13px] text-[#888888] mb-1">Training objective</p>
                <Textarea
                  placeholder="Optional"
                  value={form.trainingObjective}
                  onChange={set("trainingObjective")}
                  className="bg-transparent border-0 p-0 text-[16px] text-white focus-visible:ring-0 resize-none min-h-[56px]"
                  rows={2}
                />
              </div>
              <div className="px-4 py-3 border-t border-[#2C2C2C]">
                <p className="text-[13px] text-[#888888] mb-1">Notes</p>
                <Textarea
                  placeholder="Optional"
                  value={form.notes}
                  onChange={set("notes")}
                  className="bg-transparent border-0 p-0 text-[16px] text-white focus-visible:ring-0 resize-none min-h-[56px]"
                  rows={2}
                />
              </div>
            </div>

            {/* ── Actions ─────────────────────────────────── */}
            <div className="px-4 mt-6 space-y-2">
              <button
                onClick={handleSubmit}
                disabled={mutation.isPending || rainOffMutation.isPending}
                className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[15px] disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {(mutation.isPending || rainOffMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                {mutation.isPending || rainOffMutation.isPending ? "Saving…" : "Save changes"}
              </button>
              <button
                onClick={() => onOpenChange(false)}
                className="w-full h-[48px] rounded-full border-[1.5px] border-[#888888] text-white font-medium text-[15px]"
              >
                Cancel
              </button>
            </div>

          </div>
        </SheetContent>
      </Sheet>

      {/* Rain off confirmation dialog */}
      <AlertDialog open={pendingRainOff !== null} onOpenChange={(v) => { if (!v) setPendingRainOff(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{rainOffLabel}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRainOff === "full"
                ? "A full refund (100% of fees paid) will be issued to every attendee of this session. New refund records will be created in their sign-up history."
                : "A half refund (50% of fees paid) will be issued to every attendee of this session. New refund records will be created in their sign-up history."}
              <br /><br />
              This cannot be undone. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingRainOff(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={confirmRainOff}
            >
              Yes, issue refunds
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
