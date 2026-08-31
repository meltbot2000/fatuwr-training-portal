import { describe, expect, it } from "vitest";
import { preservePaymentTime, timeOfDayFrom } from "./routers";
import { extractTimeOfDay, parseAnyDateTime, formatDateTimeDisplay } from "@/lib/dateUtils";

// ─── Server: transfer time preservation on admin payment edit ────────────────
//
// Payment dates in col C carry the real transfer timestamp. The admin edit form
// is an <input type="date"> and can only send "YYYY-MM-DD"; without this the
// the Sheet stores a date-only col C as midnight and the time is lost.

describe("timeOfDayFrom", () => {
  it("reads the time from the GAS payment format", () => {
    expect(timeOfDayFrom("5/4/2026 14:30:00")).toBe("14:30:00");
  });

  it("pads an unpadded hour (Sheets re-renders 0:13:12)", () => {
    expect(timeOfDayFrom("8/29/2026 0:13:12")).toBe("00:13:12");
  });

  it("reads the time from an ISO timestamp", () => {
    expect(timeOfDayFrom("2026-05-04T14:30:00.000Z")).toBe("14:30:00");
  });

  it("treats exactly 00:00:00 as no time recorded", () => {
    expect(timeOfDayFrom("5/4/2026 00:00:00")).toBe("");
  });

  it("returns empty for a date-only value", () => {
    expect(timeOfDayFrom("2026-05-04")).toBe("");
    expect(timeOfDayFrom("5/4/2026")).toBe("");
    expect(timeOfDayFrom("")).toBe("");
  });
});

describe("preservePaymentTime", () => {
  it("re-attaches the existing transfer time to a date-only edit", () => {
    expect(preservePaymentTime("2026-05-06", "5/4/2026 14:30:00")).toBe("5/6/2026 14:30:00");
  });

  it("keeps the time when only another field changed (date resubmitted unchanged)", () => {
    expect(preservePaymentTime("2026-05-04", "5/4/2026 14:30:00")).toBe("5/4/2026 14:30:00");
  });

  it("does not pad month or day — matches GAS formatDateTime output", () => {
    expect(preservePaymentTime("2026-01-02", "1/2/2026 09:05:01")).toBe("1/2/2026 09:05:01");
  });

  it("passes the date through when the row has no time recorded", () => {
    expect(preservePaymentTime("2026-05-06", "5/4/2026")).toBe("2026-05-06");
    expect(preservePaymentTime("2026-05-06", "")).toBe("2026-05-06");
  });

  it("passes through a value that already carries a time", () => {
    expect(preservePaymentTime("5/6/2026 08:00:00", "5/4/2026 14:30:00")).toBe("5/6/2026 08:00:00");
  });

  it("is idempotent — re-saving does not drift the date or drop the time", () => {
    const once  = preservePaymentTime("2026-05-04", "5/4/2026 14:30:00");
    const twice = preservePaymentTime("2026-05-04", once);
    expect(twice).toBe(once);
  });
});

// ─── Client: transfer timestamp display ──────────────────────────────────────

describe("extractTimeOfDay", () => {
  it("reads GAS payment dates, padding the hour", () => {
    expect(extractTimeOfDay("5/4/2026 14:30:00")).toBe("14:30:00");
    expect(extractTimeOfDay("8/29/2026 0:13:12")).toBe("00:13:12");
  });

  it("returns empty for date-only and normalisation-artefact midnight", () => {
    expect(extractTimeOfDay("5/4/2026")).toBe("");
    expect(extractTimeOfDay("2026-05-04")).toBe("");
    expect(extractTimeOfDay("5/4/2026 00:00:00")).toBe("");
    expect(extractTimeOfDay("NA")).toBe("");
    expect(extractTimeOfDay("")).toBe("");
  });
});

describe("parseAnyDateTime", () => {
  it("preserves the time that parseAnyDate discards", () => {
    const d = parseAnyDateTime("5/4/2026 14:30:00")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);       // May
    expect(d.getDate()).toBe(4);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
    expect(d.getSeconds()).toBe(0);
  });

  it("falls back to midnight for a date-only value", () => {
    const d = parseAnyDateTime("2026-05-04")!;
    expect(d.getHours()).toBe(0);
  });

  it("returns null for unparseable input", () => {
    expect(parseAnyDateTime("")).toBeNull();
    expect(parseAnyDateTime("NA")).toBeNull();
  });
});

describe("formatDateTimeDisplay", () => {
  it("includes the time when one is recorded", () => {
    const out = formatDateTimeDisplay("5/4/2026 14:30:00");
    expect(out).toContain("4 May 2026");
    expect(out).toMatch(/2:30:00/);
  });

  it("keeps seconds so transfers in the same minute stay distinguishable", () => {
    const a = formatDateTimeDisplay("12/31/2025 17:30:00");
    const b = formatDateTimeDisplay("12/31/2025 17:30:04");
    expect(a).not.toBe(b);
  });

  it("shows date only when no time is recorded", () => {
    expect(formatDateTimeDisplay("5/4/2026")).toBe("4 May 2026");
  });

  it("renders an em dash for an empty value", () => {
    expect(formatDateTimeDisplay("")).toBe("—");
  });
});
