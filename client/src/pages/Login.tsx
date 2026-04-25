import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { setStoredToken } from "@/main";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2, Mail, ShieldCheck, UserCircle2 } from "lucide-react";
import { toast } from "sonner";

const RESEND_COOLDOWN = 60;

export default function Login() {
  const [step, setStep] = useState<"landing" | "email" | "otp" | "profile">("landing");
  const [email, setEmail] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [emailError, setEmailError] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileDob, setProfileDob] = useState("");
  const [profileNameError, setProfileNameError] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = () => {
    setResendSeconds(RESEND_COOLDOWN);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendSeconds(s => {
        if (s <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const sendOtpMutation = trpc.auth.sendOtp.useMutation({
    onSuccess: () => { setStep("otp"); startCooldown(); toast.success("Verification code sent!"); },
    onError: (e) => toast.error(e.message || "Failed to send code"),
  });

  const verifyOtpMutation = trpc.auth.verifyOtp.useMutation({
    onSuccess: (data) => {
      if (data.token) setStoredToken(data.token);
      if (data.needsProfileCompletion) { setStep("profile"); }
      else { toast.success(data.isNewUser ? "Welcome to FATUWR!" : "Welcome back!"); window.location.href = "/"; }
    },
    onError: (e) => { toast.error(e.message || "Invalid or expired code"); setOtpValue(""); },
  });

  const completeProfileMutation = trpc.auth.completeProfile.useMutation({
    onSuccess: () => { toast.success("Welcome to FATUWR!"); window.location.href = "/"; },
    onError: (e) => toast.error(e.message || "Failed to save profile"),
  });

  const validateEmail = (value: string): boolean => {
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
    setEmailError(value.trim() ? (ok ? "" : "Please enter a valid email") : "Email is required");
    return !!value.trim() && ok;
  };

  const STEP_ICONS = { email: Mail, otp: ShieldCheck, profile: UserCircle2 };
  const STEP_TITLES = { email: "Sign in", otp: "Check your email", profile: "Complete profile" };
  const StepIcon = step !== "landing" ? STEP_ICONS[step] : Mail;

  // ── Landing screen ──────────────────────────────────────────────────────────
  if (step === "landing") {
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{
          background: `
            radial-gradient(circle at 18% 8%, rgba(33,150,243,0.35), transparent 45%),
            radial-gradient(circle at 88% 18%, rgba(33,150,243,0.22), transparent 40%),
            radial-gradient(circle at 50% 105%, rgba(33,150,243,0.28), transparent 55%),
            linear-gradient(180deg, #0a1a2e 0%, #0a0f1a 55%, #050810 100%)
          `,
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        {/* Soft caustic overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse at 60% 30%, rgba(147,197,253,0.12), transparent 50%),
              radial-gradient(ellipse at 20% 80%, rgba(33,150,243,0.10), transparent 55%)
            `,
            filter: "blur(20px)",
          }}
        />

        {/* Hero */}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center px-6 relative z-10">
          {/* Logo — outer wrapper holds halo; inner circle clips the image */}
          <div className="relative flex items-center justify-center" style={{ width: 115, height: 115 }}>
            {/* Pulsing halo — outside the clipping circle */}
            <div
              className="absolute rounded-full pointer-events-none"
              style={{
                inset: "-18%",
                background: "radial-gradient(circle, rgba(33,150,243,0.5) 0%, transparent 65%)",
                filter: "blur(10px)",
                animation: "fatuwr-pulse 3.6s ease-in-out infinite",
                zIndex: 0,
              }}
            />
            {/* White circle — clips image to circle */}
            <div
              className="relative rounded-full bg-white overflow-hidden flex items-center justify-center"
              style={{
                width: 115,
                height: 115,
                boxShadow: "0 10px 40px rgba(33,150,243,0.4), 0 0 0 1px rgba(33,150,243,0.15)",
                zIndex: 1,
              }}
            >
              <img
                src="/logo.jpg"
                alt="FATUWR Singapore"
                style={{ width: "82%", height: "82%", objectFit: "contain" }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-[26px] font-bold text-white leading-tight tracking-tight" style={{ maxWidth: 260 }}>
              Welcome to the FATUWR App
            </h1>
            <p className="text-[13px] text-white/68 leading-relaxed" style={{ maxWidth: 260 }}>
              Save the app to your homescreen as a webapp for added convenience!
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="relative z-10 flex flex-col gap-2.5 px-6 pb-10">
          <button
            onClick={() => setStep("email")}
            className="w-full h-12 rounded-full bg-[#2196F3] text-white font-semibold text-[15px] flex items-center justify-center"
            style={{ boxShadow: "0 10px 30px rgba(33,150,243,0.45), 0 2px 0 rgba(255,255,255,0.08) inset" }}
          >
            Sign in
          </button>
          <button
            onClick={() => setStep("email")}
            className="w-full h-12 rounded-full text-white font-medium text-[15px] flex items-center justify-center"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1.5px solid rgba(255,255,255,0.18)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            Create account
          </button>
        </div>

        {/* Pulse keyframe injected inline */}
        <style>{`
          @keyframes fatuwr-pulse {
            0%, 100% { transform: scale(1); opacity: 0.9; }
            50% { transform: scale(1.08); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111111] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">

        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {(["email", "otp", "profile"] as const).map(s => (
            <div key={s} className={`h-1 w-10 rounded-full transition-colors ${step === s ? "bg-[#2196F3]" : "bg-white/15"}`} />
          ))}
        </div>

        {/* Card */}
        <div className="bg-[#1E1E1E] rounded-2xl px-6 py-8 space-y-6">
          {/* Icon + title */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-xl bg-[#2a2a2a] flex items-center justify-center">
              <StepIcon className="w-6 h-6 text-[#2196F3]" />
            </div>
            <div>
              <p className="text-[20px] font-bold text-white">{STEP_TITLES[step]}</p>
              <p className="text-[13px] text-white/45 mt-0.5">
                {step === "email" ? "Enter your email to get started"
                  : step === "otp" ? <>6-digit code sent to <span className="text-white/70">{email}</span></>
                  : "A few details so we know who you are"}
              </p>
            </div>
          </div>

          {/* Email step */}
          {step === "email" && (
            <div className="space-y-3">
              <Input
                type="email"
                placeholder="yourname@email.com"
                value={email}
                onChange={e => { setEmail(e.target.value); if (emailError) validateEmail(e.target.value); }}
                onKeyDown={e => e.key === "Enter" && validateEmail(email) && sendOtpMutation.mutate({ email: email.trim() })}
                className="h-11 bg-[#2a2a2a] border-white/10 text-white placeholder:text-white/30"
                autoFocus
                disabled={sendOtpMutation.isPending}
              />
              {emailError && <p className="text-[12px] text-red-400">{emailError}</p>}
              <button
                onClick={() => { if (validateEmail(email)) sendOtpMutation.mutate({ email: email.trim() }); }}
                disabled={sendOtpMutation.isPending || !email.trim()}
                className="w-full h-[52px] rounded-full bg-[#2196F3] text-white font-bold text-[13px] disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {sendOtpMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {sendOtpMutation.isPending ? "Sending…" : "Send code"}
              </button>
            </div>
          )}

          {/* OTP step */}
          {step === "otp" && (
            <div className="space-y-5">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={otpValue}
                  onChange={val => {
                    setOtpValue(val);
                    if (val.length === 6 && !verifyOtpMutation.isPending) {
                      verifyOtpMutation.mutate({ email: email.trim(), code: val });
                    }
                  }}
                  disabled={verifyOtpMutation.isPending}
                  inputMode="numeric"
                >
                  <InputOTPGroup>
                    {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <button
                onClick={() => verifyOtpMutation.mutate({ email: email.trim(), code: otpValue })}
                disabled={verifyOtpMutation.isPending || otpValue.length !== 6}
                className="w-full h-[52px] rounded-full bg-[#2196F3] text-white font-bold text-[13px] disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {verifyOtpMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {verifyOtpMutation.isPending ? "Verifying…" : "Verify code"}
              </button>
              <div className="text-center space-y-1.5">
                <button
                  onClick={() => { setOtpValue(""); sendOtpMutation.mutate({ email: email.trim() }); }}
                  disabled={sendOtpMutation.isPending || resendSeconds > 0}
                  className="text-[13px] text-[#2196F3] disabled:opacity-40"
                >
                  {resendSeconds > 0 ? `Resend code (${resendSeconds}s)` : "Resend code"}
                </button>
                <div>
                  <button onClick={() => { setStep("email"); setOtpValue(""); }} className="text-[13px] text-white/35">
                    Use a different email
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Profile step */}
          {step === "profile" && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-white/35 block mb-1.5">Full Name *</label>
                <Input
                  type="text" placeholder="e.g. Jane Tan" value={profileName}
                  onChange={e => { setProfileName(e.target.value); if (profileNameError) setProfileNameError(""); }}
                  onKeyDown={e => e.key === "Enter" && profileName.trim() && completeProfileMutation.mutate({ name: profileName.trim(), phone: profilePhone.trim() || undefined, dob: profileDob || undefined })}
                  className={`h-11 bg-[#2a2a2a] border-white/10 text-white placeholder:text-white/30 ${profileNameError ? "border-red-500/60" : ""}`}
                  autoFocus disabled={completeProfileMutation.isPending}
                />
                {profileNameError && <p className="text-[12px] text-red-400 mt-1">{profileNameError}</p>}
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-white/35 block mb-1.5">Phone <span className="normal-case font-normal">(optional)</span></label>
                <Input type="tel" placeholder="e.g. 91234567" value={profilePhone}
                  onChange={e => setProfilePhone(e.target.value)}
                  className="h-11 bg-[#2a2a2a] border-white/10 text-white placeholder:text-white/30"
                  disabled={completeProfileMutation.isPending} />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-white/35 block mb-1.5">Date of Birth <span className="normal-case font-normal">(optional)</span></label>
                <Input type="date" value={profileDob} onChange={e => setProfileDob(e.target.value)}
                  className="h-11 bg-[#2a2a2a] border-white/10 text-white"
                  disabled={completeProfileMutation.isPending} />
              </div>
              <button
                onClick={() => {
                  if (!profileName.trim()) { setProfileNameError("Name is required"); return; }
                  completeProfileMutation.mutate({ name: profileName.trim(), phone: profilePhone.trim() || undefined, dob: profileDob || undefined });
                }}
                disabled={completeProfileMutation.isPending || !profileName.trim()}
                className="w-full h-[52px] rounded-full bg-[#2196F3] text-white font-bold text-[13px] disabled:opacity-40 flex items-center justify-center gap-2 mt-1"
              >
                {completeProfileMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {completeProfileMutation.isPending ? "Saving…" : "Complete sign up"}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-white/25 text-[11px] mt-5">FATUWR Training Portal</p>
      </div>
    </div>
  );
}
