export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  portalUrl: (process.env.PORTAL_URL ?? "https://fatuwr.up.railway.app").replace(/\/+$/, ""),
  portalApiKey: process.env.PORTAL_API_KEY ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  syncIntervalMinutes: Math.max(5, Number(process.env.SYNC_INTERVAL_MINUTES) || 30),
  port: Number(process.env.PORT) || 3100,
  isProduction: process.env.NODE_ENV === "production",
};

export function assertConfig(): void {
  const missing = [
    ["DATABASE_URL", config.databaseUrl],
    ["PORTAL_API_KEY", config.portalApiKey],
    ["SESSION_SECRET", config.sessionSecret],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Missing required env: ${missing.join(", ")}`);
  if (config.sessionSecret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
}

/** Today's date in Singapore as YYYY-MM-DD. The club lives in SGT; the server runs in UTC. */
export function todaySgt(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(now);
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10); // pure UTC arithmetic on a UTC date — no shift
}
