import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppHeader from "@/components/AppHeader";
import MerchEditSheet from "@/components/MerchEditSheet";
import { Plus, Package } from "lucide-react";

function MerchCard({ item }: { item: { id: number; name: string; photo1: string | null; memberPrice: string | null } }) {
  return (
    <Link href={`/fun-resources/merch/${item.id}`}>
      <div className="bg-[#1E1E1E] rounded-2xl overflow-hidden cursor-pointer active:opacity-80 transition-opacity">
        {/* Square image */}
        <div className="relative w-full" style={{ paddingBottom: "100%" }}>
          {item.photo1 ? (
            <img src={item.photo1} alt={item.name}
              className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[#2A2A2A]">
              <Package className="w-8 h-8 text-white/20" />
            </div>
          )}
        </div>
        {/* Name + price */}
        <div className="px-3 py-2.5">
          <p className="text-[13px] font-medium text-white leading-snug line-clamp-2">{item.name}</p>
          {item.memberPrice && (
            <p className="text-[12px] text-[#888888] mt-0.5">{item.memberPrice}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function FunResourcesMerch() {
  const { user } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const canManage = (user as any)?.clubRole === "Admin" || (user as any)?.clubRole === "Helper";

  const { data: items = [], isLoading, refetch } = trpc.merch.list.useQuery();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#111111] pb-32">
      <AppHeader title="FATUWR Merchandise" showBack backPath="/fun-resources" />

      <main className="mx-auto max-w-[480px] px-4 pt-6">

        {isLoading && (
          <div className="grid grid-cols-2 gap-3">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="rounded-2xl bg-[#1E1E1E] animate-pulse aspect-square" />
            ))}
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="text-center py-16">
            <Package className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-[13px] text-[#888888]">No items yet.</p>
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {items.map(item => <MerchCard key={item.id} item={item} />)}
          </div>
        )}

        {/* Add button — admin/helper only */}
        {canManage && (
          <button onClick={() => setAddOpen(true)}
            className="mt-4 w-full h-[48px] rounded-full bg-[#2196F3] text-white font-medium text-[15px] flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" />
            Add item
          </button>
        )}
      </main>

      {canManage && (
        <MerchEditSheet
          open={addOpen}
          onOpenChange={setAddOpen}
          onDone={refetch}
        />
      )}
    </div>
  );
}
