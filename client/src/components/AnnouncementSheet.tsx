import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Loader2, ImagePlus } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: { id: number; title: string | null; content?: string | null; imageUrl: string | null } | null;
  onDone?: () => void;
};

export default function AnnouncementSheet({ open, onOpenChange, existing, onDone }: Props) {
  const isEdit = !!existing;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl ?? "");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle(existing?.title ?? "");
      setContent(existing?.content ?? "");
      setImageUrl(existing?.imageUrl ?? "");
      setFileName("");
    }
  }, [open, existing]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(reader.result as string);
      setFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

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
    if (!title.trim() && !content.trim() && !imageUrl.trim()) {
      toast.error("Please add a title, content, or image.");
      return;
    }
    const payload = {
      title: title.trim() || undefined,
      content: content.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
    };
    if (isEdit && existing) {
      updateMutation.mutate({ id: existing.id, ...payload });
    } else {
      createMutation.mutate(payload);
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
          {/* Title */}
          <div className="flex items-center gap-3 px-4 min-h-[48px]">
            <span className="text-[14px] text-[#888888] w-20 shrink-0">Title</span>
            <Input
              placeholder="Optional"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-transparent border-0 p-0 text-[14px] text-white focus-visible:ring-0 h-8"
            />
          </div>

          {/* Content */}
          <div className="flex gap-3 px-4 py-3">
            <span className="text-[14px] text-[#888888] w-20 shrink-0 pt-1">Content</span>
            <textarea
              placeholder="Optional"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className="flex-1 bg-transparent border-0 p-0 text-[14px] text-white resize-none outline-none placeholder:text-white/30"
            />
          </div>

          {/* Photo upload */}
          <div className="flex items-center gap-3 px-4 min-h-[48px]">
            <span className="text-[14px] text-[#888888] w-20 shrink-0">Photo</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 text-[14px] text-[#2196F3]"
            >
              <ImagePlus className="w-4 h-4" />
              {fileName || "Choose file"}
            </button>
          </div>

          {/* Image URL fallback */}
          <div className="flex items-center gap-3 px-4 min-h-[48px]">
            <span className="text-[14px] text-[#888888] w-20 shrink-0">Image URL</span>
            <Input
              placeholder="Or paste a URL"
              value={fileName ? "" : imageUrl}
              onChange={(e) => { setImageUrl(e.target.value); setFileName(""); }}
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
