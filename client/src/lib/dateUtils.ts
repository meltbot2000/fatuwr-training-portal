/**
 * Shared date utilities — handles the mixed date formats that exist across
 * Google Sheets, the DB, and ISO strings.
 *
 * Formats seen in practice:
 *   - ISO timestamp : "2025-10-16T15:28:30.179Z"
 *   - ISO date      : "2025-10-16"
 *   - DD/MM/YYYY    : "16/01/2026"   (app input fields)
 *   - M/D/YYYY      : "1/16/2026"    (Sheets default in some locales)
 *   - Human         : "15 May 2008"  (DOB from Sheets)
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

  // M/D/YYYY or MM/DD/YYYY (Sheets US locale)
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
