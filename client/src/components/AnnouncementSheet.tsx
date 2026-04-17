import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: { id: number; title: string | null; imageUrl: string | null } | null;
  onDone?: () => void;
};

export default function AnnouncementSheet({ open, onOpenChange, existing, onDone }: Props) {
  const isEdit = !!existing;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl ?? "");

  useEffect(() => {
    if (open) {
      setTitle(existing?.title ?? "");
      setImageUrl(existing?.imageUrl ?? "");
    }
  }, [open, existing]);

  const utils = trpc.useUtils();
  const createMutation = trpc.announcements.create.useMutation({
    onSuccess: async () => {
      toast.success("Announcement posted.");
      await utils.announcements.list.invalidate();
      onDone?.();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.announcements.update.useMutation({
    onSuccess: async () => {
      toast.success("Announcement updated.");
      await utils.announcements.list.invalidate();
      onDone?.();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = () => {
    if (!title.trim() && !imageUrl.trim()) {
      toast.error("Please add a title or image URL.");
      return;
    }
    if (isEdit && existing) {
      updateMutation.mutate({ id: existing.id, title: title.trim() || undefined, imageUrl: imageUrl.trim() || undefined });
    } else {
      createMutation.mutate({ title: title.trim() || undefined, imageUrl: imageUrl.trim() || undefined });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl bg-[#2A2A2A] border-t-0 px-4 pb-8">
        <SheetHeader className="pt-4 pb-3">
          <SheetTitle className="text-[15px] font-medium text-white">
            {isEdit ? "Edit announcement" : "New announcement"}
          </SheetTitle>
        </SheetHeader>

        <div className="bg-[#1E1E1E] rounded-xl overflow-hidden divide-y divide-[#2C2C2C] mb-4">
          <div className="flex items-center gap-3 px-4 min-h-[48px]">
            <span className="text-[14px] text-[#888888] w-24 shrink-0">Title</span>
            <Input
              placeholder="Optional"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-transparent border-0 p-0 text-[14px] text-white focus-visible:ring-0 h-8"
            />
          </div>
          <div className="flex items-center gap-3 px-4 min-h-[48px]">
            <span className="text-[14px] text-[#888888] w-24 shrink-0">Image URL</span>
            <Input
              placeholder="Optional"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="bg-transparent border-0 p-0 text-[14px] text-white focus-visible:ring-0 h-8"
            />
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[15px] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isPending ? "Saving…" : isEdit ? "Save" : "Post"}
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="w-full h-[48px] rounded-full border-[1.5px] border-[#888888] text-white font-medium text-[15px]"
          >
            Cancel
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
