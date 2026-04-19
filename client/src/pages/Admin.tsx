import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Loader2, Plus, Lock, RefreshCw, Pencil, Users, ChevronRight, Trash2, KeyRound, ChevronDown } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { EditSessionSheet, type SessionForEdit } from "@/components/EditSessionSheet";
import { formatDisplayDate } from "@/lib/dateUtils";

const STATUS_COLORS: Record<string, string> = {
  "Member": "bg-green-500 text-white",
  "Student": "bg-blue-500 text-white",
  "Trial": "bg-amber-400 text-navy",
  "Non-Member": "bg-muted text-muted-foreground",
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function getDayFromDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
}

/**
 * A session is considered "past" (completed) if:
 *   - it is explicitly closed (isClosed is non-empty), OR
 *   - the session date + training start time is more than 1 hour ago
 *
 * trainingTime examples: "7:30 PM – 9:30 PM", "19:30 - 21:30"
 * We parse the first time component to determine the start hour.
 */
function isPastSession(sess: { trainingDate: string; trainingTime?: string | null; isClosed?: string | null }): boolean {
  // Closed flag takes priority
  if (sess.isClosed && String(sess.isClosed).trim().length > 0) return true;

  // Parse training date
  const datePart = sess.trainingDate?.trim() || "";
  if (!datePart) return false;

  // Parse start time from trainingTime string (e.g. "7:30 PM – 9:30 PM" or "19:30 - 21:30")
  let startHour = 0;
  let startMin = 0;
  if (sess.trainingTime) {
    const t = sess.trainingTime.trim();
    // Take the first token before "–" or "-"
    const startStr = t.split(/[–\-]/)[0].trim(); // e.g. "7:30 PM" or "19:30"
    const match = startStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (match) {
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const ampm = (match[3] || "").toLowerCase();
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      startHour = h;
      startMin = m;
    }
  }

  // Build session start datetime
  const sessionStart = new Date(datePart);
  if (isNaN(sessionStart.getTime())) return false;
  sessionStart.setHours(startHour, startMin, 0, 0);

  // Past = session start + 1 hour is before now
  return Date.now() > sessionStart.getTime() + 60 * 60 * 1000;
}

function formatFee(n: number) {
  return `$${n.toFixed(2)}`;
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-SG", { month: "long", year: "numeric" });
}

function formatPaymentDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
}

// ─── EditUserSheet ────────────────────────────────────────────────────────────

interface EditUserSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: { name: string; email: string; paymentId: string; memberStatus: string; clubRole: string; membershipStartDate: string; trialStartDate: string; trialEndDate: string; dob: string };
  onDone: () => void;
}

