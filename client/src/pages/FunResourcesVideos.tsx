import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Plus, Loader2, Play, X } from "lucide-react";
import { toast } from "sonner";

// ── Thumbnail helpers ─────────────────────────────────────────────────────────

function getYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

function getThumbnail(url: string): string | null {
  const ytId = getYouTubeId(url);
  if (ytId) return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
  return null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
}

// ── Add Video Sheet ───────────────────────────────────────────────────────────

function AddVideoSheet({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  const addMutation = trpc.videos.add.useMutation({
    onSuccess: () => {
      toast.success("Video added!");
      setTitle("");
      setUrl("");
      onOpenChange(false);
      onDone();
    },
    onError: (e) => toast.error(e.message || "Failed to add video"),
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-[480px] bg-[#1E1E1E] rounded-t-2xl px-4 pt-4 pb-8 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-2" />

        <div className="flex items-center justify-between mb-1">
          {/* fs-header: 17px/600 */}
          <p className="text-[17px] font-semibold text-white">Add video</p>
          <button onClick={() => onOpenChange(false)} className="p-1.5 rounded-full hover:bg-white/10">
            <X className="w-4 h-4 text-[#888888]" />
          </button>
        </div>

        <div className="space-y-2.5">
          <div>
            {/* fs-meta: 13px/400 */}
            <label className="text-[13px] text-[#888888] block mb-1">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. FATUWR vs NUSAC highlights"
              className="w-full bg-[#2C2C2C] rounded-xl px-3 py-2.5 text-[14px] text-white placeholder-[#555] outline-none focus:ring-1 focus:ring-[#2196F3]"
            />
          </div>
          <div>
            <label className="text-[13px] text-[#888888] block mb-1">URL</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="w-full bg-[#2C2C2C] rounded-xl px-3 py-2.5 text-[14px] text-white placeholder-[#555] outline-none focus:ring-1 focus:ring-[#2196F3]"
              inputMode="url"
              autoCapitalize="none"
            />
          </div>
        </div>

        <button
          onClick={() => addMutation.mutate({ title: title.trim(), url: url.trim() })}
          disabled={!title.trim() || !url.trim() || addMutation.isPending}
          className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[15px] disabled:opacity-40 flex items-center justify-center gap-2 mt-1"
        >
          {addMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Add video
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FunResourcesVideos() {
  const { user, isAuthenticated } = useAuth();
  const isAdmin = (user as any)?.clubRole === "Admin" || (user as any)?.clubRole === "Helper";
  const [addOpen, setAddOpen] = useState(false);

  const { data: videoList = [], isLoading, refetch } = trpc.videos.list.useQuery();
  const deleteMutation = trpc.videos.delete.useMutation({
    onSuccess: () => { toast.success("Removed."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const topBarAction = isAuthenticated ? (
    <button
      onClick={() => setAddOpen(true)}
      className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 transition-colors"
      aria-label="Add video"
    >
      <Plus className="w-5 h-5 text-white" />
    </button>
  ) : undefined;

  return (
    <div className="min-h-screen bg-[#111111] pb-32">
      <AppHeader title="Videos" showBack backPath="/fun-resources" rightAction={topBarAction} />

      <main className="mx-auto max-w-[480px] px-4 pt-4 space-y-2.5">

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#888888] animate-spin" />
          </div>
        )}

        {!isLoading && videoList.length === 0 && (
          <div className="bg-[#1E1E1E] rounded-2xl px-4 py-10 text-center mt-4">
            <p className="text-[13px] text-[#888888]">No videos yet.{isAuthenticated ? " Tap + to add one!" : ""}</p>
          </div>
        )}

        {videoList.map((v) => {
          const thumb = getThumbnail(v.url);
          return (
            <a
              key={v.id}
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-[#1E1E1E] rounded-2xl overflow-hidden cursor-pointer hover:bg-[#252525] active:opacity-75 transition-colors"
              style={{ minHeight: 80 }}
            >
              {/* Thumbnail */}
              <div
                className="shrink-0 flex items-center justify-center bg-[#2C2C2C]"
                style={{ width: 112, height: 80 }}
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt={v.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Play className="w-6 h-6 text-white/30" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 py-3 pr-3">
                {/* fs-primary: 15px/500 */}
                <p className="text-[15px] font-medium text-white leading-tight truncate">{v.title}</p>
                {/* fs-meta: 13px/400 */}
                <p className="text-[13px] text-[#888888] mt-0.5">{formatDate(v.postedDate)}</p>
                <p className="text-[13px] text-[#888888] truncate">{v.postedBy}</p>
              </div>

              {/* Admin delete — stop propagation so the link still works */}
              {isAdmin && (
                <button
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (confirm("Remove this video?")) deleteMutation.mutate({ id: v.id });
                  }}
                  className="shrink-0 px-3 self-stretch flex items-center text-[#888888] hover:text-red-400 transition-colors"
                  aria-label="Delete video"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </a>
          );
        })}
      </main>

      <AddVideoSheet open={addOpen} onOpenChange={setAddOpen} onDone={refetch} />
    </div>
  );
}
