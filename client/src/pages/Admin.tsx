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
import { AlertTriangle, Loader2, Plus, Lock } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

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

// ─── EditUserSheet ────────────────────────────────────────────────────────────

interface EditUserSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: { name: string; email: string; memberStatus: string; clubRole: string; trialStartDate: string; trialEndDate: string };
  onDone: () => void;
}

function EditUserSheet({ open, onOpenChange, user, onDone }: EditUserSheetProps) {
  const utils = trpc.useUtils();
  const [memberStatus, setMemberStatus] = useState(user.memberStatus || "Non-Member");
  const [clubRole, setClubRole] = useState(user.clubRole || "");
  const [trialStartDate, setTrialStartDate] = useState(user.trialStartDate || "");
  const [trialEndDate, setTrialEndDate] = useState(user.trialEndDate || "");
  const [membershipFee, setMembershipFee] = useState("");

  useEffect(() => {
    setMemberStatus(user.memberStatus || "Non-Member");
    setClubRole(user.clubRole || "");
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
          <p className="font-semibold text-navy text-sm">{user.name || "(no name)"}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>

        <div className="space-y-4">
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
                <SelectItem value="">None</SelectItem>
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
              memberStatus,
              clubRole,
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
  const [editingUser, setEditingUser] = useState<{ name: string; email: string; memberStatus: string; clubRole: string; trialStartDate: string; trialEndDate: string } | null>(null);
  const [addSessionOpen, setAddSessionOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data: users, isLoading: usersLoading } = trpc.admin.allUsers.useQuery(undefined, {
    enabled: isAdminOrHelper,
  });
  const { data: payments, isLoading: paymentsLoading } = trpc.admin.allPayments.useQuery(undefined, {
    enabled: isAdminOrHelper,
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

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.userEmail.toLowerCase().includes(q)
    );
  }, [users, search]);

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
                  onClick={() => canEdit ? setEditingUser({ name: u.name, email: displayEmail, memberStatus: u.memberStatus, clubRole: u.clubRole, trialStartDate: (u as any).trialStartDate || "", trialEndDate: (u as any).trialEndDate || "" }) : undefined}
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
          <TabsContent value="payments">
            {paymentsLoading && (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            )}

            {payments && payments.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">No payments recorded.</p>
            )}

            {payments && payments.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <div className="bg-muted/50 grid grid-cols-3 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
                  <span>Payment ID</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Date</span>
                </div>
                <div className="divide-y">
                  {payments.map((p, i) => (
                    <div key={i} className="grid grid-cols-3 px-4 py-2.5 text-sm">
                      <span className="font-mono text-xs text-muted-foreground truncate pr-2">{p.paymentId || "—"}</span>
                      <span className="text-right font-semibold text-green-700 tabular-nums">{`$${p.amount.toFixed(2)}`}</span>
                      <span className="text-right text-muted-foreground text-xs">{p.date}</span>
                    </div>
                  ))}
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

              {sessionsLoading && (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              )}

              {sessions && sessions.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">No sessions found.</p>
              )}

              {sessions && sessions.map((s) => {
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
                      <div className="flex items-center gap-2 shrink-0">
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
    </div>
  );
}
