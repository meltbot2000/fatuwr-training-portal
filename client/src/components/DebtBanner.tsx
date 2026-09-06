import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

export const DEBT_BLOCK_LIMIT = 50;
export const DEBT_WARN_FROM = 26;

function formatFee(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Compact outstanding-balance banner (matches the nudge cards on the sessions list).
 * Shows a warning when debt is > $26, and a "blocked" notice when debt exceeds $50.
 * Renders nothing when the user is signed out, the query is loading/failed, or debt is low.
 * Tapping it goes to Payments where PayNow details live.
 */
export default function DebtBanner({ enabled = true }: { enabled?: boolean }) {
  const debtQuery = trpc.signups.myDebt.useQuery(undefined, { enabled, retry: false });
  const debt = debtQuery.data?.debt ?? 0;
  const blocking = debt > DEBT_BLOCK_LIMIT;
  const warning = debt > DEBT_WARN_FROM && debt <= DEBT_BLOCK_LIMIT;
  if (!enabled || (!blocking && !warning)) return null;

  return (
    <Link href="/payments">
      <div
        className="mb-4 px-3 py-[10px] rounded-[10px] cursor-pointer"
        style={{ background: "rgba(245,197,24,0.08)", border: "1px solid rgba(245,197,24,0.22)" }}
      >
        <p style={{ fontSize: "12px", lineHeight: "1.45" }}>
          <span style={{ color: "#F5C518" }} className="font-medium">
            {blocking ? "Account blocked." : `Outstanding balance ${formatFee(debt)}.`}
          </span>
          {" "}
          <span style={{ color: "#888888" }}>
            {blocking
              ? `Outstanding balance of ${formatFee(debt)} exceeds $${DEBT_BLOCK_LIMIT}. Settle it before signing up for sessions.`
              : `You will be blocked from signing up once this exceeds $${DEBT_BLOCK_LIMIT}.`}
          </span>
          {" "}
          <span style={{ color: "#F5C518" }} className="font-medium whitespace-nowrap">Pay ›</span>
        </p>
      </div>
    </Link>
  );
}
