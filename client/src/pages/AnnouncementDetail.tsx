import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import AnnouncementSheet from "@/components/AnnouncementSheet";
import { Pencil, Trash2, Megaphone } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

/** Wrap bare URLs in <a> tags, leaving already-linked URLs untouched. */
function autoLink(html: string): string {
  return html.replace(
    /(?<!href=["'])(?<!src=["'])(https?:\/\/[^\s<>"']+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

/**
 * Prepare announcement content for rendering.
 * - If it already contains block-level HTML tags, treat as HTML and just auto-link.
 * - Otherwise treat as plain text: convert newlines → <br> then auto-link.
 */
function renderContent(raw: string): string {
  const hasBlockHtml = /<(p|h[1-6]|ul|ol|li|br|div|blockquote)\b/i.test(raw);
  const html = hasBlockHtml ? raw : raw.replace(/\n/g, "<br>");
  return autoLink(html);
}

export default function AnnouncementDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const canManage = (user as any)?.clubRole === "Admin" || (user as any)?.clubRole === "Helper";

  const { data: ann, isLoading, refetch } = trpc.announcements.get.useQuery(
    { id: parseInt(id || "0") },
    { enabled: !!id }
  );

  const [, navigate] = useLocation();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deleteMutation = trpc.announcements.delete.useMutation({
    onSuccess: () => navigate("/home"),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#111111]">
        <AppHeader title="Announcement" showBack backPath="/announcements" />
        <main className="mx-auto max-w-[480px] px-4 pt-6 space-y-3">
          {[240, 48, 120].map((h, i) => (
            <div key={i} className="rounded-2xl bg-[#1E1E1E] animate-pulse" style={{ height: h }} />
          ))}
        </main>
      </div>
    );
  }

  if (!ann) {
    return (
      <div className="min-h-screen bg-[#111111]">
        <AppHeader title="Announcement" showBack backPath="/announcements" />
        <main className="mx-auto max-w-[480px] px-4 pt-16 text-center">
          <Megaphone className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-[13px] text-[#888888]">Announcement not found.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111111] pb-32">
      <AppHeader title="Announcement" showBack backPath="/announcements" />

      <main className="mx-auto max-w-[480px] px-4 pt-6 pb-8 space-y-4">

        {/* Full-width image */}
        {ann.imageUrl && (
          <div className="rounded-2xl overflow-hidden">
            <img src={ann.imageUrl} alt={ann.title || "Announcement"} className="w-full object-cover" style={{ height: 192 }} />
          </div>
        )}

        {/* Title */}
        {ann.title && (
          <h1 className="text-[20px] font-bold text-white leading-snug">{ann.title}</h1>
        )}

        {/* Content — supports basic HTML (bold, italic, headings, links, lists) */}
        {ann.content && (
          <div className="bg-[#1E1E1E] rounded-2xl px-4 py-4 rich-content"
            dangerouslySetInnerHTML={{ __html: renderContent(ann.content) }}
          />
        )}

        {/* Date */}
        <p className="text-[12px] text-[#888888]">
          {new Date(ann.createdAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}
        </p>

        {/* Edit + Delete buttons — admin/helper only */}
        {canManage && (
          <div className="flex gap-3">
            <button onClick={() => setEditOpen(true)}
              className="flex-1 h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[15px] flex items-center justify-center gap-2">
              <Pencil className="w-4 h-4" />
              Edit
            </button>
            <button onClick={() => setDeleteOpen(true)}
              className="h-[48px] px-5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 font-medium text-[15px] flex items-center justify-center gap-2">
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}

      </main>

      {canManage && (
        <AnnouncementSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          existing={{ id: ann.id, title: ann.title, content: ann.content, imageUrl: ann.imageUrl, position: ann.position }}
          onDone={() => { refetch(); setEditOpen(false); }}
        />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              "{ann.title || "This announcement"}" will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => deleteMutation.mutate({ id: ann.id })}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
