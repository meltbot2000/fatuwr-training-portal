import { useState } from "react";
import { useParams } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import AnnouncementSheet from "@/components/AnnouncementSheet";
import { Pencil, Megaphone } from "lucide-react";

export default function AnnouncementDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const canManage = (user as any)?.clubRole === "Admin" || (user as any)?.clubRole === "Helper";

  const { data: ann, isLoading, refetch } = trpc.announcements.get.useQuery(
    { id: parseInt(id || "0") },
    { enabled: !!id }
  );

  const [editOpen, setEditOpen] = useState(false);

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

        {/* Content */}
        {ann.content && (
          <div className="bg-[#1E1E1E] rounded-2xl px-4 py-4">
            <p className="text-[14px] text-[#CCCCCC] leading-relaxed whitespace-pre-wrap">{ann.content}</p>
          </div>
        )}

        {/* Date */}
        <p className="text-[12px] text-[#888888]">
          {new Date(ann.createdAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}
        </p>

        {/* Edit button — admin/helper only */}
        {canManage && (
          <button onClick={() => setEditOpen(true)}
            className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[15px] flex items-center justify-center gap-2">
            <Pencil className="w-4 h-4" />
            Edit
          </button>
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
    </div>
  );
}
