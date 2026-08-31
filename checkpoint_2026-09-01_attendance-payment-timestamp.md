# Checkpoint — 2026-09-01 — Data-tab attendance + payment transfer timestamp

**Session goal:** (1) Fix the Admin → Data attendee counts, wrong for months. (2) Show the transfer timestamp in admin payment details. (3) Review all documentation.

**Status:** Shipped to `main` at `ce06177`. Railway auto-deploys. **Nothing is blocked on this checkpoint** — see "Open dependency" for the one thing that is not mine to finish.

Ran alongside a concurrent session fixing "cannot add a payment record" (`Code_v17` + `admin.addPayment`). This work deliberately did not touch `addPayment` / `AddPaymentSheet`.

---

## What was wrong

### Attendance (Bug 17)
`sheet_sessions.attendance` is a column **nothing maintains**. It was seeded once from Sheet col [14]; `addSession` hardcodes `attendance: 0`; no mutation ever updates it. So every app-created session read 0 forever and every seeded session was frozen at its count on seeding day.

Measured against live data before touching anything:

| | sessions |
|---|---|
| Showed **0 attendees despite having sign-ups** | **52** |
| Stale (stored ≠ live, always low) | 19 |
| Correct by coincidence | 30 |
| Genuinely zero (future sessions) | 54 |
| **Depended on the column for data sign-ups cannot reproduce** | **0** |

That last row is why replacing it was safe. `revenue` on the same card was *already* derived live, so the two numbers side by side described different things — a session could read `0 attendees · +$258`.

### Payment timestamp (Bug 18)
All 459 payment rows carry a real bank transfer time. It was never displayed, and editing would have destroyed it: the form is an `<input type="date">` returning `"YYYY-MM-DD"`, which GAS `normalisePaymentDate()` expands to `"M/D/YYYY 00:00:00"`.

Latent since v13 and **about to start biting** — `editPaymentRow` was missing from the live script from v14 until v17, so edits failed outright rather than corrupting data. The fix landed before v17 goes live, which is the order that matters.

### toIsoDate (Bug 19)
Both `toIsoDate` helpers fell back to `new Date(raw).toISOString()`. `new Date("1 March 2026")` is local midnight; `toISOString()` rolls it back a day east of UTC. 148 of 155 sessions store free-text dates, so off-UTC every one keyed to the wrong day. Railway runs in UTC so production was unaffected — found only because the Bug 17 unit test failed locally in SGT.

---

## What shipped (`ce06177`)

- `server/routers.ts` — `admin.allSessions` builds `attendanceMap` alongside `revenueMap` on the same `date+pool` key; blank-`dateOfTraining` rows (Trial/Membership) skipped. `admin.editPayment` gained `preservePaymentTime()` + an `originalDate` input. `toIsoDate` reads local components.
- `server/googleSheets.ts` — same `toIsoDate` fix.
- `client/src/lib/dateUtils.ts` — `extractTimeOfDay` / `parseAnyDateTime` / `formatDateTimeDisplay`.
- `client/src/pages/Admin.tsx` — read-only "Transfer received" row; sends `originalDate`.
- `server/paymentDate.test.ts`, `server/adminSessions.test.ts` — 22 tests.
- `SYSTEM.md` (§5, §8, §12, §13, §14 + Bugs 17–19), `TEST_CASES.md`, `TESTING_CHECKLIST.md`.

---

## Verification already done — do not redo this

Both fixes were checked against the **live DB**, not just unit tests:

| Check | Result |
|---|---|
| All 459 payment rows: open → save-unchanged → reopen | 0 time lost, 0 date drift, re-saves idempotent |
| Same, under `TZ=UTC`, `Asia/Singapore`, `America/New_York` | identical — helpers are timezone-independent |
| Derived attendance vs the Attendees sheet, all 155 sessions | 0 mismatches |
| Duplicate `date+pool` session keys | 0 (155 sessions, 155 keys) |
| Pool values with stray whitespace | 0 |
| `EditSessionSheet` / `admin.editSession` write attendance back? | No — no such field, derived value cannot leak into the dead column |

