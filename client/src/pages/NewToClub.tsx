import AppHeader from "@/components/AppHeader";

export default function NewToClub() {
  return (
    <div className="min-h-screen bg-[#111111] pb-24">
      <AppHeader title="New to the Club?" showBack backPath="/" />
      <main className="mx-auto max-w-[480px] px-4 pt-8 text-center">
        <p className="text-[16px] text-[#888888]">Welcome! A guide is coming soon.</p>
      </main>
    </div>
  );
}
