import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, Copy, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const CLUB_UEN = "T14SS0144D";

function formatFee(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Format ISO / Maybank date strings to "3 Jan 2026" */
function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <button
      onClick={handleCopy}
      aria-label={`Copy ${label}`}
      className="ml-1.5 inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-navy hover:bg-navy/5 transition-colors"
    >
      <Copy className="w-3.5 h-3.5" />
    </button>
  );
}

function CollapsibleSection({
  title,
  count,
  total,
  children,
}: {
  title: string;
  count: number;
  total: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Card className="mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div>
          <p className="font-semibold text-navy text-sm">{title}</p>
          <p className="text-xs text-muted-foreground">{count} record{count !== 1 ? "s" : ""} · Total: {total}</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <CardContent className="px-4 pb-4 pt-0">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

export default function Payments() {
  useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });

  const { data, isLoading, error, isFetching, refetch } = trpc.payments.myData.useQuery(undefined, {
    retry: false,
    refetchInterval: 60 * 1000,
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader title="Payments" />

      <main className="mx-auto max-w-[480px] px-4 py-4">
        <div className="flex justify-end mb-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-navy transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {error && (
          <div className="py-12 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-2" />
            <p className="text-destructive font-medium text-sm">{error.message}</p>
          </div>
        )}

        {data && (
          <>
            {/* Club UEN + Payment ID card */}
            <Card className="mb-4">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Club UEN (PayNow)</p>
                    <p className="font-semibold text-navy text-sm">{CLUB_UEN}</p>
                  </div>
                  <CopyButton value={CLUB_UEN} label="Club UEN" />
                </div>

                <div className="border-t pt-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Your Payment ID</p>
                    <p className="font-semibold text-navy text-sm">{data.paymentId || "—"}</p>
                  </div>
                  {data.paymentId && <CopyButton value={data.paymentId} label="Payment ID" />}
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Amount Owed</p>
                  {data.debt > 0 ? (
                    <p className="text-lg font-bold text-amber-600">{formatFee(data.debt)}</p>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <p className="text-sm font-semibold text-green-600">
                        {data.totalPaid > data.totalFees
                          ? `Credit: ${formatFee(data.totalPaid - data.totalFees)}`
                          : "All paid up"}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Debt banners */}
            {data.debt >= 54 && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <span className="font-semibold">Account blocked</span> — please settle your balance before signing up for sessions.
                </p>
              </div>
            )}
            {data.debt >= 26 && data.debt < 54 && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p>You have an outstanding balance of <span className="font-semibold">{formatFee(data.debt)}</span>.</p>
              </div>
            )}

            {/* PayNow instructions */}
            <div className="mb-4 rounded-lg border border-navy/20 bg-navy/5 px-3 py-2.5 text-xs text-navy/80">
              <p className="font-semibold mb-0.5">How to pay via PayNow</p>
              <p>
                Transfer to UEN <span className="font-mono font-semibold">{CLUB_UEN}</span>.{" "}
                Your Payment ID must be the <span className="font-semibold">ONLY</span> text in the
                transfer notes/reference field. Do not include any other text.
              </p>
            </div>

            {/* Training fees */}
            <CollapsibleSection
              title="Training Fees"
              count={data.trainingFees.length}
              total={formatFee(data.totalTrainingFees)}
            >
              {data.trainingFees.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">No training sign-ups yet.</p>
              ) : (
                <div className="divide-y text-sm">
                  {data.trainingFees.map((f, i) => (
                    <div key={i} className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-medium text-navy">{formatDate(f.trainingDate)}</p>
                        <p className="text-xs text-muted-foreground">{f.pool}{f.pool && f.activity ? " · " : ""}{f.activity}</p>
                      </div>
                      <p className="font-semibold tabular-nums">{formatFee(f.actualFee)}</p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-2 font-semibold text-navy">
                    <p>Total</p>
                    <p>{formatFee(data.totalTrainingFees)}</p>
                  </div>
                </div>
              )}
            </CollapsibleSection>

            {/* Membership fees — only shown if there are any */}
            {data.membershipFees.length > 0 && (
              <CollapsibleSection
                title="Membership Fee"
                count={data.membershipFees.length}
                total={formatFee(data.totalMembershipFees)}
              >
                <div className="divide-y text-sm">
                  {data.membershipFees.map((f, i) => (
                    <div key={i} className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-medium text-navy">{f.activity}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(f.date)}</p>
                      </div>
                      <p className="font-semibold tabular-nums">{formatFee(f.actualFee)}</p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-2 font-semibold text-navy">
                    <p>Total</p>
                    <p>{formatFee(data.totalMembershipFees)}</p>
                  </div>
                </div>
              </CollapsibleSection>
            )}

            {/* Payments received */}
            <CollapsibleSection
              title="Payments Received"
              count={data.payments.length}
              total={formatFee(data.totalPaid)}
            >
              {data.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No payments recorded yet.
                </p>
              ) : (
                <div className="divide-y text-sm">
                  {data.payments.map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-2">
                      <p className="text-muted-foreground">{formatDate(p.date)}</p>
                      <p className="font-semibold tabular-nums text-green-700">{formatFee(p.amount)}</p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-2 font-semibold text-navy">
                    <p>Total</p>
                    <p className="text-green-700">{formatFee(data.totalPaid)}</p>
                  </div>
                </div>
              )}
            </CollapsibleSection>
          </>
        )}
      </main>
    </div>
  );
}