Adversarial review of the diff found three real bugs in the first draft, all fixed before push (see "Review findings" below).

---

## What to confirm on the deployed app

| Check | Expected |
|---|---|
| Admin → Data | **No session shows "0 attendees" beside a non-zero PnL** |
| Data-tab counts vs Sessions tab → tap card → Attendees | identical |
| Overall PnL figure | **unchanged** — revenue was already live; only attendance moved |
| Admin → Payments → tap a payment | "Transfer received" shows a real date **and** time, not midnight |
| Save that payment unchanged, reopen | timestamp identical |

**Expect the numbers to jump.** 52 sessions go 0 → real count, 19 more increase. That is the fix working, not a new bug.

---

## Open dependency (not mine to close)

`google-apps-script/Code_v17_2026-09-01.gs` is **untracked in the repo and may not be deployed to GAS.** Until it is:

- `editPaymentRow` is absent from the live script → payment edits fail with "Failed to save to Sheet"
- `preservePaymentTime()` therefore never runs — it sits behind that call

Check with `curl -s "$GOOGLE_APPS_SCRIPT_URL"` → should say `v17 running` (see SYSTEM.md §14, "Which version is actually LIVE"). This is the concurrent session's file; it and the `scripts/debug-*.ts` files were deliberately left uncommitted.

---

## Review findings (all fixed pre-push, kept for the reasoning)

1. **`preservePaymentTime` read a table that sync empties.** It recovered the time via a fresh `sheet_payments` read, but `syncTab("payments")` does a full DELETE+INSERT — a save landing in that window reads no row and writes a bare ISO date, causing the exact loss the fix exists to prevent. Now sourced from the client's `originalDate`, DB read only as fallback. **The lesson generalises: never make a data-loss fix depend on a table that is periodically empty.**
2. **Display dropped seconds.** Live data has five rows at `17:30:00`–`17:30:04`; all rendered identically, defeating reconciliation. Seconds now shown.
3. **DB lookup ran before the `rowIndex >= 2` guard.** Guard moved up. Deliberate side effect: a no-op save on a row with no Sheet reference now errors instead of returning success.

---

## Known, not fixed

- **Two sessions sharing `date+pool`** (e.g. two time slots at one pool on one day) would each report the *combined* attendance and revenue, double-counting in Overall PnL. Pre-existing for revenue; the change extends the same key to attendance. **0 such sessions today.** Real fix is the sign-up → session FK in §13.
- **Sign-up id `242246`** — "Regular Training", `2026-03-10`, **blank pool**. Matches no session, so its $33.33 is silently absent from every PnL total. Needs its pool set or the row deleted.
- **Two pre-existing failing tests** — `sessions.detail`, `auth.logout`. Unrelated. Baseline is **42 passing / 2 failing**; compare against that before blaming a change.
- **6 pre-existing type errors** (`Admin.tsx` Set iteration ×3, `AnnouncementDetail.tsx`, `sdk.ts` ×2). `pnpm check` is not clean and was not clean before.

---

## Rollback

`git revert ce06177` → push to `main`. Attendance reverts to the dead column (0 for most sessions) and the timestamp row disappears; payment edits revert to zeroing the transfer time once v17 is live. No schema changes, no data migration — nothing to undo beyond the code.

---

## How to resume from this checkpoint cold

1. Read `SYSTEM.md` §5 (`sheet_sessions.attendance` is dead data), §8 ("Payment transfer timestamp", "Date normalisation must use LOCAL components"), and Bugs 17–19 in §9.
2. **Before diagnosing any payment-write bug, check the live GAS version** (§14). A stale deployment looks exactly like a logic error.
3. If Data-tab counts look wrong again: the count comes from `admin.allSessions` in `server/routers.ts`, keyed `toIsoDate(date)+"__"+pool.trim()`. Compare against the Attendees sheet for the same session — if those disagree, the keying is the suspect, not the column.
4. If a payment timestamp is lost again: check whether `originalDate` is still being sent from `EditPaymentSheet`, then whether GAS `normalisePaymentDate()` changed its passthrough rule for non-ISO input.
