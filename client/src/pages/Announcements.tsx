import { useState, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import AnnouncementSheet from "@/components/AnnouncementSheet";
import { Plus, GripVertical } from "lucide-react";
import { toast } from "sonner";

type AnnType = { id: number; title: string | null; imageUrl: string | null; position: number };

export default function Announcements() {
  const { user } = useAuth();
  const clubRole = (user as any)?.clubRole || "";
  const canManage = clubRole === "Admin" || clubRole === "Helper";

  const { data: all = [], refetch } = trpc.announcements.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AnnType | null>(null);
  const [reordering, setReordering] = useState(false);
  const [order, setOrder] = useState<AnnType[]>([]);

  const reorderMutation = trpc.announcements.reorder.useMutation({
    onSuccess: async () => { toast.success("Order saved."); await refetch(); setReordering(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.announcements.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const startReorder = () => { setOrder([...all]); setReordering(true); };
  const saveReorder = () => reorderMutation.mutate({ orderedIds: order.map(a => a.id) });

  // Simple drag-to-reorder state
  const dragIdx = useRef<number | null>(null);

  const handleDragStart = (i: number) => { dragIdx.current = i; };
  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === i) return;
    const next = [...order];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(i, 0, moved);
    dragIdx.current = i;
    setOrder(next);
  };

  const list = reordering ? order : all;

  const addBtn = canManage ? (
    <button onClick={() => setCreateOpen(true)} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center" aria-label="Add announcement">
      <Plus className="w-4 h-4 text-white" />
    </button>
  ) : undefined;

  return (
    <div className="min-h-screen bg-[#111111] pb-24">
      <AppHeader title="Announcements" showBack backPath="/" rightAction={addBtn} />

      <main className="mx-auto max-w-[480px] px-4 pt-4">
        {canManage && (
          <div className="flex justify-end mb-3">
            {reordering ? (
              <button
                onClick={saveReorder}
                disabled={reorderMutation.isPending}
                className="text-[13px] font-medium text-[#2196F3]"
              >
                {reorderMutation.isPending ? "Saving…" : "Done"}
              </button>
            ) : (
              <button onClick={startReorder} className="text-[13px] font-medium text-[#888888]">
                Reorder
              </button>
            )}
          </div>
        )}

        {list.length === 0 && (
          <div className="bg-[#1E1E1E] rounded-2xl px-4 py-6 text-center">
            <p className="text-[13px] text-[#888888]">No announcements yet.</p>
          </div>
        )}

        <div className="space-y-3">
          {list.map((ann, i) => (
            <div
              key={ann.id}
              draggable={reordering}
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              className="bg-[#1E1E1E] rounded-2xl overflow-hidden relative"
              onContextMenu={(e) => {
                e.preventDefault();
                if (!canManage) return;
                if (confirm("Delete this announcement?")) deleteMutation.mutate({ id: ann.id });
              }}
              onClick={() => { if (canManage && !reordering) setEditTarget(ann); }}
            >
              {ann.imageUrl && (
                <img src={ann.imageUrl} alt={ann.title || "Announcement"} className="w-full object-cover" style={{ height: 200 }} />
              )}
              {ann.title && (
                <p className="text-[15px] font-medium text-white px-3 py-3">{ann.title}</p>
              )}
              {reordering && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 p-1">
                  <GripVertical className="w-5 h-5 text-[#888888]" />
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {canManage && (
        <>
          <AnnouncementSheet open={createOpen} onOpenChange={setCreateOpen} onDone={refetch} />
          {editTarget && (
            <AnnouncementSheet
              open={!!editTarget}
              onOpenChange={(v) => { if (!v) setEditTarget(null); }}
              existing={editTarget}
              onDone={() => { setEditTarget(null); refetch(); }}
            />
          )}
        </>
      )}
    </div>
  );
}
