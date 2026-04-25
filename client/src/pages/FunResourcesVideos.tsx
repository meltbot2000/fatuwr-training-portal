import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Plus, Loader2, Play, X, ChevronLeft } from "lucide-react";
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

// ── Add Video (full-screen) ───────────────────────────────────────────────────

function AddVideoScreen({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");

  const addMutation = trpc.videos.add.useMutation({
    onSuccess: () => {
      toast.success("Video added!");
      onDone();
      onClose();
    },
    onError: (e) => toast.error(e.message || "Failed to add video"),
  });

  return (
    <div className="fixed inset-0 z-50 bg-[#111111] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-safe-top pt-4 pb-3 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 transition-colors mr-1"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <p className="text-[17px] font-semibold text-white">Add video</p>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3 pt-2">
        {/* Title + URL */}
        <div className="bg-[#1E1E1E] rounded-xl overflow-hidden divide-y divide-[#2C2C2C]">
          <div className="flex items-center gap-3 px-4 min-h-[48px]">
            <span className="text-[14px] text-[#888888] w-16 shrink-0">Title</span>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. FATUWR vs NUSAC highlights"
              className="flex-1 bg-transparent text-[14px] text-white placeholder:text-white/30 outline-none py-3"
            />
          </div>
          <div className="flex items-center gap-3 px-4 min-h-[48px]">
            <span className="text-[14px] text-[#888888] w-16 shrink-0">URL</span>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="flex-1 bg-transparent text-[14px] text-white placeholder:text-white/30 outline-none py-3"
              inputMode="url"
              autoCapitalize="none"
            />
          </div>
        </div>

        {/* Notes */}
        <div className="bg-[#1E1E1E] rounded-xl overflow-hidden px-4 py-3">
          <p className="text-[13px] text-[#888888] mb-1.5">Notes</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional — context, key moments, etc."
            rows={4}
            className="w-full bg-transparent text-[14px] text-white placeholder:text-white/30 outline-none resize-none"
          />
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <button
            onClick={() => addMutation.mutate({ title: title.trim(), url: url.trim(), notes: notes.trim() || undefined })}
            disabled={!title.trim() || !url.trim() || addMutation.isPending}
            className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[15px] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {addMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {addMutation.isPending ? "Adding…" : "Add video"}
          </button>
          <button
            onClick={onClose}
            className="w-full h-[48px] rounded-full border-[1.5px] border-[#888888] text-white font-medium text-[15px]"
          >
            Cancel
          </button>
        </div>
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

  if (addOpen) {
    return <AddVideoScreen onClose={() => setAddOpen(false)} onDone={refetch} />;
  }

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
              className="flex gap-3 bg-[#1E1E1E] rounded-2xl overflow-hidden cursor-pointer hover:bg-[#252525] active:opacity-75 transition-colors"
            >
              {/* Thumbnail */}
              <div
                className="shrink-0 flex items-center justify-center bg-[#2C2C2C]"
                style={{ width: 112, minHeight: 80 }}
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
                <p className="text-[15px] font-medium text-white leading-tight truncate">{v.title}</p>
                <p className="text-[13px] text-[#888888] mt-0.5">{formatDate(v.postedDate)}</p>
                <p className="text-[13px] text-[#888888] truncate">{v.postedBy}</p>
                {v.notes && (
                  <p className="text-[13px] text-[#888888] mt-1 line-clamp-2 whitespace-pre-line">{v.notes}</p>
                )}
              </div>

              {/* Admin delete */}
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
    </div>
  );
}
