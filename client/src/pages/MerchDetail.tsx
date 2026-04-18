import { useState } from "react";
import { useParams } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import MerchEditSheet from "@/components/MerchEditSheet";
import { Pencil, Package } from "lucide-react";

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value?.trim()) return null;
  return (
    <div className="px-4 py-3 border-b border-[#2C2C2C] last:border-0">
      <p className="text-[12px] font-semibold uppercase tracking-widest text-[#888888] mb-1">{label}</p>
      <p className="text-[14px] text-white whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  );
}

export default function MerchDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const canManage = (user as any)?.clubRole === "Admin" || (user as any)?.clubRole === "Helper";

  const { data: item, isLoading, refetch } = trpc.merch.get.useQuery(
    { id: parseInt(id || "0") },
    { enabled: !!id }
  );

  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#111111]">
        <AppHeader title="Merchandise" showBack backPath="/fun-resources/merch" />
        <main className="mx-auto max-w-[480px] px-4 pt-6 space-y-3">
          {[240, 80, 120, 80].map((h, i) => (
            <div key={i} className="rounded-2xl bg-[#1E1E1E] animate-pulse" style={{ height: h }} />
          ))}
        </main>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-[#111111]">
        <AppHeader title="Merchandise" showBack backPath="/fun-resources/merch" />
        <main className="mx-auto max-w-[480px] px-4 pt-16 text-center">
          <Package className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-[13px] text-[#888888]">Item not found.</p>
        </main>
      </div>
    );
  }

  const photos = [item.photo1, item.photo2].filter(Boolean) as string[];

  return (
    <div className="min-h-screen bg-[#111111] pb-32">
      <AppHeader title="Merchandise" showBack backPath="/fun-resources/merch" />

      <main className="mx-auto max-w-[480px] px-4 pt-6 space-y-4 pb-8">

        {/* Photos */}
        {photos.length > 0 && (
          <div className="space-y-2">
            {photos.map((src, i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-[#1E1E1E]">
                <img src={src} alt={`${item.name} photo ${i + 1}`}
                  className="w-full object-cover" style={{ maxHeight: 320 }} />
              </div>
            ))}
          </div>
        )}

        {/* Name + description */}
        <div>
          <h1 className="text-[20px] font-bold text-white leading-snug">{item.name}</h1>
          {item.description && (
            <p className="text-[14px] text-[#888888] mt-1.5 leading-relaxed whitespace-pre-wrap">{item.description}</p>
          )}
        </div>

        {/* Details card */}
        <div className="bg-[#1E1E1E] rounded-2xl overflow-hidden">
          <InfoRow label="Member Price"       value={item.memberPrice ?? ""} />
          <InfoRow label="Non-Member Price"   value={item.nonMemberPrice ?? ""} />
          <InfoRow label="Available Sizes"    value={item.availableSizes ?? ""} />
          <InfoRow label="How to Purchase"    value={item.howToPurchase ?? ""} />
          <InfoRow label="Inventory"          value={item.inventory ?? ""} />
        </div>

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
        <MerchEditSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          existing={item}
          onDone={refetch}
        />
      )}
    </div>
  );
}
