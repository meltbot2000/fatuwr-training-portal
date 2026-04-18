import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Link, useLocation } from "wouter";
import { CalendarPlus, CircleDollarSign, BookOpen, Sparkles, Plus, Star } from "lucide-react";
import AnnouncementSheet from "@/components/AnnouncementSheet";

function parseFlexDate(s: string): Date | null {
  if (!s || s === "NA") return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  const parts = s.split("/");
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    const d2 = new Date(`${yyyy}-${mm}-${dd}`);
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

const QUICK_ACTIONS = [
  { icon: CalendarPlus,       label: "Sign Up",      href: "/sessions" },
  { icon: CircleDollarSign,   label: "Payments",     href: "/payments" },
  { icon: BookOpen,           label: "Newbie",       href: "/newbie" },
  { icon: Sparkles,           label: "More",         href: "/fun-resources" },
];

export default function Home() {
  const { user } = useAuth();
  const clubRole = (user as any)?.clubRole || "";
  const canManage = clubRole === "Admin" || clubRole === "Helper";

  const memberStatus: string = (user as any)?.memberStatus || "Non-Member";
  const trialEndDate: string = (user as any)?.trialEndDate || "";
  const isNonMember = !!user && memberStatus === "Non-Member";
  const isTrial = !!user && memberStatus === "Trial";

  const trialEndDisplay = useMemo(() => {
    if (!isTrial || !trialEndDate) return null;
    const end = parseFlexDate(trialEndDate);
    if (!end) return null;
    const daysLeft = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft > 14) return null;
    return end.toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });
  }, [isTrial, trialEndDate]);

  const { data: announcements = [], refetch } = trpc.announcements.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);

  const preview = announcements.slice(0, 5);

  return (
    <div className="min-h-screen bg-[#111111] pb-32">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-[#2196F3]">
        <div className="mx-auto max-w-[480px] relative flex items-center justify-center px-4 h-14">
          <span className="text-[17px] font-semibold text-white">Home</span>
          <Link href="/profile" className="absolute right-3 flex items-center hover:bg-white/10 rounded-full p-1 transition-colors">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">
              {(user as any)?.name?.charAt(0)?.toUpperCase() || (user as any)?.email?.charAt(0)?.toUpperCase() || "U"}
            </div>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-4 pt-[28px] space-y-6">

        {/* Quick Actions */}
        <section>
          <div className="bg-[#1E1E1E] rounded-2xl px-4 py-4 flex justify-around">
            {QUICK_ACTIONS.map(({ icon: Icon, label, href }) => (
              <Link key={href} href={href}>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-14 h-14 rounded-full bg-[#2A2A2A] flex items-center justify-center">
                    <Icon className="w-6 h-6 text-[#2196F3]" />
                  </div>
                  <span className="text-[13px] text-[#888888] text-center leading-tight max-w-[56px]">{label}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Non-member membership nudge */}
        {isNonMember && (
          <section className="space-y-2 -mt-2">
            <div className="px-4 py-3.5 rounded-xl bg-[#1A2A3A]">
              <p className="text-[14px] text-white leading-snug">
                You're currently not a member — click the button below to find out how to become a Trial or Annual Member
              </p>
            </div>
            <Link href="/membership">
              <div className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[15px] flex items-center justify-center gap-2 cursor-pointer">
                <Star className="w-4 h-4" />
                How to become a Member
              </div>
            </Link>
          </section>
        )}

        {/* Trial expiry warning (within 14 days) */}
        {trialEndDisplay && (
          <div className="-mt-2 px-4 py-3.5 rounded-xl bg-[#2A2A2A]">
            <p className="text-[14px] text-white leading-snug">
              Your Trial Membership ends on {trialEndDisplay} — go to the{" "}
              <Link href="/membership" className="text-[#2196F3] underline">Membership tab</Link>{" "}
              to sign up for annual membership
            </p>
          </div>
        )}

        {/* Announcements */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium text-white">Announcements</span>
              {canManage && (
                <button
                  onClick={() => setCreateOpen(true)}
                  className="w-6 h-6 rounded-full bg-[#1E1E1E] flex items-center justify-center"
                  aria-label="Create announcement"
                >
                  <Plus className="w-3.5 h-3.5 text-[#2196F3]" />
                </button>
              )}
            </div>
            <Link href="/announcements">
              <span className="text-[14px] text-[#888888]">See all</span>
            </Link>
          </div>

          {preview.length === 0 ? (
            <div className="bg-[#1E1E1E] rounded-2xl px-4 py-6 text-center">
              <p className="text-[13px] text-[#888888]">No announcements yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {preview.map((ann) => (
                <AnnouncementCard
                  key={ann.id}
                  ann={ann}
                  canManage={canManage}
                  onRefetch={refetch}
                />
              ))}
            </div>
          )}
        </section>

      </main>

      {canManage && (
        <AnnouncementSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          onDone={refetch}
        />
      )}
    </div>
  );
}

type AnnType = { id: number; title: string | null; content?: string | null; imageUrl: string | null; position: number };

function AnnouncementCard({ ann, canManage, onRefetch }: { ann: AnnType; canManage: boolean; onRefetch: () => void }) {
  const [, navigate] = useLocation();
  const deleteMutation = trpc.announcements.delete.useMutation({
    onSuccess: () => { onRefetch(); },
  });

  return (
    <div
      className="bg-[#1E1E1E] rounded-2xl overflow-hidden cursor-pointer active:opacity-80 transition-opacity"
      onContextMenu={(e) => {
        e.preventDefault();
        if (!canManage) return;
        if (confirm("Delete this announcement?")) deleteMutation.mutate({ id: ann.id });
      }}
      onClick={() => navigate(`/announcements/${ann.id}`)}
    >
      {ann.imageUrl && (
        <img
          src={ann.imageUrl}
          alt={ann.title || "Announcement"}
          className="w-full object-cover"
          style={{ height: 240 }}
        />
      )}
      {ann.title && (
        <p className="text-[15px] font-medium text-white px-3 py-3">{ann.title}</p>
      )}
    </div>
  );
}
