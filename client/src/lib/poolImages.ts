import ccab from "@/assets/pools/ccab.jpg";
import mgs from "@/assets/pools/mgs.jpg";
import queenstown from "@/assets/pools/queenstown.jpg";

/**
 * Pool photos, served from our own origin.
 *
 * They used to come from `drive.google.com/thumbnail?id=...`, which answers with a 302 to
 * a second host and marks the result `private, no-cache` — so every card cost two
 * cross-origin round trips and nothing was ever cached. One measured at 745ms for a 9.9KB
 * JPEG. Imported here instead, Vite content-hashes them into /assets, which the server
 * serves `immutable, max-age=1y`: fetched once per member, then free.
 *
 * Keys are matched case-insensitively against `session.pool`. A pool we do not have a
 * photo for falls back to whatever URL the Sheet holds, so adding a venue still works
 * without a deploy — it is just slower until its photo is added here.
 */
const BY_POOL: Record<string, string> = {
  ccab,
  mgs,
  queenstown,
};

export function poolImage(pool: string | null | undefined, fallbackUrl?: string | null): string {
  const key = (pool || "").toLowerCase().trim();
  return BY_POOL[key] || fallbackUrl || "";
}
