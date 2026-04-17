import AppHeader from "@/components/AppHeader";

export default function FunResources() {
  return (
    <div className="min-h-screen bg-[#111111] pb-24">
      <AppHeader title="Fun Resources" showBack backPath="/" />
      <main className="mx-auto max-w-[480px] px-4 pt-8 text-center">
        <p className="text-[16px] text-[#888888]">Coming soon — fun stuff from the club 🐟</p>
      </main>
    </div>
  );
}
