import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { setStoredToken } from "@/main";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2, Mail, ShieldCheck, UserCircle2 } from "lucide-react";
import { toast } from "sonner";

const RESEND_COOLDOWN = 30;

export default function Login() {
  const [step, setStep] = useState<"email" | "otp" | "profile">("email");
  const [email, setEmail] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [emailError, setEmailError] = useState("");

  // Profile completion fields
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileDob, setProfileDob] = useState("");
  const [profileNameError, setProfileNameError] = useState("");

  // Resend cooldown
  const [resendSeconds, setResendSeconds] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = () => {
    setResendSeconds(RESEND_COOLDOWN);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendSeconds(s => {
        if (s <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const sendOtpMutation = trpc.auth.sendOtp.useMutation({
    onSuccess: () => {
      setStep("otp");
      startCooldown();
      toast.success("Verification code sent! Check your email.");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send verification code");
    },
  });

  const verifyOtpMutation = trpc.auth.verifyOtp.useMutation({
    onSuccess: (data) => {
      // Store token immediately — needed for completeProfile call too
      if (data.token) setStoredToken(data.token);
      if (data.needsProfileCompletion) {
        setStep("profile");
      } else {
        toast.success(data.isNewUser ? "Account created! Welcome to FATUWR." : "Welcome back!");
        window.location.href = "/";
      }
    },
    onError: (error) => {
      toast.error(error.message || "Invalid or expired code");
      setOtpValue("");
    },
  });

  const completeProfileMutation = trpc.auth.completeProfile.useMutation({
    onSuccess: () => {
      toast.success("Welcome to FATUWR! Your profile has been created.");
      window.location.href = "/";
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save profile");
    },
  });

  const validateEmail = (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!value.trim()) {
      setEmailError("Email is required");
      return false;
    }
    if (!emailRegex.test(value)) {
      setEmailError("Please enter a valid email address");
      return false;
    }
    setEmailError("");
    return true;
  };

  const handleSendCode = () => {
    if (!validateEmail(email)) return;
    sendOtpMutation.mutate({ email: email.trim() });
  };

  const handleVerifyCode = () => {
    if (otpValue.length !== 6) return;
    verifyOtpMutation.mutate({ email: email.trim(), code: otpValue });
  };

  const handleResend = () => {
    setOtpValue("");
    sendOtpMutation.mutate({ email: email.trim() });
  };

  const handleCompleteProfile = () => {
    if (!profileName.trim()) {
      setProfileNameError("Name is required");
      return;
    }
    setProfileNameError("");
    completeProfileMutation.mutate({
      name: profileName.trim(),
      phone: profilePhone.trim() || undefined,
      dob: profileDob || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="w-full max-w-[420px]">
        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className={`h-1.5 w-12 rounded-full transition-colors ${step === "email" ? "bg-gold" : "bg-white/30"}`} />
          <div className={`h-1.5 w-12 rounded-full transition-colors ${step === "otp" ? "bg-gold" : "bg-white/30"}`} />
          <div className={`h-1.5 w-12 rounded-full transition-colors ${step === "profile" ? "bg-gold" : "bg-white/30"}`} />
        </div>

        {/* Step label */}
        <p className="text-center text-white/60 text-xs mb-5">
          {step === "email" ? "Step 1 of 3 — Enter your email"
            : step === "otp" ? "Step 2 of 3 — Enter code"
            : "Step 3 of 3 — Complete your profile"}
        </p>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-navy flex items-center justify-center">
              {step === "email" ? (
                <Mail className="w-8 h-8 text-gold" />
              ) : step === "otp" ? (
                <ShieldCheck className="w-8 h-8 text-gold" />
              ) : (
                <UserCircle2 className="w-8 h-8 text-gold" />
              )}
            </div>
            <CardTitle className="text-2xl font-bold text-navy">
              {step === "email" ? "Sign In / Create Account"
                : step === "otp" ? "Check Your Email"
                : "Complete Your Profile"}
            </CardTitle>
            <CardDescription className="text-muted-foreground mt-1">
              {step === "email"
                ? "Enter your email to get started"
                : step === "otp"
                ? <>We sent a 6-digit code to <span className="font-medium text-navy">{email}</span></>
                : "Just a few details so we know who you are"}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4">
            {step === "profile" ? (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-navy">Full Name *</label>
                  <Input
                    type="text"
                    placeholder="e.g. Jane Tan"
                    value={profileName}
                    onChange={(e) => {
                      setProfileName(e.target.value);
                      if (profileNameError) setProfileNameError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleCompleteProfile()}
                    className={`h-12 text-base mt-1 ${profileNameError ? "border-destructive" : ""}`}
                    autoFocus
                    disabled={completeProfileMutation.isPending}
                  />
                  {profileNameError && (
                    <p className="text-sm text-destructive mt-1.5">{profileNameError}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-navy">Phone Number <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <Input
                    type="tel"
                    placeholder="e.g. 91234567"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className="h-12 text-base mt-1"
                    disabled={completeProfileMutation.isPending}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-navy">Date of Birth <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <Input
                    type="date"
                    value={profileDob}
                    onChange={(e) => setProfileDob(e.target.value)}
                    className="h-12 text-base mt-1"
                    disabled={completeProfileMutation.isPending}
                  />
                </div>

                <Button
                  onClick={handleCompleteProfile}
                  disabled={completeProfileMutation.isPending || !profileName.trim()}
                  className="w-full h-12 text-base font-semibold bg-gold hover:bg-gold-dark text-navy"
                >
                  {completeProfileMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Complete Sign Up"
                  )}
                </Button>
              </div>
            ) : step === "email" ? (
              <div className="space-y-4">
                <div>
                  <Input
                    type="email"
                    placeholder="yourname@email.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) validateEmail(e.target.value);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                    className={`h-12 text-base ${emailError ? "border-destructive" : ""}`}
                    autoFocus
                    disabled={sendOtpMutation.isPending}
                  />
                  {emailError && (
                    <p className="text-sm text-destructive mt-1.5">{emailError}</p>
                  )}
                </div>

                <Button
                  onClick={handleSendCode}
                  disabled={sendOtpMutation.isPending || !email.trim()}
                  className="w-full h-12 text-base font-semibold bg-gold hover:bg-gold-dark text-navy"
                >
                  {sendOtpMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Code"
                  )}
                </Button>
              </div>
            ) : step === "otp" ? (
              <div className="space-y-6">
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otpValue}
                    onChange={(val) => {
                      setOtpValue(val);
                      if (val.length === 6 && !verifyOtpMutation.isPending) {
                        verifyOtpMutation.mutate({ email: email.trim(), code: val });
                      }
                    }}
                    disabled={verifyOtpMutation.isPending}
                    inputMode="numeric"
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <Button
                  onClick={handleVerifyCode}
                  disabled={verifyOtpMutation.isPending || otpValue.length !== 6}
                  className="w-full h-12 text-base font-semibold bg-gold hover:bg-gold-dark text-navy"
                >
                  {verifyOtpMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify Code"
                  )}
                </Button>

                <div className="text-center space-y-2">
                  <button
                    onClick={handleResend}
                    disabled={sendOtpMutation.isPending || resendSeconds > 0}
                    className="text-sm text-navy font-medium hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendOtpMutation.isPending
                      ? "Sending..."
                      : resendSeconds > 0
                      ? `Resend code (${resendSeconds}s)`
                      : "Resend code"}
                  </button>
                  <div>
                    <button
                      onClick={() => { setStep("email"); setOtpValue(""); }}
                      className="text-sm text-muted-foreground hover:underline"
                    >
                      Use a different email
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <p className="text-center text-white/50 text-xs mt-6">
          FATUWR Training Portal
        </p>
      </div>
    </div>
  );
}
