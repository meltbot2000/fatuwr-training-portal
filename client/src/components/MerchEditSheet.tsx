import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Loader2, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type MerchItem = {
  id?: number;
  name?: string | null;
  description?: string | null;
  memberPrice?: string | null;
  nonMemberPrice?: string | null;
  photo1?: string | null;
  photo2?: string | null;
  availableSizes?: string | null;
  howToPurchase?: string | null;
  inventory?: string | null;
  sortOrder?: number | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: MerchItem | null;
  onDone: () => void;
};

function PhotoField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { onChange(reader.result as string); setFileName(file.name); };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-center gap-3 px-4 min-h-[48px]">
      <span className="text-[14px] text-[#888888] w-20 shrink-0">{label}</span>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 text-[13px] text-[#2196F3] shrink-0">
          <ImagePlus className="w-4 h-4" />
          {fileName || (value ? "Replace" : "Upload")}
        </button>
        {value && !fileName && (
          <span className="text-[12px] text-[#888888] truncate flex-1">URL set</span>
        )}
        {value && (
          <button onClick={() => { onChange(""); setFileName(""); }} className="ml-auto">
            <X className="w-3.5 h-3.5 text-[#888888]" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function MerchEditSheet({ open, onOpenChange, existing, onDone }: Props) {
  const isEdit = !!existing?.id;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [memberPrice, setMemberPrice] = useState(existing?.memberPrice ?? "");
  const [nonMemberPrice, setNonMemberPrice] = useState(existing?.nonMemberPrice ?? "");
  const [photo1, setPhoto1] = useState(existing?.photo1 ?? "");
  const [photo2, setPhoto2] = useState(existing?.photo2 ?? "");
  const [availableSizes, setAvailableSizes] = useState(existing?.availableSizes ?? "");
  const [howToPurchase, setHowToPurchase] = useState(existing?.howToPurchase ?? "");
  const [inventory, setInventory] = useState(existing?.inventory ?? "");
  const [sortOrder, setSortOrder] = useState(existing?.sortOrder?.toString() ?? "0");

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setDescription(existing?.description ?? "");
      setMemberPrice(existing?.memberPrice ?? "");
      setNonMemberPrice(existing?.nonMemberPrice ?? "");
      setPhoto1(existing?.photo1 ?? "");
      setPhoto2(existing?.photo2 ?? "");
      setAvailableSizes(existing?.availableSizes ?? "");
      setHowToPurchase(existing?.howToPurchase ?? "");
      setInventory(existing?.inventory ?? "");
      setSortOrder(existing?.sortOrder?.toString() ?? "0");
    }
  }, [open, existing]);

  const utils = trpc.useUtils();
  const refresh = () => { utils.merch.list.invalidate(); onDone(); onOpenChange(false); };

  const createMutation = trpc.merch.create.useMutation({
    onSuccess: () => { toast.success("Item added."); refresh(); },
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.merch.update.useMutation({
    onSuccess: () => { toast.success("Item updated."); refresh(); },
    onError: e => toast.error(e.message),
  });
  const deleteMutation = trpc.merch.delete.useMutation({
    onSuccess: () => { toast.success("Item deleted."); refresh(); },
    onError: e => toast.error(e.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const handleSave = () => {
    if (!name.trim()) { toast.error("Name is required."); return; }
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      memberPrice: memberPrice.trim(),
      nonMemberPrice: nonMemberPrice.trim(),
      photo1: photo1.trim() || undefined,
      photo2: photo2.trim() || undefined,
      availableSizes: availableSizes.trim(),
      howToPurchase: howToPurchase.trim() || undefined,
      inventory: inventory.trim() || undefined,
      sortOrder: parseFloat(sortOrder) || 0,
    };
    if (isEdit && existing?.id) {
      updateMutation.mutate({ id: existing.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] flex flex-col bg-[#2A2A2A] border-t-0 px-0 pb-0">
        <SheetHeader className="pt-4 pb-3 px-4 shrink-0">
          <SheetTitle className="text-[15px] font-medium text-white">
            {isEdit ? "Edit item" : "Add item"}
          </SheetTitle>
        </SheetHeader>

        <div className="overflow-y-auto flex-1 px-4 pb-8">
        <div className="bg-[#1E1E1E] rounded-xl overflow-hidden divide-y divide-[#2C2C2C] mb-4">
          {[
            { label: "Name *",          val: name,          set: setName,          ph: "Item name" },
            { label: "Member price",    val: memberPrice,   set: setMemberPrice,   ph: "e.g. 20 SGD" },
            { label: "Non-mbr price",   val: nonMemberPrice,set: setNonMemberPrice,ph: "e.g. 25 SGD / 30 AUD" },
            { label: "Sizes",           val: availableSizes,set: setAvailableSizes,ph: "e.g. XS, S, M, L, XL" },
            { label: "Sort order",      val: sortOrder,     set: setSortOrder,     ph: "0" },
          ].map(({ label, val, set, ph }) => (
            <div key={label} className="flex items-center gap-3 px-4 min-h-[48px]">
              <span className="text-[14px] text-[#888888] w-28 shrink-0">{label}</span>
              <Input value={val} onChange={e => set(e.target.value)} placeholder={ph}
                className="bg-transparent border-0 p-0 text-[14px] text-white focus-visible:ring-0 h-8" />
            </div>
          ))}

          {[
            { label: "Description",    val: description,   set: setDescription,   rows: 4 },
            { label: "How to buy",     val: howToPurchase, set: setHowToPurchase, rows: 3 },
            { label: "Inventory",      val: inventory,     set: setInventory,     rows: 4 },
          ].map(({ label, val, set, rows }) => (
            <div key={label} className="flex gap-3 px-4 py-3">
              <span className="text-[14px] text-[#888888] w-28 shrink-0 pt-1">{label}</span>
              <textarea value={val} onChange={e => set(e.target.value)} rows={rows}
                className="flex-1 bg-transparent border-0 p-0 text-[14px] text-white resize-none outline-none placeholder:text-white/30" />
            </div>
          ))}

          <PhotoField label="Photo 1" value={photo1} onChange={setPhoto1} />
          <PhotoField label="Photo 2" value={photo2} onChange={setPhoto2} />
        </div>

        <div className="space-y-2">
          <button onClick={handleSave} disabled={isPending}
            className="w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[15px] disabled:opacity-40 flex items-center justify-center gap-2">
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Add item"}
          </button>

          {isEdit && existing?.id && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button disabled={isPending}
                  className="w-full h-[48px] rounded-full border border-red-500/40 text-red-400 text-[15px] font-medium disabled:opacity-40 hover:bg-red-400/8 transition-colors">
                  Delete item
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete item?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently remove "{existing.name}" from the merch list.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate({ id: existing.id! })} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <button onClick={() => onOpenChange(false)}
            className="w-full h-[48px] rounded-full border-[1.5px] border-[#888888] text-white font-medium text-[15px]">
            Cancel
          </button>
        </div>
        </div>{/* end scrollable */}
      </SheetContent>
    </Sheet>
  );
}
