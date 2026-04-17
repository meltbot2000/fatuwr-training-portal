import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Copy } from "lucide-react";
import { useParams } from "wouter";
import { toast } from "sonner";

const ACTIVITIES = ["Regular Training", "Swims only", "Trainer", "First-timer"] as const;
type Activity = (typeof ACTIVITIES)[number];

const ACTIVITY_COLORS: Record<Activity, string> = {
  "Regular Training": "bg-navy text-white",
  "Swims only": "bg-blue-500 text-white",
  "Trainer": "bg-amber-500 text-white",
  "First-timer": "bg-green-500 text-white",
};

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${label}!`);
  } catch {
    toast.error("Failed to copy");
  }
}

export default function Splits() {
  useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const { rowId } = useParams<{ rowId: string }>();

  const { data: session, isLoading, error } = trpc.sessions.detail.useQuery(
    { rowId: rowId || "" },
    { enabled: !!rowId }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-32">
        <AppHeader title="Splits" showBack backPath={`/session/${rowId}`} />
        <main className="mx-auto max-w-[480px] px-4 py-4 space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </main>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-background pb-32">
        <AppHeader title="Splits" showBack backPath={`/session/${rowId}`} />
        <main className="mx-auto max-w-[480px] px-4 py-12 text-center">
          <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-2" />
          <p className="text-destructive font-medium text-sm">Session not found</p>
        </main>
      </div>
    );
  }

  const signups = session.signups ?? [];

  // Group by activity
  const byActivity: Record<Activity, string[]> = {
    "Regular Training": [],
    "Swims only": [],
    "Trainer": [],
    "First-timer": [],
  };
  const uncategorised: string[] = [];

  for (const su of signups) {
    if ((ACTIVITIES as readonly string[]).includes(su.activity)) {
      byActivity[su.activity as Activity].push(su.name);
    } else {
      uncategorised.push(su.name);
    }
  }

  const allNames = signups.map(s => s.name).filter(Boolean);

  const handleCopyAll = () => {
    if (allNames.length === 0) {
      toast.info("No sign-ups yet.");
      return;
    }
    copyToClipboard(allNames.join(", "), `${allNames.length} names`);
  };

  const handleCopySection = (activity: Activity, names: string[]) => {
    if (names.length === 0) {
      toast.info("No names in this section.");
      return;
    }
    copyToClipboard(names.join(", "), `${names.length} name${names.length !== 1 ? "s" : ""}`);
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <AppHeader
        title={`Splits — ${session.day} ${session.trainingDate}`}
        showBack
        backPath={`/session/${rowId}`}
      />

      <main className="mx-auto max-w-[480px] px-4 py-4 space-y-3">
        {/* Copy-all banner */}
        <button
          onClick={handleCopyAll}
          className="w-full flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground hover:bg-white/8 transition-colors active:bg-white/10"
        >
          <span className="font-medium">
            Tap to copy all names ({allNames.length})
          </span>
          <Copy className="w-4 h-4 shrink-0" />
        </button>

        {/* Activity sections */}
        {ACTIVITIES.map((activity) => {
          const names = byActivity[activity];
          return (
            <div key={activity} className="rounded-lg border overflow-hidden">
              {/* Tappable section header */}
              <button
                onClick={() => handleCopySection(activity, names)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left ${ACTIVITY_COLORS[activity]} hover:opacity-90 transition-opacity`}
              >
                <span className="font-semibold text-sm">
                  {activity} ({names.length})
                </span>
                <Copy className="w-3.5 h-3.5 opacity-70 shrink-0" />
              </button>

              {/* Names list */}
              <div className="bg-card px-4 py-2 min-h-[40px]">
                {names.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-1">—</p>
                ) : (
                  <ul className="space-y-1 py-1">
                    {names.map((name, i) => (
                      <li key={i} className="text-sm text-foreground">
                        {name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}

        {/* Uncategorised (catch-all for unexpected activity values) */}
        {uncategorised.length > 0 && (
          <div className="rounded-lg border overflow-hidden">
            <button
              onClick={() => copyToClipboard(uncategorised.join(", "), `${uncategorised.length} names`)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-muted hover:bg-muted/80 transition-colors"
            >
              <span className="font-semibold text-sm text-foreground">
                Other ({uncategorised.length})
              </span>
              <Copy className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </button>
            <div className="bg-card px-4 py-2">
              <ul className="space-y-1 py-1">
                {uncategorised.map((name, i) => (
                  <li key={i} className="text-sm text-foreground">{name}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
