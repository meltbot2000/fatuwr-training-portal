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
import { AlertTriangle, Loader2, Plus, Lock, RefreshCw, Pencil } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { EditSessionSheet, type SessionForEdit } from "@/components/EditSessionSheet";

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
  user: { name: string; email: string; paymentId: string; memberStatus: string; clubRole: string; trialStartDate: string; trialEndDate: string };
  onDone: () => void;
}

function EditUserSheet({ open, onOpenChange, user, onDone }: EditUserSheetProps) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(user.name || "");
  const [paymentId, setPaymentId] = useState(user.paymentId || "");
  const [memberStatus, setMemberStatus] = useState(user.memberStatus || "Non-Member");
  const [clubRole, setClubRole] = useState(user.clubRole || "none");
  const [trialStartDate, setTrialStartDate] = useState(user.trialStartDate || "");
  const [trialEndDate, setTrialEndDate] = useState(user.trialEndDate || "");
  const [membershipFee, setMembershipFee] = useState("");

  useEffect(() => {
    setName(user.name || "");
    setPaymentId(user.paymentId || "");
    setMemberStatus(user.memberStatus || "Non-Member");
    setClubRole(user.clubRole || "none");
    setTrialStartDate(user.trialStartDate || "");
    setTrialEndDate(user.trialEndDate || "");
    setMembershipFee("");
  }, [user]);

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
  const showTrialDates = memberStatus === "Trial";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-navy">Edit User</SheetTitle>
        </SheetHeader>

        <div className="space-y-1 mb-5">
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Name</Label>
            <Input
              placeholder="Full name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Payment ID</Label>
            <Input
              placeholder="e.g. jtan"
              value={paymentId}
              onChange={e => setPaymentId(e.target.value)}
              className="h-10 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Membership Status</Label>
            <Select value={memberStatus} onValueChange={setMemberStatus}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Non-Member", "Trial", "Member", "Student"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Membership fee — shown only when promoting to Member */}
          {isSettingMember && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Membership Fee Paid <span className="text-muted-foreground/60">(optional)</span>
              </Label>
              <Input
                type="number"
                min="0"
                step="0.50"
                placeholder="e.g. 80"
                value={membershipFee}
                onChange={e => setMembershipFee(e.target.value)}
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">
                If entered, a Membership Fee entry will be recorded in Training Sign-ups.
              </p>
            </div>
          )}

          {/* Trial dates — shown when status is Trial */}
          {showTrialDates && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Trial Start Date <span className="text-muted-foreground/60">(DD/MM/YYYY)</span></Label>
                <Input
                  placeholder="e.g. 01/04/2026"
                  value={trialStartDate}
                  onChange={e => setTrialStartDate(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Trial End Date <span className="text-muted-foreground/60">(DD/MM/YYYY)</span></Label>
                <Input
                  placeholder="e.g. 01/05/2026"
                  value={trialEndDate}
                  onChange={e => setTrialEndDate(e.target.value)}
                  className="h-10"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Club Role</Label>
            <Select value={clubRole} onValueChange={setClubRole}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="Helper">Helper</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <Button
            onClick={() => mutation.mutate({
              email: user.email,
              name: name.trim() || undefined,
              paymentId: paymentId.trim() || undefined,
              memberStatus,
              clubRole: clubRole === "none" ? "" : clubRole,
              ...(showTrialDates ? { trialStartDate, trialEndDate } : {}),
              ...(isSettingMember && membershipFee ? { membershipFee: parseFloat(membershipFee) } : {}),
            })}
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
          <SheetTitle className="text-navy">Edit Payment</SheetTitle>
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
          <SheetTitle className="text-navy">Add Session</SheetTitle>
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
            Add Session
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
  const [editingUser, setEditingUser] = useState<{ name: string; email: string; paymentId: string; memberStatus: string; clubRole: string; trialStartDate: string; trialEndDate: string } | null>(null);
  const [editingSession, setEditingSession] = useState<SessionForEdit | null>(null);
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
    let result = users;
    if (statusFilter !== "All") {
      result = result.filter(u => (u.memberStatus || "Non-Member") === statusFilter);
    }
    const q = search.toLowerCase().trim();
    if (!q) return result;
    return result.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.userEmail.toLowerCase().includes(q)
    );
  }, [users, search, statusFilter]);

  const filteredPayments = useMemo(() => {
    if (!payments) return [];
    const q = paymentSearch.toLowerCase().trim();
    if (!q) return payments;
    return payments.filter(p =>
      p.paymentId.toLowerCase().includes(q) ||
      ((p as any).reference || "").toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q)
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

  const filteredSessions = useMemo(() => {
    if (!sessions) return sessions;
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
    return result;
  }, [sessions, sessionSearch, sessionMonthFilter, sessionPoolFilter, sessionDayFilter, sessionStatusFilter]);

  if (loading || !user || !isAdminOrHelper) return null;

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader title="Admin" />

      <main className="mx-auto max-w-[480px] px-4 py-4">
        <Tabs defaultValue="members">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="members" className="flex-1">Members</TabsTrigger>
            <TabsTrigger value="payments" className="flex-1">Payments</TabsTrigger>
            {isAdmin && <TabsTrigger value="sessions" className="flex-1">Sessions</TabsTrigger>}
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
                  onClick={() => canEdit ? setEditingUser({ name: u.name || "", email: displayEmail, paymentId: u.paymentId || "", memberStatus: u.memberStatus || "Non-Member", clubRole: u.clubRole || "", trialStartDate: (u as any).trialStartDate || "", trialEndDate: (u as any).trialEndDate || "" }) : undefined}
                  className={`w-full text-left rounded-lg border bg-card px-4 py-3 space-y-1 transition-colors ${canEdit ? "hover:bg-muted/50 active:bg-muted cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-navy truncate">{u.name || "(no name)"}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {u.clubRole && (
                        <Badge className="text-xs bg-navy text-white hover:bg-navy">{u.clubRole}</Badge>
                      )}
                      <Badge className={`text-xs ${STATUS_COLORS[u.memberStatus] || STATUS_COLORS["Non-Member"]} hover:opacity-100`}>
                        {u.memberStatus || "Non-Member"}
                      </Badge>
                      {!canEdit && <Lock className="w-3 h-3 text-muted-foreground" />}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{displayEmail || "(no email)"}</p>
                </button>
              );
            })}

            {!usersLoading && filteredUsers.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">No users found.</p>
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
              <p className="text-center text-sm text-muted-foreground py-8">No payments found.</p>
            )}

            {filteredPayments.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <div className="bg-muted/50 grid grid-cols-[1fr_auto] px-4 py-2 text-xs font-medium text-muted-foreground border-b">
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
                          <p className="text-sm text-navy truncate">{(p as any).reference || p.paymentId || "—"}</p>
                          {p.paymentId ? (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              ID: <span className="font-mono">{p.paymentId}</span>
                            </p>
                          ) : (
                            <p className="text-xs text-amber-600 mt-0.5">Unmatched</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-green-700 tabular-nums">{`$${p.amount.toFixed(2)}`}</p>
                          <p className="text-xs text-muted-foreground">{formatPaymentDate(p.date)}</p>
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
              <Button
                onClick={() => setAddSessionOpen(true)}
                className="w-full bg-navy text-white hover:bg-navy/90 h-10"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Session
              </Button>

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
                <p className="text-center text-sm text-muted-foreground py-8">No sessions found.</p>
              )}

              {filteredSessions && filteredSessions.map((s) => {
                const isClosed = s.isClosed && s.isClosed.trim().length > 0;
                return (
                  <div key={s.rowId} className="rounded-lg border bg-card px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-navy truncate">
                          {s.day} — {s.trainingDate}
                        </p>
                        <p className="text-xs text-muted-foreground">{s.pool} · {s.trainingTime}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
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
                                  Close Session
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                    {s.trainingObjective && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{s.trainingObjective}</p>
                    )}
                  </div>
                );
              })}
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
    </div>
  );
}
