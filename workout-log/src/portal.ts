/**
 * Client for the portal's partner API (/api/v1). The contract is documented in API.md.
 * This is the ONLY place this app talks to the portal.
 */
import { config } from "./config";

export interface PortalMember {
  id: number;
  name: string;
  image: string | null;
  memberStatus: string;
  clubRole: string;
}

export interface PortalTrainingRecord {
  signupId: number;
  date: string;
  pool: string;
  trainingTime: string;
  day: string;
  activity: string;
  sessionId: string;
  rainOff: "" | "half";
}

export class PortalError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message || code);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.portalUrl}/api/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.portalApiKey}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e: any) {
    throw new PortalError(502, "portal_unreachable", e?.message);
  }
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new PortalError(res.status, body?.error || "portal_error", body?.message);
  return body as T;
}

export const portal = {
  sendOtp: (email: string) =>
    call<{ ok: true }>("/auth/otp/send", { method: "POST", body: JSON.stringify({ email }) }),
  verifyOtp: (email: string, code: string) =>
    call<{ member: PortalMember }>("/auth/otp/verify", { method: "POST", body: JSON.stringify({ email, code }) }),
  searchMembers: (q: string) =>
    call<{ members: PortalMember[] }>(`/members?q=${encodeURIComponent(q)}`),
  getMembers: (ids: number[]) =>
    call<{ members: PortalMember[] }>(`/members?ids=${ids.join(",")}`),
  getTrainings: (memberId: number) =>
    call<{ member: PortalMember; records: PortalTrainingRecord[]; generatedAt: string }>(`/members/${memberId}/trainings`),
};
