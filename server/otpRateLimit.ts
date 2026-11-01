/**
 * OTP rate limiter (in-memory), shared by every login path: the portal's tRPC
 * auth.sendOtp / auth.verifyOtp and the partner API's /api/v1/auth/otp/* routes.
 * One module, one pair of maps — so a code requested through the workout app counts
 * against the same per-email limits as one requested in the portal.
 *
 * sendOtp: max 1 send per email per 60 s
 * verifyOtp: max 5 failed attempts per email per 10 min, then locked
 */
import { TRPCError } from "@trpc/server";
interface SendBucket { lastSent: number }
interface VerifyBucket { attempts: number; windowStart: number; locked: boolean }
const otpSendMap   = new Map<string, SendBucket>();
const otpVerifyMap = new Map<string, VerifyBucket>();
const SEND_COOLDOWN_MS    = 60_000;         // 60 s between sends
const VERIFY_WINDOW_MS    = 10 * 60_000;    // 10-minute window
const VERIFY_MAX_ATTEMPTS = 5;

export function checkSendRateLimit(email: string): void {
  const now = Date.now();
  const bucket = otpSendMap.get(email);
  if (bucket && now - bucket.lastSent < SEND_COOLDOWN_MS) {
    const secsLeft = Math.ceil((SEND_COOLDOWN_MS - (now - bucket.lastSent)) / 1000);
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Please wait ${secsLeft}s before requesting another code.` });
  }
  otpSendMap.set(email, { lastSent: now });
}

export function recordVerifyAttempt(email: string, success: boolean): void {
  const now = Date.now();
  let bucket = otpVerifyMap.get(email);
  if (!bucket || now - bucket.windowStart > VERIFY_WINDOW_MS) {
    bucket = { attempts: 0, windowStart: now, locked: false };
  }
  if (success) { otpVerifyMap.delete(email); return; }
  bucket.attempts += 1;
  if (bucket.attempts >= VERIFY_MAX_ATTEMPTS) bucket.locked = true;
  otpVerifyMap.set(email, bucket);
}

export function checkVerifyRateLimit(email: string): void {
  const now = Date.now();
  const bucket = otpVerifyMap.get(email);
  if (!bucket) return;
  // Reset window if expired
  if (now - bucket.windowStart > VERIFY_WINDOW_MS) { otpVerifyMap.delete(email); return; }
  if (bucket.locked) {
    const minsLeft = Math.ceil((VERIFY_WINDOW_MS - (now - bucket.windowStart)) / 60_000);
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Too many failed attempts. Try again in ${minsLeft} minute(s).` });
  }
}