function EditUserSheet({ open, onOpenChange, user, onDone }: EditUserSheetProps) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(user.name || "");
  const [paymentId, setPaymentId] = useState(user.paymentId || "");
  const [dob, setDob] = useState(user.dob || "");
  const [memberStatus, setMemberStatus] = useState(user.memberStatus || "Non-Member");
  const [clubRole, setClubRole] = useState(user.clubRole || "none");
  const [membershipStartDate, setMembershipStartDate] = useState(user.membershipStartDate || "");
  const [trialStartDate, setTrialStartDate] = useState(user.trialStartDate || "");
  const [trialEndDate, setTrialEndDate] = useState(user.trialEndDate || "");
  const [membershipFee, setMembershipFee] = useState("");
  const [editingPayment, setEditingPayment] = useState<{ id: number; paymentId: string; reference: string; amount: number; date: string; email: string } | null>(null);

  useEffect(() => {
    setName(user.name || "");
    setPaymentId(user.paymentId || "");
    setDob(user.dob || "");
    setMemberStatus(user.memberStatus || "Non-Member");
    setClubRole(user.clubRole || "none");
    setMembershipStartDate(user.membershipStartDate || "");
    setTrialStartDate(user.trialStartDate || "");
    setTrialEndDate(user.trialEndDate || "");
    setMembershipFee("");
  }, [user]);

  const activityQuery = trpc.admin.getUserActivity.useQuery(
    { email: user.email, paymentId: user.paymentId || undefined },
    { enabled: open }
  );

  const mutation = trpc.admin.updateUserStatus.useMutation({
    onSuccess: async () => {
      toast.success("User updated.");
      await utils.admin.allUsers.invalidate();
      onOpenChange(false);
      onDone();
    },
    onError: (err) => toast.error(err.message || "Failed to update user."),
  });

  const isSettingMember = memberStatus === "Member" && user.memberStatus !== "Member";

  const payments = activityQuery.data?.payments ?? [];
  const signups  = activityQuery.data?.signups  ?? [];

  // Balance summary
  const totalPaid    = payments.reduce((s, p) => s + (p.amount ?? 0), 0);
  const totalCharged = signups
    .filter(s => !["Trial Membership", "Membership Fee"].includes(s.activity ?? ""))
    .reduce((s, sg) => s + (sg.actualFees ?? 0), 0);
  const balance = totalPaid - totalCharged; // positive = credit, negative = owes

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[92vh] overflow-y-auto">
          <SheetHeader className="mb-2">
            <SheetTitle className="text-navy">{user.name || user.email}</SheetTitle>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </SheetHeader>

          <Tabs defaultValue="profile" className="mt-3">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="profile" className="flex-1">Profile</TabsTrigger>
              <TabsTrigger value="payments" className="flex-1">
                Payments {payments.length > 0 && <span className="ml-1 text-xs opacity-60">({payments.length})</span>}
              </TabsTrigger>
              <TabsTrigger value="signups" className="flex-1">
                Sign-ups {signups.length > 0 && <span className="ml-1 text-xs opacity-60">({signups.length})</span>}
              </TabsTrigger>
            </TabsList>

            {/* ── Profile tab ─────────────────────────────── */}
            <TabsContent value="profile" className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Name</Label>
                <Input placeholder="Full name" value={name} onChange={e => setName(e.target.value)} className="h-10" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Payment ID</Label>
                <Input placeholder="e.g. jtan" value={paymentId} onChange={e => setPaymentId(e.target.value)} className="h-10 font-mono" />
                <p className="text-xs text-muted-foreground">Used as PayNow reference for payment matching.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Date of Birth <span className="text-muted-foreground/60">(DD/MM/YYYY)</span></Label>
                <Input placeholder="e.g. 01/01/1990" value={dob} onChange={e => setDob(e.target.value)} className="h-10" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Membership Status</Label>
                <Select value={memberStatus} onValueChange={setMemberStatus}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Non-Member", "Trial", "Member", "Student"].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isSettingMember && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Membership Fee Paid <span className="text-muted-foreground/60">(optional)</span>
                  </Label>
                  <Input type="number" min="0" step="0.50" placeholder="e.g. 80" value={membershipFee} onChange={e => setMembershipFee(e.target.value)} className="h-10" />
                  <p className="text-xs text-muted-foreground">Records a Membership Fee entry in Training Sign-ups.</p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Annual Membership Start <span className="text-muted-foreground/60">(DD/MM/YYYY)</span></Label>
                <Input placeholder="e.g. 01/04/2026" value={membershipStartDate} onChange={e => setMembershipStartDate(e.target.value)} className="h-10" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Trial Start <span className="text-muted-foreground/60">(DD/MM/YYYY)</span></Label>
                  <Input placeholder="e.g. 01/04/2026" value={trialStartDate} onChange={e => setTrialStartDate(e.target.value)} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Trial End <span className="text-muted-foreground/60">(DD/MM/YYYY)</span></Label>
                  <Input placeholder="e.g. 01/07/2026" value={trialEndDate} onChange={e => setTrialEndDate(e.target.value)} className="h-10" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Club Role</Label>
                <Select value={clubRole} onValueChange={setClubRole}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="Helper">Helper</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-2 space-y-2">
                <Button
                  onClick={() => mutation.mutate({
                    email: user.email,
                    name: name.trim() || undefined,
                    paymentId: paymentId.trim() || undefined,
                    dob: dob.trim() || undefined,
                    memberStatus,
                    clubRole: clubRole === "none" ? "" : clubRole,
                    membershipStartDate: membershipStartDate || undefined,
                    trialStartDate: trialStartDate || undefined,
                    trialEndDate: trialEndDate || undefined,
                    ...(isSettingMember && membershipFee ? { membershipFee: parseFloat(membershipFee) } : {}),
                  })}
                  disabled={mutation.isPending}
                  className="w-full bg-navy text-white hover:bg-navy/90"
                >
                  {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Save changes
                </Button>
                <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>Cancel</Button>
              </div>
            </TabsContent>

            {/* ── Payments tab ─────────────────────────────── */}
            <TabsContent value="payments" className="space-y-3">
              {/* Balance summary */}
              <div className="rounded-lg border bg-muted/40 px-4 py-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <p className="text-xs text-white/60 mb-0.5">Paid</p>
                  <p className="font-semibold text-green-400">${totalPaid.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-white/60 mb-0.5">Charged</p>
                  <p className="font-semibold text-white">${totalCharged.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-white/60 mb-0.5">Balance</p>
                  <p className={`font-semibold ${balance >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {balance >= 0 ? `+$${balance.toFixed(2)}` : `-$${Math.abs(balance).toFixed(2)}`}
                  </p>
                </div>
              </div>

              {activityQuery.isLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
              ) : payments.length === 0 ? (
                <p className="text-sm text-white/60 text-center py-6">No payments found.</p>
              ) : (
                <div className="space-y-2">
                  {payments.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setEditingPayment({ id: p.id, paymentId: p.paymentId ?? "", reference: p.reference ?? "", amount: p.amount, date: p.date ?? "", email: p.email ?? "" })}
                      className="w-full text-left rounded-lg border bg-card px-3 py-2.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-green-400">${(p.amount ?? 0).toFixed(2)}</span>
                        <span className="text-xs text-white/60">{formatPaymentDate(p.date ?? "")}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs text-white/60 font-mono">{p.paymentId || p.reference || "—"}</span>
                        <Pencil className="w-3 h-3 text-muted-foreground/50" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Sign-ups tab ─────────────────────────────── */}
            <TabsContent value="signups" className="space-y-3">
              <div className="rounded-lg border bg-muted/40 px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-white/60">{signups.length} sign-up{signups.length !== 1 ? "s" : ""}</span>
                <span className="font-semibold text-white">Total charged: ${totalCharged.toFixed(2)}</span>
              </div>

              {activityQuery.isLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
              ) : signups.length === 0 ? (
                <p className="text-sm text-white/60 text-center py-6">No sign-ups found.</p>
              ) : (
                <div className="space-y-2">
                  {signups.map((s, idx) => (
                    <div key={idx} className="rounded-lg border bg-card px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-white">{s.dateOfTraining || "—"}</span>
                        <span className="text-sm font-semibold">${(s.actualFees ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs text-white/60">{s.activity || "—"}{s.pool ? ` · ${s.pool}` : ""}</span>
                        {s.memberOnTrainingDate && (
                          <span className="text-xs text-white/60">{s.memberOnTrainingDate}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {editingPayment && (
        <EditPaymentSheet
          open={!!editingPayment}
          onOpenChange={(v) => { if (!v) setEditingPayment(null); }}
          payment={editingPayment}
          onDone={() => { setEditingPayment(null); activityQuery.refetch(); }}
        />
      )}
    </>
  );
}

// ─── EditPaymentSheet ─────────────────────────────────────────────────────────

interface EditPaymentSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: { id: number; paymentId: string; reference: string; amount: number; date: string; email: string };
  onDone: () => void;
}

function EditPaymentSheet({ open, onOpenChange, payment, onDone }: EditPaymentSheetProps) {
  const utils = trpc.useUtils();
  const [paymentId, setPaymentId] = useState(payment.paymentId);
  const [amount, setAmount] = useState(String(payment.amount));
  const [email, setEmail] = useState(payment.email);
  const [date, setDate] = useState(payment.date);

  useEffect(() => {
    setPaymentId(payment.paymentId);
    setAmount(String(payment.amount));
    setEmail(payment.email);
    setDate(payment.date);
  }, [payment]);

  const mutation = trpc.admin.editPayment.useMutation({
    onSuccess: async () => {
      toast.success("Payment updated.");
      await utils.admin.allPayments.invalidate();
      onOpenChange(false);
      onDone();
    },
    onError: (err) => toast.error(err.message || "Failed to update payment."),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-navy">Edit payment</SheetTitle>
        </SheetHeader>

        <div className="space-y-1 mb-5">
          <p className="text-xs text-muted-foreground font-mono truncate">{payment.reference || "(no reference)"}</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Payment ID Match</Label>
            <Input
              placeholder="e.g. jtan"
              value={paymentId}
              onChange={e => setPaymentId(e.target.value)}
              className="h-10 font-mono"
            />
            <p className="text-xs text-muted-foreground">The user's payment ID this payment is matched to.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Email</Label>
            <Input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Amount ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Date</Label>
              <Input
                value={date}
                onChange={e => setDate(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <Button
            onClick={() => mutation.mutate({
              id: payment.id,
              paymentId: paymentId.trim(),
              email: email.trim(),
              amount: parseFloat(amount) || 0,
              date: date.trim(),
            })}
            disabled={mutation.isPending}
            className="w-full bg-navy text-white hover:bg-navy/90"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save changes
          </Button>
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── AddSessionSheet ──────────────────────────────────────────────────────────

interface AddSessionSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}

const DEFAULT_SESSION = {
  trainingDate: "",
  trainingTime: "",
  pool: "",
  memberFee: "",
  nonMemberFee: "",
  memberSwimFee: "",
  nonMemberSwimFee: "",
  studentFee: "",
  studentSwimFee: "",
  trainerFee: "",
  notes: "",
  trainingObjective: "",
};

function AddSessionSheet({ open, onOpenChange, onDone }: AddSessionSheetProps) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState(DEFAULT_SESSION);

  const mutation = trpc.admin.addSession.useMutation({
    onSuccess: async () => {
      toast.success("Session added.");
      await utils.admin.allSessions.invalidate();
      setForm(DEFAULT_SESSION);
      onOpenChange(false);
      onDone();
    },
    onError: (err) => toast.error(err.message || "Failed to add session."),
  });

  const set = (field: keyof typeof DEFAULT_SESSION) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = () => {
    if (!form.trainingDate || !form.pool || !form.trainingTime) {
      toast.error("Date, pool, and time are required.");
      return;
    }
    const parseFee = (s: string) => parseFloat(s) || 0;
    mutation.mutate({
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
          <SheetTitle className="text-navy">Add session</SheetTitle>
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
            <Label className="text-xs font-medium text-muted-foreground">Training objective</Label>
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
            Add session
          </Button>
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const IMPORT_PIN = "1987";
const IMPORT_TABS = ["sessions", "signups", "users", "payments"] as const;

function SpreadsheetImportPanel({ forceSyncMutation }: { forceSyncMutation: ReturnType<typeof trpc.admin.forceSync.useMutation> }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [pinError, setPinError] = useState(false);

  function handlePinSubmit() {
    if (pin === IMPORT_PIN) {
      setUnlocked(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPin("");
    }
  }

  function handleClose() {
    setOpen(false);
    setUnlocked(false);
    setPin("");
    setPinError(false);
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#1E1E1E] rounded-xl text-white/60 text-[13px] hover:bg-[#252525] transition-colors"
      >
        <span className="flex items-center gap-2">
          <KeyRound className="w-4 h-4" />
          Spreadsheet Import
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="bg-[#1E1E1E] rounded-xl px-4 pb-4 pt-2 mt-0.5 space-y-3">
          {!unlocked ? (
            /* PIN entry */
            <div className="space-y-2 pt-2">
              <p className="text-[12px] text-[#888888]">Enter PIN to access import tools</p>
              <div className="flex gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={pin}
                  onChange={e => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(false); }}
                  onKeyDown={e => e.key === "Enter" && handlePinSubmit()}
                  className={`flex-1 h-10 rounded-lg bg-[#2a2a2a] border text-white text-center text-[18px] tracking-[0.4em] outline-none focus:border-[#2196F3] ${pinError ? "border-red-500" : "border-white/10"}`}
                />
                <button
                  onClick={handlePinSubmit}
                  className="h-10 px-4 rounded-lg bg-[#2196F3] text-white text-[13px] font-medium"
                >
                  Unlock
                </button>
              </div>
              {pinError && <p className="text-[12px] text-red-400">Incorrect PIN</p>}
            </div>
          ) : (
            /* Unlocked — show import buttons */
            <>
              <div className="flex items-start gap-2 pt-2">
                <AlertTriangle className="w-4 h-4 text-[#F5C518] mt-0.5 shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-white">Import from Google Sheets</p>
                  <p className="text-[12px] text-[#888888] mt-0.5 leading-snug">
                    Replaces all existing DB records for the selected tab with live data from the Sheet. Cannot be undone.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {IMPORT_TABS.map((tab) => (
                  <AlertDialog key={tab}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 text-xs gap-1.5 capitalize border-white/10 text-white/70"
                        disabled={forceSyncMutation.isPending}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Import {tab}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Import {tab} from Sheets?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will <strong>delete all current {tab} records</strong> in the database and replace them with data pulled live from Google Sheets. Any changes made in the app since the last import will be lost.
                          <br /><br />
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-white hover:bg-destructive/90"
                          onClick={() => forceSyncMutation.mutate({ tab })}
                        >
                          Yes, import {tab}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ))}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 text-xs gap-1.5 col-span-2 border-[#F44336]/40 text-[#F44336]"
                      disabled={forceSyncMutation.isPending}
                    >
                      {forceSyncMutation.isPending
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RefreshCw className="w-3.5 h-3.5" />}
                      Import all tabs
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Import all tabs from Sheets?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will <strong>delete and replace all records</strong> for sessions, sign-ups, users, and payments in the database with live data pulled from Google Sheets.
                        <br /><br />
                        Any changes made in the app since the last import will be lost. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-white hover:bg-destructive/90"
                        onClick={() => forceSyncMutation.mutate({ tab: "all" })}
                      >
                        Yes, import everything
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <button onClick={handleClose} className="text-[11px] text-white/30 hover:text-white/50 pt-1">
                Lock
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [, navigate] = useLocation();

  const clubRole = (user as any)?.clubRole || "";
  const isAdmin = clubRole === "Admin";
  const isAdminOrHelper = isAdmin || clubRole === "Helper";

  useEffect(() => {
    if (!loading && user && !isAdminOrHelper) navigate("/");
  }, [loading, user, isAdminOrHelper, navigate]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");
  const [sessionMonthFilter, setSessionMonthFilter] = useState("All");
  const [sessionPoolFilter, setSessionPoolFilter] = useState("All");
  const [sessionDayFilter, setSessionDayFilter] = useState("All");
  const [sessionStatusFilter, setSessionStatusFilter] = useState("All");
  const [editingUser, setEditingUser] = useState<{ name: string; email: string; paymentId: string; memberStatus: string; clubRole: string; membershipStartDate: string; trialStartDate: string; trialEndDate: string; dob: string } | null>(null);
  const [editingSession, setEditingSession] = useState<SessionForEdit | null>(null);
  const [viewingSessionRowId, setViewingSessionRowId] = useState<string | null>(null);
  const [editingAttendeeId, setEditingAttendeeId] = useState<number | null>(null);
  const [editingPayment, setEditingPayment] = useState<{ id: number; paymentId: string; reference: string; amount: number; date: string; email: string } | null>(null);
  const [addSessionOpen, setAddSessionOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data: users, isLoading: usersLoading } = trpc.admin.allUsers.useQuery(undefined, {
    enabled: isAdminOrHelper,
  });
  const { data: payments, isLoading: paymentsLoading, isFetching: paymentsRefetching, refetch: refetchPayments } = trpc.admin.allPayments.useQuery(undefined, {
    enabled: isAdminOrHelper,
    refetchInterval: 30 * 1000,
  });
  const { data: sessions, isLoading: sessionsLoading } = trpc.admin.allSessions.useQuery(undefined, {
    enabled: isAdmin,
  });

  const closeSessionMutation = trpc.admin.closeSession.useMutation({
    onSuccess: async () => {
      toast.success("Session closed.");
      await utils.admin.allSessions.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to close session."),
  });

  const forceSyncMutation = trpc.admin.forceSync.useMutation({
    onSuccess: async (data) => {
      toast.success(`Synced ${data.tab} from Sheets.`);
      await utils.admin.allSessions.invalidate();
    },
    onError: (err) => toast.error(err.message || "Sync failed."),
  });

  const { data: attendees, isLoading: attendeesLoading } = trpc.admin.sessionAttendees.useQuery(
    { rowId: viewingSessionRowId ?? "" },
    { enabled: !!viewingSessionRowId }
  );

  const [addingAttendee, setAddingAttendee] = useState(false);

  const editSignupMutation = trpc.admin.editSignup.useMutation({
    onSuccess: async () => {
      toast.success("Sign-up updated.");
      setEditingAttendeeId(null);
      await utils.admin.sessionAttendees.invalidate({ rowId: viewingSessionRowId ?? "" });
      await utils.admin.allSessions.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to update sign-up."),
  });

  const addSignupMutation = trpc.admin.addSignup.useMutation({
    onSuccess: async () => {
      toast.success("Attendee added.");
      setAddingAttendee(false);
      await utils.admin.sessionAttendees.invalidate({ rowId: viewingSessionRowId ?? "" });
      await utils.admin.allSessions.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to add attendee."),
  });

  const deleteUserMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: async () => {
      toast.success("User deleted.");
      await utils.admin.allUsers.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to delete user."),
  });

  const deleteSignupMutation = trpc.admin.deleteSignup.useMutation({
    onSuccess: async () => {
      toast.success("Sign-up deleted.");
      setEditingAttendeeId(null);
      await utils.admin.sessionAttendees.invalidate({ rowId: viewingSessionRowId ?? "" });
      await utils.admin.allSessions.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to delete sign-up."),
  });

  const editingAttendee = editingAttendeeId != null ? attendees?.find(a => a.id === editingAttendeeId) : null;

  const statusCounts = useMemo(() => {
    if (!users) return {} as Record<string, number>;
    const counts: Record<string, number> = { All: users.length };
    for (const u of users) {
      const s = u.memberStatus || "Non-Member";
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [users]);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    let result = [...users].reverse(); // newest accounts first (reverse DB insertion order)
    if (statusFilter !== "All") {
      result = result.filter(u => (u.memberStatus || "Non-Member") === statusFilter);
    }
    const q = search.toLowerCase().trim();
    if (!q) return result;
    return result.filter(u =>
      (u.name  || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.userEmail || "").toLowerCase().includes(q)
    );
  }, [users, search, statusFilter]);

  const filteredPayments = useMemo(() => {
    if (!payments) return [];
    const q = paymentSearch.toLowerCase().trim();
    const result = q
      ? payments.filter(p =>
          p.paymentId.toLowerCase().includes(q) ||
          ((p as any).reference || "").toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q)
        )
      : payments;
    // Ensure most-recent first after any filtering
    return [...result].sort((a, b) =>
      (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0)
    );
  }, [payments, paymentSearch]);

  const sessionMeta = useMemo(() => {
    if (!sessions) return { months: [] as string[], pools: [] as string[], days: [] as string[] };
    const monthSet = new Set<string>();
    const poolSet = new Set<string>();
    const daySet = new Set<string>();
    for (const s of sessions) {
      const d = new Date(s.trainingDate);
      if (!isNaN(d.getTime())) monthSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      if (s.pool) poolSet.add(s.pool);
      if (s.day) daySet.add(s.day);
    }
    const dayOrder = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    return {
      months: [...monthSet].sort().reverse(),
      pools: [...poolSet].sort(),
      days: [...daySet].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b)),
    };
  }, [sessions]);

  const isSessionsFiltered = !!(
    sessionSearch ||
    sessionMonthFilter !== "All" ||
    sessionPoolFilter !== "All" ||
    sessionDayFilter !== "All" ||
    sessionStatusFilter !== "All"
  );

  // Returns the filtered + sorted flat list (used when filters are active)
  // and the three named groups (used when no filters are active).
  const { filteredSessions, sessionGroups } = useMemo(() => {
    if (!sessions) return { filteredSessions: sessions, sessionGroups: null };

    let result = sessions;
    if (sessionSearch) {
      const q = sessionSearch.toLowerCase();
      result = result.filter(s =>
        s.trainingDate.toLowerCase().includes(q) ||
        s.pool.toLowerCase().includes(q) ||
        s.day.toLowerCase().includes(q)
      );
    }
    if (sessionMonthFilter !== "All") {
      result = result.filter(s => {
        const d = new Date(s.trainingDate);
        if (isNaN(d.getTime())) return false;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === sessionMonthFilter;
      });
    }
    if (sessionPoolFilter !== "All") result = result.filter(s => s.pool === sessionPoolFilter);
    if (sessionDayFilter !== "All") result = result.filter(s => s.day === sessionDayFilter);
    if (sessionStatusFilter === "Open") result = result.filter(s => !s.isClosed || s.isClosed.trim() === "");
    else if (sessionStatusFilter === "Closed") result = result.filter(s => s.isClosed && s.isClosed.trim() !== "");

    const dateMs = (s: typeof result[number]) => new Date(s.trainingDate).getTime() || 0;
    const past     = result.filter(s =>  isPastSession(s)).sort((a, b) => dateMs(b) - dateMs(a));
    const upcoming = result.filter(s => !isPastSession(s)).sort((a, b) => dateMs(a) - dateMs(b));

    const recent       = past.slice(0, 2);
    const upcomingTop  = upcoming.slice(0, 4);
    const pinnedSet    = new Set([...recent, ...upcomingTop].map(s => s.rowId));
    const all          = result.filter(s => !pinnedSet.has(s.rowId)).sort((a, b) => dateMs(a) - dateMs(b));

    const flat = [...recent, ...upcomingTop, ...all];

    return {
      filteredSessions: flat,
      sessionGroups: [
        { label: "Recent",   items: recent },
        { label: "Upcoming", items: upcomingTop },
        { label: "All",      items: all },
      ].filter(g => g.items.length > 0),
    };
  }, [sessions, sessionSearch, sessionMonthFilter, sessionPoolFilter, sessionDayFilter, sessionStatusFilter]);

  if (loading || !user || !isAdminOrHelper) return null;

  return (
    <div className="min-h-screen bg-background pb-32">
      <AppHeader title="Admin" />

      <main className="mx-auto max-w-[480px] px-4 py-4">
        <Tabs defaultValue="members">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="members" className="flex-1">Members</TabsTrigger>
            <TabsTrigger value="payments" className="flex-1">Payments</TabsTrigger>
            {isAdmin && <TabsTrigger value="sessions" className="flex-1">Sessions</TabsTrigger>}
            {isAdmin && <TabsTrigger value="data" className="flex-1">Data</TabsTrigger>}
          </TabsList>

          {/* ── Members tab ─────────────────────────────────────────── */}
          <TabsContent value="members" className="space-y-3">
            <Input
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-10"
            />

            {/* Status filter chips */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
              {(["All", "Member", "Trial", "Student", "Non-Member"] as const).map(s => {
                const active = statusFilter === s;
                const colorMap: Record<string, string> = {
                  All: "bg-navy text-white",
                  Member: "bg-green-500 text-white",
                  Trial: "bg-amber-400 text-navy",
                  Student: "bg-blue-500 text-white",
                  "Non-Member": "bg-slate-500 text-white",
                };
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                      active
                        ? `${colorMap[s]} border-transparent`
                        : "bg-background text-muted-foreground border-border hover:border-navy/40"
                    }`}
                  >
                    {s}{statusCounts[s] !== undefined ? ` (${statusCounts[s]})` : ""}
                  </button>
                );
              })}
            </div>

            {usersLoading && (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            )}

            {filteredUsers.map((u, idx) => {
              const displayEmail = u.email || u.userEmail || "";
              // Only allow editing if we have a valid email — the server requires one
              const canEdit = isAdmin && !!displayEmail;
              return (
                <button
                  key={displayEmail || `user-${idx}`}
                  onClick={() => canEdit ? setEditingUser({ name: u.name || "", email: displayEmail, paymentId: u.paymentId || "", memberStatus: u.memberStatus || "Non-Member", clubRole: u.clubRole || "", membershipStartDate: (u as any).membershipStartDate || "", trialStartDate: (u as any).trialStartDate || "", trialEndDate: (u as any).trialEndDate || "", dob: (u as any).dob || "" }) : undefined}
                  className={`w-full text-left rounded-lg border bg-card px-4 py-3 space-y-1 transition-colors ${canEdit ? "hover:bg-muted/50 active:bg-muted cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-white truncate">{u.name || "(no name)"}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {u.clubRole && (
                        <Badge className="text-xs bg-navy text-white hover:bg-navy">{u.clubRole}</Badge>
                      )}
                      <Badge className={`text-xs ${STATUS_COLORS[u.memberStatus] || STATUS_COLORS["Non-Member"]} hover:opacity-100`}>
                        {u.memberStatus || "Non-Member"}
                      </Badge>
                      {!canEdit && <Lock className="w-3 h-3 text-muted-foreground" />}
                      {isAdmin && displayEmail && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              onClick={e => e.stopPropagation()}
                              className="ml-1 p-1 rounded hover:bg-destructive/20 transition-colors"
                              aria-label="Delete user"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-destructive/70 hover:text-destructive" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete user?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently remove <strong>{u.name || displayEmail}</strong> ({displayEmail}) from the app. Their sign-up history and payment records will remain. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-white hover:bg-destructive/90"
                                onClick={() => deleteUserMutation.mutate({ email: displayEmail })}
                              >
                                Delete user
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-white/60">{displayEmail || "(no email)"}</p>
                  {/* Show trial / membership dates under the email */}
                  {(u as any).trialEndDate && (u as any).trialEndDate !== "NA" && (
                    <p className="text-xs text-white/40">
                      Trial ends: {formatDisplayDate((u as any).trialEndDate)}
                    </p>
                  )}
                  {(u as any).membershipStartDate && (u as any).membershipStartDate !== "NA" && (
                    <p className="text-xs text-white/40">
                      Member since: {formatDisplayDate((u as any).membershipStartDate)}
                    </p>
                  )}
                </button>
              );
            })}

            {!usersLoading && filteredUsers.length === 0 && (
              <p className="text-center text-sm text-white/60 py-8">No users found.</p>
            )}
          </TabsContent>

          {/* ── Payments tab ────────────────────────────────────────── */}
          <TabsContent value="payments" className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Search by reference, ID, or email…"
                value={paymentSearch}
                onChange={e => setPaymentSearch(e.target.value)}
                className="h-10"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => refetchPayments()}
                disabled={paymentsRefetching}
                title="Refresh payments"
              >
                <RefreshCw className={`w-4 h-4 ${paymentsRefetching ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {paymentsLoading && (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            )}

            {!paymentsLoading && filteredPayments.length === 0 && (
              <p className="text-center text-sm text-white/60 py-8">No payments found.</p>
            )}

            {filteredPayments.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <div className="bg-muted/50 grid grid-cols-[1fr_auto] px-4 py-2 text-xs font-medium text-white/70 border-b">
                  <span>Reference / Payment ID</span>
                  <span className="text-right">Amount · Date</span>
                </div>
                <div className="divide-y">
                  {filteredPayments.map((p, i) => {
                    const canEditPayment = isAdmin && (p as any).id != null;
                    return (
                      <button
                        key={i}
                        onClick={() => canEditPayment ? setEditingPayment({ id: (p as any).id, paymentId: p.paymentId, reference: (p as any).reference || "", amount: p.amount, date: p.date, email: p.email }) : undefined}
                        className={`w-full text-left px-4 py-2.5 flex items-start justify-between gap-3 ${canEditPayment ? "hover:bg-muted/50 transition-colors" : ""}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-white truncate">{(p as any).reference || p.paymentId || "—"}</p>
                          {p.paymentId ? (
                            <p className="text-xs text-white/60 mt-0.5">
                              ID: <span className="font-mono">{p.paymentId}</span>
                            </p>
                          ) : (
                            <p className="text-xs text-amber-600 mt-0.5">Unmatched</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-green-400 tabular-nums">{`$${p.amount.toFixed(2)}`}</p>
                          <p className="text-xs text-white/60">{formatPaymentDate(p.date)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Sessions tab (Admin only) ────────────────────────────── */}
          {isAdmin && (
            <TabsContent value="sessions" className="space-y-3">
              <div className="flex gap-2">
                <Button
                  onClick={() => setAddSessionOpen(true)}
                  className="flex-1 bg-navy text-white hover:bg-navy/90 h-10"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add session
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 px-3"
                  disabled={forceSyncMutation.isPending}
                  onClick={() => forceSyncMutation.mutate({ tab: "sessions" })}
                  title="Re-sync sessions from Google Sheets"
                >
                  {forceSyncMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
              </div>

              <Input
                placeholder="Search by date, pool, or day…"
                value={sessionSearch}
                onChange={e => setSessionSearch(e.target.value)}
                className="h-10"
              />

              <div className="grid grid-cols-2 gap-2">
                <Select value={sessionMonthFilter} onValueChange={setSessionMonthFilter}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="All months" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All months</SelectItem>
                    {sessionMeta.months.map(m => (
                      <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={sessionPoolFilter} onValueChange={setSessionPoolFilter}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="All pools" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All pools</SelectItem>
                    {sessionMeta.pools.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={sessionDayFilter} onValueChange={setSessionDayFilter}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="All days" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All days</SelectItem>
                    {sessionMeta.days.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex gap-1">
                  {["All", "Open", "Closed"].map(s => (
                    <button
                      key={s}
                      onClick={() => setSessionStatusFilter(s)}
                      className={`flex-1 h-9 rounded-md text-xs font-medium border transition-colors ${
                        sessionStatusFilter === s
                          ? "bg-navy text-white border-navy"
                          : "bg-background text-muted-foreground border-border hover:border-navy/40"
                      }`}
                    >{s}</button>
                  ))}
                </div>
              </div>

              {sessionsLoading && (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              )}

              {!sessionsLoading && filteredSessions && filteredSessions.length === 0 && (
                <p className="text-center text-sm text-white/60 py-8">No sessions found.</p>
              )}

              {/* ── Grouped view (no filters active) ── */}
              {!isSessionsFiltered && sessionGroups && sessionGroups.map(({ label, items }) => (
                <div key={label}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 mb-2 mt-4 first:mt-0">
                    {label}
                  </p>
                  {items.map((s) => {
                    const isClosed = s.isClosed && s.isClosed.trim().length > 0;
                    return (
                      <div
                        key={s.rowId}
                        className="rounded-lg border bg-card px-4 py-3 cursor-pointer hover:bg-white/5 active:bg-white/8 transition-colors mb-2"
                        onClick={() => setViewingSessionRowId(s.rowId)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-white truncate">
                              {s.day} — {s.trainingDate}
                            </p>
                            <p className="text-xs text-white/60">{s.pool} · {s.trainingTime}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingSession(s)}>
                              <Pencil className="w-3 h-3 mr-1" />Edit
                            </Button>
                            {isClosed ? (
                              <Badge variant="destructive" className="text-xs">Closed</Badge>
                            ) : (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10" disabled={closeSessionMutation.isPending}>Close</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Close session?</AlertDialogTitle>
                                    <AlertDialogDescription>This will prevent new sign-ups for {s.trainingDate} at {s.pool}. This cannot be undone here.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => closeSessionMutation.mutate({ rowId: s.rowId })}>Close session</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* ── Flat view (filters active) ── */}
              {isSessionsFiltered && filteredSessions && filteredSessions.map((s) => {
                const isClosed = s.isClosed && s.isClosed.trim().length > 0;
                return (
                  <div
                    key={s.rowId}
                    className="rounded-lg border bg-card px-4 py-3 cursor-pointer hover:bg-white/5 active:bg-white/8 transition-colors"
                    onClick={() => setViewingSessionRowId(s.rowId)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-white truncate">
                          {s.day} — {s.trainingDate}
                        </p>
                        <p className="text-xs text-white/60">{s.pool} · {s.trainingTime}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setEditingSession(s)}
                        >
                          <Pencil className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        {isClosed ? (
                          <Badge variant="destructive" className="text-xs">Closed</Badge>
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                                disabled={closeSessionMutation.isPending}
                              >
                                Close
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Close session?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will prevent new sign-ups for {s.trainingDate} at {s.pool}. This cannot be undone here.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                  onClick={() => closeSessionMutation.mutate({ rowId: s.rowId })}
                                >
                                  Close session
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                    {s.trainingObjective && (
                      <p className="text-xs text-white/60 mt-1 truncate">{s.trainingObjective}</p>
                    )}
                  </div>
                );
              })}

            </TabsContent>
          )}

          {/* ── Data tab (Admin only) ────────────────────────────────── */}
          {isAdmin && (
            <TabsContent value="data" className="space-y-4">
              {(() => {
                // Only include completed (past) sessions in all Data tab calculations
                const pastSess = (sessions ?? []).filter(s => isPastSession({
                  trainingDate: s.trainingDate,
                  trainingTime: s.trainingTime,
                  isClosed: s.isClosed,
                }));
                const totalRevenue = pastSess.reduce((s, sess) => s + ((sess as any).revenue ?? 0), 0);
                const totalCost    = pastSess.reduce((s, sess) => s + ((sess as any).venueCost ?? 0), 0);
                const overallPnL   = totalRevenue - totalCost;
                // Latest session first
                const sortedSess   = [...pastSess].sort((a, b) =>
                  (new Date(b.trainingDate).getTime() || 0) - (new Date(a.trainingDate).getTime() || 0)
                );

                return (
                  <>
                    {/* Overall PnL summary card */}
                    <div className="bg-[#1E1E1E] rounded-xl px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-1">Overall PnL</p>
                      <p className={`text-[22px] font-semibold ${overallPnL >= 0 ? "text-[#4CAF50]" : "text-[#F44336]"}`}>
                        {overallPnL >= 0 ? "+" : ""}${overallPnL.toFixed(2)}
                      </p>
                      <p className="text-[13px] text-[#888888] mt-1">
                        Revenue ${totalRevenue.toFixed(2)} · Cost ${totalCost.toFixed(2)}
                      </p>
                    </div>

                    {/* Per-session PnL table */}
                    {sessionsLoading && (
                      <div className="space-y-2">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                      </div>
                    )}

                    {!sessionsLoading && sortedSess.length === 0 && (
                      <p className="text-center text-sm text-white/60 py-8">No session data yet.</p>
                    )}

                    {sortedSess.length > 0 && (
                      <div className="bg-[#1E1E1E] rounded-xl overflow-hidden divide-y divide-[#2C2C2C]">
                        {sortedSess.map((s) => {
                          const revenue  = (s as any).revenue ?? 0;
                          const cost     = (s as any).venueCost ?? 0;
                          const pnl      = revenue - cost;
                          const isRainOff = (s as any).rainOff && String((s as any).rainOff).trim().length > 0;
                          const attendance = (s as any).attendance ?? 0;
                          return (
                            <button
                              key={s.rowId}
                              onClick={() => setEditingSession(s as any)}
                              className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-white/4 active:bg-white/6 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-[14px] text-white truncate">
                                  {s.trainingDate}
                                  {isRainOff && (
                                    <span className="ml-2 text-[11px] font-medium text-[#F5C518] bg-[#3D3500] px-1.5 py-0.5 rounded">
                                      Rain
                                    </span>
                                  )}
                                </p>
                                <p className="text-[13px] text-[#888888]">
                                  {s.day} · {attendance} {attendance === 1 ? "attendee" : "attendees"}
                                </p>
                              </div>
                              <p className={`text-[14px] font-medium shrink-0 ${pnl > 0 ? "text-[#4CAF50]" : pnl < 0 ? "text-[#F44336]" : "text-[#888888]"}`}>
                                {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Spreadsheet Import — PIN-gated */}
              <SpreadsheetImportPanel forceSyncMutation={forceSyncMutation} />

            </TabsContent>
          )}
        </Tabs>
      </main>

      {editingUser && (
        <EditUserSheet
          open={!!editingUser}
          onOpenChange={(v) => { if (!v) setEditingUser(null); }}
          user={editingUser}
          onDone={() => setEditingUser(null)}
        />
      )}

      <AddSessionSheet
        open={addSessionOpen}
        onOpenChange={setAddSessionOpen}
        onDone={() => {}}
      />

      {editingSession && (
        <EditSessionSheet
          open={!!editingSession}
          onOpenChange={(v) => { if (!v) setEditingSession(null); }}
          session={editingSession}
          onDone={() => setEditingSession(null)}
        />
      )}

      {editingPayment && (
        <EditPaymentSheet
          open={!!editingPayment}
          onOpenChange={(v) => { if (!v) setEditingPayment(null); }}
          payment={editingPayment}
          onDone={() => setEditingPayment(null)}
        />
      )}

      {/* ── Session Attendees Sheet ───────────────────────────────────── */}
      <Sheet open={!!viewingSessionRowId} onOpenChange={(v) => { if (!v) { setViewingSessionRowId(null); setEditingAttendeeId(null); setAddingAttendee(false); } }}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto bg-[#2A2A2A] border-t border-white/8 px-0">
          <SheetHeader className="px-4 pb-2">
            <SheetTitle className="text-[15px] font-medium text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#2196F3]" />
                Attendees
              </span>
              <button
                onClick={() => { setAddingAttendee(true); setEditingAttendeeId(null); }}
                className="flex items-center gap-1 text-[13px] text-[#2196F3] font-medium pr-1"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </SheetTitle>
          </SheetHeader>
          <div className="pb-8">
            {/* ── Add attendee form ── */}
            {addingAttendee && (
              <AdminAddAttendee
                onSave={(fields) => addSignupMutation.mutate({ rowId: viewingSessionRowId!, ...fields })}
                onCancel={() => setAddingAttendee(false)}
                isSaving={addSignupMutation.isPending}
              />
            )}
            {attendeesLoading && (
              <div className="space-y-2 px-4">
                {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-[#1E1E1E] animate-pulse" />)}
              </div>
            )}
            {!attendeesLoading && (!attendees || attendees.length === 0) && (
              <div className="px-4 py-8 text-center">
                <Users className="w-8 h-8 text-white/20 mx-auto mb-2" />
                <p className="text-[13px] text-[#888888]">No sign-ups for this session.</p>
              </div>
            )}
            {attendees && attendees.length > 0 && (
              <div className="mx-4 bg-[#1E1E1E] rounded-xl overflow-hidden divide-y divide-[#2C2C2C]">
                {attendees.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setEditingAttendeeId(a.id)}
                    className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:bg-white/8 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] text-white font-medium truncate">{a.name || a.email}</p>
                      <p className="text-[12px] text-[#888888]">{a.activity}{a.activityValue ? ` · ${a.activityValue}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-[13px] font-medium ${(a.actualFees ?? 0) < 0 ? "text-[#4CAF50]" : "text-white"}`}>
                        {(a.actualFees ?? 0) < 0 ? "" : ""}${(a.actualFees ?? 0).toFixed(2)}
                      </p>
                      <p className="text-[11px] text-[#888888]">{a.memberOnTrainingDate || "—"}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {attendees && attendees.length > 0 && (
              <p className="text-[12px] text-[#888888] text-center mt-3">
                {attendees.length} sign-up{attendees.length !== 1 ? "s" : ""} ·{" "}
                Total collected: ${attendees.reduce((s, a) => s + (a.actualFees ?? 0), 0).toFixed(2)}
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Edit Attendee Sheet ───────────────────────────────────────── */}
      <Sheet open={!!editingAttendee} onOpenChange={(v) => { if (!v) setEditingAttendeeId(null); }}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto bg-[#2A2A2A] border-t border-white/8 px-0">
          <SheetHeader className="px-4 pb-2">
            <SheetTitle className="text-[15px] font-medium text-white">Edit sign-up</SheetTitle>
          </SheetHeader>
          {editingAttendee && (
            <AdminEditAttendee
              attendee={editingAttendee}
              onSave={(updates) => editSignupMutation.mutate({ id: editingAttendee.id, ...updates })}
              onDelete={() => deleteSignupMutation.mutate({ id: editingAttendee.id })}
              isSaving={editSignupMutation.isPending}
              isDeleting={deleteSignupMutation.isPending}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Admin Add Attendee inline component ─────────────────────────────────────

function AdminAddAttendee({
  onSave,
  onCancel,
  isSaving,
}: {
  onSave: (fields: { name: string; email: string; paymentId: string; activity: string; actualFees: number; memberOnTrainingDate: string }) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    paymentId: "",
    activity: "Regular Training",
    actualFees: "",
    memberOnTrainingDate: "Non-Member",
  });
  const set = (f: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [f]: e.target.value }));

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("Name is required."); return; }
    if (!form.paymentId.trim()) { toast.error("Payment ID is required."); return; }
    if (!form.activity.trim()) { toast.error("Activity is required."); return; }
    onSave({
      name: form.name.trim(),
      email: form.email.trim(),
      paymentId: form.paymentId.trim(),
      activity: form.activity.trim(),
      actualFees: parseFloat(form.actualFees) || 0,
      memberOnTrainingDate: form.memberOnTrainingDate.trim() || "Non-Member",
    });
  };

  return (
    <div className="mx-4 mb-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#2196F3] mb-2">New attendee</p>
      <div className="bg-[#1E1E1E] rounded-xl overflow-hidden divide-y divide-[#2C2C2C]">
        {[
          { label: "Name *",       field: "name"               as const },
          { label: "Payment ID *", field: "paymentId"          as const },
          { label: "Email",        field: "email"              as const },
          { label: "Activity *",   field: "activity"           as const },
          { label: "Actual fee",   field: "actualFees"         as const, type: "number" },
          { label: "Member status",field: "memberOnTrainingDate" as const },
        ].map(({ label, field, type }) => (
          <div key={field} className="flex items-center gap-3 px-4 min-h-[48px]">
            <span className="text-[14px] text-[#888888] w-28 shrink-0">{label}</span>
            <input
              type={type ?? "text"}
              value={form[field]}
              onChange={set(field)}
              step={type === "number" ? "0.01" : undefined}
              placeholder={field === "memberOnTrainingDate" ? "Non-Member" : ""}
              className={`flex-1 bg-transparent text-[14px] text-white outline-none py-2 placeholder:text-white/25${field === "paymentId" ? " font-mono" : ""}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex-1 h-[44px] rounded-full bg-[#2196F3] text-white font-medium text-[14px] disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isSaving ? "Adding…" : "Add attendee"}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 h-[44px] rounded-full border-[1.5px] border-[#888888] text-white font-medium text-[14px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Admin Edit Attendee inline component ─────────────────────────────────────

type AttendeeRow = {
  id: number;
  name: string | null;
  email: string | null;
  paymentId: string | null;
  activity: string | null;
  activityValue: string | null;
  baseFee: number | null;
  actualFees: number | null;
  memberOnTrainingDate: string | null;
};

function AdminEditAttendee({
  attendee,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: {
  attendee: AttendeeRow;
  onSave: (u: { name?: string; email?: string; paymentId?: string; activity?: string; activityValue?: string; baseFee?: number; actualFees?: number; memberOnTrainingDate?: string }) => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}) {
  const [form, setForm] = useState({
    name: attendee.name ?? "",
    email: attendee.email ?? "",
    paymentId: attendee.paymentId ?? "",
    activity: attendee.activity ?? "",
    activityValue: attendee.activityValue ?? "",
    baseFee: String(attendee.baseFee ?? 0),
    actualFees: String(attendee.actualFees ?? 0),
    memberOnTrainingDate: attendee.memberOnTrainingDate ?? "",
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (f: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [f]: e.target.value }));

  return (
    <div className="pb-8">
      <div className="bg-[#1E1E1E] rounded-xl mx-4 overflow-hidden divide-y divide-[#2C2C2C]">
        {[
          { label: "Name",         field: "name"               as const },
          { label: "Email",        field: "email"              as const },
          { label: "Payment ID",   field: "paymentId"          as const },
          { label: "Activity",     field: "activity"           as const },
          { label: "Activity val", field: "activityValue"      as const },
          { label: "Base fee",     field: "baseFee"            as const, type: "number" },
          { label: "Actual fee",   field: "actualFees"         as const, type: "number" },
          { label: "Member status",field: "memberOnTrainingDate" as const },
        ].map(({ label, field, type }) => (
          <div key={field} className="flex items-center gap-3 px-4 min-h-[48px]">
            <span className="text-[14px] text-[#888888] w-28 shrink-0">{label}</span>
            <input
              type={type ?? "text"}
              value={form[field]}
              onChange={set(field)}
              step={type === "number" ? "0.01" : undefined}
              className={`flex-1 bg-transparent text-[14px] text-white outline-none py-2${field === "paymentId" ? " font-mono" : ""}`}
            />
          </div>
        ))}
      </div>

      <div className="px-4 mt-5 space-y-2">
        <button
          onClick={() => onSave({
            name: form.name,
            email: form.email,
            paymentId: form.paymentId,
            activity: form.activity,
            activityValue: form.activityValue,
            baseFee: parseFloat(form.baseFee) || 0,
            actualFees: parseFloat(form.actualFees) || 0,
            memberOnTrainingDate: form.memberOnTrainingDate,
          })}
          disabled={isSaving}
          className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[15px] disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isSaving ? "Saving…" : "Save changes"}
        </button>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={isDeleting}
            className="w-full h-[48px] rounded-full border-[1.5px] border-[#F44336]/50 text-[#F44336] font-medium text-[15px] flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete sign-up
          </button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete sign-up?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete {attendee.name || attendee.email}'s sign-up record. Their debt balance will be adjusted accordingly. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={onDelete}
              >
                {isDeleting ? "Deleting…" : "Yes, delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
