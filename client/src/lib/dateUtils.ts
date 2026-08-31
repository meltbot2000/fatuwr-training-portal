/**
 * Shared date utilities — handles the mixed date formats that exist across
 * Google Sheets, the DB, and ISO strings.
 *
 * Formats seen in practice:
 *   - ISO timestamp   : "2025-10-16T15:28:30.179Z"
 *   - ISO date        : "2025-10-16"
 *   - DD/MM/YYYY      : "16/01/2026"   (app input fields)
 *   - M/D/YYYY        : "1/16/2026"    (Sheets US locale, date only)
 *   - M/D/YYYY H:MM:SS: "5/4/2026 14:30:00"  (GAS formatDateTime — payment dates)
 *   - Human           : "15 May 2008"  (DOB from Sheets)
 */

/**
 * Parse any of the known date string formats into a Date object (midnight local).
 * Returns null for empty, "NA", or unparseable strings.
 */
export function parseAnyDate(str: string): Date | null {
  if (!str || str === "NA" || str === "N/A") return null;

  // ISO timestamp or ISO date — parse directly
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str);
    // Normalise to local midnight so date comparisons aren't timezone-shifted
    const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return isNaN(local.getTime()) ? null : local;
  }

  // DD/MM/YYYY — explicit parse (must come before M/D/YYYY to avoid ambiguity)
  // Match: two-digit day / two-digit month / four-digit year
  const ddmm = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmm) {
    const [, dd, mm, yyyy] = ddmm.map(Number);
    const d = new Date(yyyy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // M/D/YYYY HH:MM:SS — GAS formatDateTime output for payment dates.
  // Must be checked before plain M/D/YYYY since the time suffix prevents the
  // plain regex from matching. Time component is discarded (date-only display).
  const mdyTime = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+\d{1,2}:\d{2}:\d{2}$/);
  if (mdyTime) {
    const [, m, d, y] = mdyTime.map(Number);
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? null : date;
  }

  // M/D/YYYY or MM/DD/YYYY (Sheets US locale, date only)
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy.map(Number);
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? null : date;
  }

  // Human-readable fallback: "15 May 2008" etc.
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  return null;
}

/**
 * Format any date string for display: "16 January 2026"
 */
export function formatDisplayDate(str: string): string {
  const d = parseAnyDate(str);
  if (!d) return str || "—";
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });
}

/* ─── Time-of-day aware helpers ───────────────────────────────────────────────
 *
 * parseAnyDate() deliberately throws away the time component so that date
 * comparisons are timezone-safe.  Payment rows, however, carry a real
 * transfer timestamp in col C of the Payments sheet ("M/D/YYYY HH:MM:SS",
 * written by GAS formatDateTime from the Maybank email's own send time), and
 * the admin needs to see it to reconcile a transfer.  These helpers keep that
 * component instead of discarding it.
 *
 * A time of exactly 00:00:00 is treated as "no time recorded", not as
 * midnight: it is what lands in col C when a date-only
 * value is saved, so it is a normalisation artefact rather than a real
 * transfer time.
 */

/** True for a full ISO timestamp ("2026-05-04T14:30:00Z") — parsed natively. */
function isIsoTimestamp(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str);
}

/**
 * "HH:MM:SS" if the string carries a real time-of-day, "" otherwise.
 * Wall-clock components as written, except for ISO timestamps (which carry a
 * zone) where the local-time rendering is used.
 */
export function extractTimeOfDay(str: string): string {
  if (!str || str === "NA" || str === "N/A") return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const zeroed = (hh: string, mm: string, ss: string) => hh === "00" && mm === "00" && ss === "00";

  if (isIsoTimestamp(str)) {
    const d = new Date(str);
    if (isNaN(d.getTime())) return "";
    const hh = pad(d.getHours()), mm = pad(d.getMinutes()), ss = pad(d.getSeconds());
    return zeroed(hh, mm, ss) ? "" : `${hh}:${mm}:${ss}`;
  }

  // "M/D/YYYY HH:MM:SS" (GAS payment dates, hour may be unpadded after Sheets
  // reformats it) or "YYYY-MM-DD HH:MM:SS".
  const m = str.match(/\s(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return "";
  const hh = pad(Number(m[1])), mm = m[2], ss = m[3] ?? "00";
  return zeroed(hh, mm, ss) ? "" : `${hh}:${mm}:${ss}`;
}

/**
 * Parse any known date string into a Date that PRESERVES the time-of-day.
 * Returns null for empty / "NA" / unparseable strings.
 */
export function parseAnyDateTime(str: string): Date | null {
  if (isIsoTimestamp(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }
  const base = parseAnyDate(str);
  if (!base) return null;
  const time = extractTimeOfDay(str);
  if (!time) return base;
  const [hh, mm, ss] = time.split(":").map(Number);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mm, ss);
}

/**
 * Format a payment/transfer date for display including the time when one is
 * recorded: "4 May 2026, 2:30:15 pm".  Falls back to date-only when the value
 * carries no real time-of-day.
 *
 * Seconds are shown deliberately: bulk-imported payments can share a minute and
 * differ only in the seconds field (the live data has five rows at 17:30:00–04),
 * so dropping them would make distinct transfers indistinguishable to an admin
 * reconciling them.
 */
export function formatDateTimeDisplay(str: string): string {
  const d = parseAnyDateTime(str);
  if (!d) return str || "—";
  const datePart = d.toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });
  if (!extractTimeOfDay(str)) return datePart;
  const timePart = d.toLocaleTimeString("en-SG", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  return `${datePart}, ${timePart}`;
}
