import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { CalendarPlus, CircleDollarSign, BookOpen, Sparkles, Plus } from "lucide-react";
import AnnouncementSheet from "@/components/AnnouncementSheet";

const QUICK_ACTIONS = [
  { icon: CalendarPlus,       label: "Sign Up",      href: "/sessions" },
  { icon: CircleDollarSign,   label: "Payments",     href: "/payments" },
  { icon: BookOpen,           label: "New to Club?", href: "/newbie" },
  { icon: Sparkles,           label: "Fun Stuff",    href: "/fun-resources" },
];

export default function Home() {
  const { user } = useAuth();
  const clubRole = (user as any)?.clubRole || "";
  const canManage = clubRole === "Admin" || clubRole === "Helper";

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

      <main className="mx-auto max-w-[480px] px-4 pt-[50px] space-y-6">

        {/* Quick Actions */}
        <section>
          <div className="flex justify-center gap-5">
            {QUICK_ACTIONS.map(({ icon: Icon, label, href }) => (
              <Link key={href} href={href}>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-14 h-14 rounded-full bg-[#1E1E1E] flex items-center justify-center">
                    <Icon className="w-6 h-6 text-[#2196F3]" />
                  </div>
                  <span className="text-[13px] text-[#888888] text-center leading-tight max-w-[56px]">{label}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

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
  const [editOpen, setEditOpen] = useState(false);
  const deleteMutation = trpc.announcements.delete.useMutation({
    onSuccess: () => { onRefetch(); },
  });

  const handleLongPress = () => {
    if (!canManage) return;
    if (confirm("Delete this announcement?")) {
      deleteMutation.mutate({ id: ann.id });
    }
  };

  return (
    <>
      <div
        className="bg-[#1E1E1E] rounded-2xl overflow-hidden"
        onContextMenu={(e) => { e.preventDefault(); handleLongPress(); }}
        onClick={() => canManage && setEditOpen(true)}
      >
        {ann.imageUrl && (
          <img
            src={ann.imageUrl}
            alt={ann.title || "Announcement"}
            className="w-full object-cover"
            style={{ height: 200 }}
          />
        )}
        {ann.title && (
          <p className="text-[15px] font-medium text-white px-3 py-3">{ann.title}</p>
        )}
      </div>

      {canManage && (
        <AnnouncementSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          existing={ann}
          onDone={onRefetch}
        />
      )}
    </>
  );
}
