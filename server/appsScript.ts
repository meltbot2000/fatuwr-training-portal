import { ENV } from "./_core/env";

const GAS_TIMEOUT_MS = 30_000;

async function gasPost(action: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!ENV.gasUrl) {
    console.warn("[GAS] GOOGLE_APPS_SCRIPT_URL not set — skipping write");
    return { status: "success" };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GAS_TIMEOUT_MS);
  try {
    const res = await fetch(ENV.gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, token: ENV.appsScriptSecret, ...data }),
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`GAS request failed: ${res.status}`);
    const json = await res.json() as Record<string, unknown>;
    if (json.status === "error") throw new Error((json.message as string) || "GAS error");
    return json;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function submitSignUp(payload: {
  name: string;
  email: string;
  trainingDate: string;
  pool: string;
  activity: string;
  baseFee: number;
  actualFee: number;
  memberOnTrainingDate: string;
}) {
  return gasPost("submitSignUp", payload);
}

export function editSignup(payload: {
  email: string;
  trainingDate: string;
  pool: string;
  activity: string;
  baseFee: number;
  actualFee: number;
}) {
  return gasPost("editSignup", payload);
}

export function deleteSignup(payload: {
  email: string;
  trainingDate: string;
  pool: string;
}) {
  return gasPost("deleteSignup", payload);
}

export function createUser(payload: {
  name: string;
  email: string;
  paymentId: string;
}) {
  return gasPost("createUser", payload);
}

export function updateTrialSignup(email: string) {
  return gasPost("updateTrialSignup", { email });
}

export function updateMemberSignup(email: string) {
  return gasPost("updateMemberSignup", { email });
}

export function addMembershipSignup(payload: {
  email: string;
  name: string;
  activity: "Trial Membership" | "Membership Fee";
  actualFee: number;
}) {
  return gasPost("addMembershipSignup", payload);
}

export function grantStudentStatus(email: string) {
  return gasPost("grantStudentStatus", { email });
}

export function updateUser(payload: {
  email: string;
  memberStatus?: string;
  clubRole?: string;
}) {
  return gasPost("updateUser", payload);
}

export function addSession(payload: {
  trainingDate: string;
  day: string;
  trainingTime: string;
  pool: string;
  memberFee: number;
  nonMemberFee: number;
  memberSwimFee: number;
  nonMemberSwimFee: number;
  studentFee: number;
  studentSwimFee: number;
  trainerFee?: number;
  notes?: string;
  trainingObjective?: string;
}) {
  return gasPost("addSession", payload);
}

export function closeSession(payload: { rowId: string }) {
  return gasPost("closeSession", payload);
}
