import AppHeader from "@/components/AppHeader";
import { trpc } from "@/lib/trpc";
import { ExternalLink, Loader2 } from "lucide-react";

function LinkTable({ title, items }: { title: string; items: { title: string; url: string }[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 mb-2 px-1">
        {title}
      </p>
      <div className="bg-[#1E1E1E] rounded-2xl divide-y divide-[#2C2C2C] overflow-hidden">
        {items.map(({ title: label, url }) => (
          <a
            key={url || label}
            href={url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center justify-between px-4 min-h-[52px] transition-colors ${url ? "hover:bg-white/5 active:bg-white/8 cursor-pointer" : "cursor-default"}`}
          >
            <span className="text-[15px] text-white">{label}</span>
            {url && <ExternalLink className="w-4 h-4 text-[#888888] shrink-0 ml-2" />}
          </a>
        ))}
      </div>
    </div>
  );
}

export default function FunResourcesResources() {
  const { data, isLoading, error } = trpc.resources.list.useQuery();

  return (
    <div className="min-h-screen bg-[#111111] pb-32">
      <AppHeader title="Resources & Links" showBack backPath="/fun-resources" />

      <main className="mx-auto max-w-[480px] px-4 pt-5 space-y-5">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#888888] animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-[#1E1E1E] rounded-2xl px-4 py-10 text-center">
            <p className="text-[13px] text-[#888888]">Failed to load resources.</p>
          </div>
        )}

        {data && (
          <>
            {data.resources.length > 0 && (
              <LinkTable title="Resources" items={data.resources} />
            )}
            {data.usefulLinks.length > 0 && (
              <LinkTable title="Useful Links" items={data.usefulLinks} />
            )}
            {data.resources.length === 0 && data.usefulLinks.length === 0 && (
              <div className="bg-[#1E1E1E] rounded-2xl px-4 py-10 text-center">
                <p className="text-[13px] text-[#888888]">No resources available yet.</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
