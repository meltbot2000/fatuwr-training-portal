import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import { ChevronDown, ChevronUp, Copy, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const CLUB_UEN = "T14SS0144D";

function formatFee(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

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
      className="ml-1.5 inline-flex items-center justify-center rounded p-1 text-[#888888] hover:text-white transition-colors"
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
    <div className="bg-[#1E1E1E] rounded-2xl mb-3 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
      >
        <div>
          <p className="text-[13px] font-semibold text-white">{title}</p>
          <p className="text-[12px] text-[#888888] mt-0.5">{count} record{count !== 1 ? "s" : ""} · Total: {total}</p>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-[#888888]" />
          : <ChevronDown className="w-4 h-4 text-[#888888]" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 border-t border-white/6">
          {children}
        </div>
      )}
    </div>
  );
}

export default function Payments() {
  useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });

  const { data, isLoading, error, isFetching, refetch } = trpc.payments.myData.useQuery(undefined, {
    retry: false,
    refetchInterval: 60 * 1000,
  });

  return (
    <div className="min-h-screen bg-[#111111] pb-24">
      <AppHeader title="Payments" />

      <main className="mx-auto max-w-[480px] px-4 py-4">
        <div className="flex justify-end mb-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-[12px] text-[#888888] hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[80, 48, 120, 120, 120].map((h, i) => (
              <div key={i} className="rounded-2xl bg-[#1E1E1E] animate-pulse" style={{ height: h }} />
            ))}
          </div>
        )}

        {error && (
          <div className="py-12 text-center">
            <AlertTriangle className="w-10 h-10 text-white/30 mx-auto mb-2" />
            <p className="text-[13px] text-[#888888]">{error.message}</p>
          </div>
        )}

        {data && (
          <div className="space-y-3">
            {/* Club UEN + Payment ID + Amount owed */}
            <div className="bg-[#1E1E1E] rounded-2xl divide-y divide-white/6">
              <div className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[12px] text-[#888888]">Club UEN (PayNow)</p>
                  <p className="text-[15px] font-semibold text-white mt-0.5">{CLUB_UEN}</p>
                </div>
                <CopyButton value={CLUB_UEN} label="Club UEN" />
              </div>

              <div className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[12px] text-[#888888]">Your payment ID</p>
                  <p className="text-[15px] font-semibold text-white mt-0.5">{data.paymentId || "—"}</p>
                </div>
                {data.paymentId && <CopyButton value={data.paymentId} label="Payment ID" />}
              </div>

              <div className="px-4 py-3">
                <p className="text-[12px] text-[#888888] mb-0.5">Amount owed</p>
                {data.debt > 0 ? (
                  <p className="text-[18px] font-bold text-[#F5C518]">{formatFee(data.debt)}</p>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <p className="text-[13px] font-semibold text-green-400">
                      {data.totalPaid > data.totalFees
                        ? `Credit: ${formatFee(data.totalPaid - data.totalFees)}`
                        : "All paid up"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Debt banners */}
            {data.debt >= 54 && (
              <div className="bg-[#3D3500] rounded-xl px-4 py-3">
                <p className="text-[13px] text-[#F5C518] leading-snug">
                  <span className="font-semibold">Account blocked</span> — please settle your balance before signing up for sessions.
                </p>
              </div>
            )}
            {data.debt >= 26 && data.debt < 54 && (
              <div className="bg-[#3D3500] rounded-xl px-4 py-3">
                <p className="text-[13px] text-[#F5C518] leading-snug">
                  You have an outstanding balance of <span className="font-semibold">{formatFee(data.debt)}</span>.
                </p>
              </div>
            )}

            {/* PayNow instructions */}
            <div className="bg-[#1E1E1E] rounded-xl px-4 py-3">
              <p className="text-[12px] font-semibold text-white mb-1">How to pay via PayNow</p>
              <p className="text-[12px] text-[#888888] leading-relaxed">
                Transfer to UEN <span className="font-mono font-semibold text-white">{CLUB_UEN}</span>.{" "}
                Your payment ID must be the <span className="font-semibold text-white">only</span> text in the
                reference field.
              </p>
            </div>

            {/* Training fees */}
            <CollapsibleSection
              title="Training fees"
              count={data.trainingFees.length}
              total={formatFee(data.totalTrainingFees)}
            >
              {data.trainingFees.length === 0 ? (
                <p className="text-[13px] text-[#888888] text-center py-3">No training sign-ups yet.</p>
              ) : (
                <div className="divide-y divide-white/6">
                  {data.trainingFees.map((f, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-[13px] text-white">{formatDate(f.trainingDate)}</p>
                        <p className="text-[12px] text-[#888888] mt-0.5">{f.pool}{f.pool && f.activity ? " · " : ""}{f.activity}</p>
                      </div>
                      <p className="text-[13px] font-semibold text-white tabular-nums">{formatFee(f.actualFee)}</p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-2.5">
                    <p className="text-[13px] font-semibold text-white">Total</p>
                    <p className="text-[13px] font-semibold text-white tabular-nums">{formatFee(data.totalTrainingFees)}</p>
                  </div>
                </div>
              )}
            </CollapsibleSection>

            {/* Membership fees */}
            {data.membershipFees.length > 0 && (
              <CollapsibleSection
                title="Membership fee"
                count={data.membershipFees.length}
                total={formatFee(data.totalMembershipFees)}
              >
                <div className="divide-y divide-white/6">
                  {data.membershipFees.map((f, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-[13px] text-white">{f.activity}</p>
                        <p className="text-[12px] text-[#888888] mt-0.5">{formatDate(f.date)}</p>
                      </div>
                      <p className="text-[13px] font-semibold text-white tabular-nums">{formatFee(f.actualFee)}</p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-2.5">
                    <p className="text-[13px] font-semibold text-white">Total</p>
                    <p className="text-[13px] font-semibold text-white tabular-nums">{formatFee(data.totalMembershipFees)}</p>
                  </div>
                </div>
              </CollapsibleSection>
            )}

            {/* Payments received */}
            <CollapsibleSection
              title="Payments received"
              count={data.payments.length}
              total={formatFee(data.totalPaid)}
            >
              {data.payments.length === 0 ? (
                <p className="text-[13px] text-[#888888] text-center py-3">No payments recorded yet.</p>
              ) : (
                <div className="divide-y divide-white/6">
                  {data.payments.map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5">
                      <p className="text-[13px] text-[#888888]">{formatDate(p.date)}</p>
                      <p className="text-[13px] font-semibold text-green-400 tabular-nums">{formatFee(p.amount)}</p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-2.5">
                    <p className="text-[13px] font-semibold text-white">Total</p>
                    <p className="text-[13px] font-semibold text-green-400 tabular-nums">{formatFee(data.totalPaid)}</p>
                  </div>
                </div>
              )}
            </CollapsibleSection>
          </div>
        )}
      </main>
    </div>
  );
}
