import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
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

// ── Shared field row component ─────────────────────────────────────────────
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
    revenue: String(session.revenue ?? 0),
    rainOff: session.rainOff ?? "",
    isClosed: session.isClosed ?? "",
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
      venueCost: String(session.venueCost ?? 0),
      revenue: String(session.revenue ?? 0),
      rainOff: session.rainOff ?? "",
      isClosed: session.isClosed ?? "",
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

  const parseFee = (s: string) => parseFloat(s) || 0;
  const isClosed = form.isClosed.trim().length > 0;
  const isRainOff = form.rainOff.trim().length > 0;

  const handleSubmit = () => {
    if (!form.trainingDate || !form.pool || !form.trainingTime) {
      toast.error("Date, pool, and time are required.");
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
      revenue: parseFee(form.revenue),
      rainOff: form.rainOff,
      isClosed: form.isClosed,
    });
  };

  return (
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
                className={`w-11 h-6 rounded-full transition-colors relative ${isClosed ? "bg-[#2196F3]" : "bg-white/15"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isClosed ? "translate-x-[22px]" : "translate-x-0.5"}`} />
              </button>
            </div>
            {/* Rain off toggle */}
            <div className="flex items-center justify-between px-4 min-h-[48px]">
              <span className="text-[16px] text-[#888888]">Rain off</span>
              <button
                onClick={() => setForm(f => ({ ...f, rainOff: f.rainOff.trim() ? "" : "Rain Off" }))}
                className={`w-11 h-6 rounded-full transition-colors relative ${isRainOff ? "bg-[#2196F3]" : "bg-white/15"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isRainOff ? "translate-x-[22px]" : "translate-x-0.5"}`} />
              </button>
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
            <FieldRow label="Revenue">
              <FieldInput type="number" min="0" step="0.50" value={form.revenue} onChange={set("revenue")} />
            </FieldRow>
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
              disabled={mutation.isPending}
              className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[15px] disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {mutation.isPending ? "Saving…" : "Save changes"}
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
  );
}
