import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Link, useLocation } from "wouter";
import { Plus, Loader2 } from "lucide-react";
import AnnouncementSheet from "@/components/AnnouncementSheet";

export default function Home() {
  const { user } = useAuth();
  const clubRole = (user as any)?.clubRole || "";
  const canManage = clubRole === "Admin" || clubRole === "Helper";

  const { data: announcements = [], isLoading, refetch } = trpc.announcements.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#111111] pb-32">
      {/* Spacer — keeps content from hiding behind fixed header */}
      <div style={{ height: "calc(56px + env(safe-area-inset-top, 0px))", flexShrink: 0 }} aria-hidden="true" />
      {/* Top bar — fixed so it never detaches on iOS momentum scroll */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        backgroundColor: "#1E1E1E", borderBottom: "1px solid #2C2C2C",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}>
        <div className="mx-auto max-w-[480px] relative flex items-center justify-center px-4 h-14">
          <span className="text-[18px] font-bold text-white">Info</span>
          <div className="absolute right-3 flex items-center gap-1">
            {canManage && (
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 transition-colors"
                aria-label="Create announcement"
              >
                <Plus className="w-5 h-5 text-white" />
              </button>
            )}
            <Link href="/profile" className="flex items-center hover:bg-white/10 rounded-full p-1 transition-colors">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">
                {(user as any)?.name?.charAt(0)?.toUpperCase() || (user as any)?.email?.charAt(0)?.toUpperCase() || "U"}
              </div>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-4 pt-5 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#888888] animate-spin" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="bg-[#1E1E1E] rounded-2xl px-4 py-10 text-center mt-4">
            <p className="text-[13px] text-[#888888]">No announcements yet.</p>
          </div>
        ) : (
          announcements.map((ann) => (
            <AnnouncementCard
              key={ann.id}
              ann={ann}
              canManage={canManage}
              onRefetch={refetch}
            />
          ))
        )}
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
