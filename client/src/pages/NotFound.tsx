import { useLocation } from "wouter";
import { Home } from "lucide-react";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen bg-[#111111] flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-[64px] font-bold text-white/10 leading-none mb-4">404</p>
        <p className="text-[18px] font-semibold text-white/80 mb-1">Page not found</p>
        <p className="text-[13px] text-white/40 mb-8">This page doesn't exist or has been moved.</p>
        <button
          onClick={() => setLocation("/")}
          className="h-11 px-6 rounded-xl bg-[#4DA6FF] text-white font-semibold text-[14px] flex items-center gap-2 mx-auto"
        >
          <Home className="w-4 h-4" />
          Go home
        </button>
      </div>
    </div>
  );
}
