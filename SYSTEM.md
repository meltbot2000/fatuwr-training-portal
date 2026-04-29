# FATUWR Training Portal — System Reference

*Last updated: 2026-04-29*

---

## 1. Purpose

Web app for FATUWR Singapore (underwater rugby club) to manage:
- Training session listings and member sign-ups
- Payment tracking (Maybank PayNow via GAS email parsing)
- Membership management (trial, annual, student)
- Club communications (announcements, merch, resources, videos)
- Admin operations (sessions, users, payments, PnL)

**Not a public app.** Deployed at `fatuwr.up.railway.app`. Access by invite only.

---

## 2. Architecture

```
Browser (React/Vite PWA)
  │  tRPC over HTTP
  ▼
Railway Node.js server (Express + tRPC)
  │  Drizzle ORM
  ▼
Railway MySQL (PRIMARY data store)
  ├── sheet_sessions    ← app writes; seeded from Sheets on first boot
  ├── sheet_signups     ← app writes; seeded from Sheets on first boot
  ├── sheet_payments    ← GAS-owned; synced via /api/sync webhook + 6h fallback
  ├── sheet_users       ← Sheets cache; DELETE+INSERT on sync — NEVER write app data here
  ├── users             ← auth table + profile photo (users.image)
  ├── otp_codes
  ├── announcements     ← fully DB-primary
  ├── merch_items       ← fully DB-primary
  └── videos            ← fully DB-primary

Google Apps Script (GAS)
  └── only role: process Maybank payment emails → write to Sheets → ping /api/sync

Cloudflare R2
  └── all user photos (profiles, announcements, merch) stored as objects
      DB columns store the public R2 URL (~80 bytes), not base64
```

**DB is the source of truth for everything except payments, which are owned by GAS/Sheets.**

---

## 3. Infrastructure

| Component | Service | Notes |
|---|---|---|
| App hosting | Railway | Auto-deploys from GitHub `main`. Dockerfile: pnpm install → pnpm build → `node dist/index.js` |
| Database | Railway MySQL | `DATABASE_URL` env var |
| Image storage | Cloudflare R2 | S3-compatible; free tier (10 GB, 1M requests, zero egress) |
| Email (OTP) | Resend | `RESEND_API_KEY`, `RESEND_API_FROM` |
| Payment emails | Google Apps Script | Gmail-based; 1-min cron trigger |
| Backup | SMTP/Resend | Daily CSV email to fatuwrevents@gmail.com at 23:59 SGT |

### Required environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Railway MySQL connection string |
| `JWT_SECRET` | Cookie signing |
| `NODE_ENV` | `production` |
| `RESEND_API_KEY` | OTP email |
| `RESEND_API_FROM` | OTP from address |
| `GOOGLE_APPS_SCRIPT_URL` | GAS web app URL |
| `APPS_SCRIPT_SECRET` | Shared token for /api/sync auth |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account JSON (single line) for Sheets reads |
| `CLOUDFLARE_R2_ACCOUNT_ID` | R2 account |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 API token key |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `CLOUDFLARE_R2_BUCKET` | R2 bucket name |
| `CLOUDFLARE_R2_PUBLIC_URL` | R2 public base URL (e.g. `https://pub-xxx.r2.dev`) |

---

## 4. Key flows

### 4.1 OTP login

```
User enters email → POST auth.sendOtp
  → rate limit check (1 send/email/60s)
  → crypto.randomInt(0, 1_000_000) → 6-digit code → store in otp_codes
  → Resend email

User enters code → POST auth.verifyOtp
  → rate limit check (5 fails/10min → locked)
  → verify code + expiry
  → existing user: set JWT cookie → redirect to /
  → new user: needsProfileCompletion=true → profile step
    → POST auth.completeProfile → upsert users row → set cookie → redirect to /

On first login: copy sheetUsers.image → users.image (Glide URL inheritance)
Trial status check: if sheetUsers.trialEndDate < today → treat as Non-Member immediately
```

### 4.2 Sign-up submit

```
User taps Sign Up → /signup/:rowId (SignUpForm.tsx)
  → fee calculated client-side via feeUtils.ts (membership status × activity × session fees)
  → debt check: load getAllSignupsByEmail + getMyPayments → compute balance
  → debt > $50: block (non-admin)
  → POST signups.submit
    → server: re-check debt (non-admin only)
    → duplicate check (non-admin only)
    → dateOfTraining = toIsoDate(sessionDate) — always writes ISO
    → insert into sheet_signups
    → clearSessionsCache()
  → navigate to /
```

### 4.3 Payment processing (GAS path — only remaining GAS flow)

```
Maybank email → Gmail label "Maybank2"
  → GAS 1-min cron → processMaybankEmails()
  → parse credit amount + reference
  → write row to Sheets payments tab
  → POST /api/sync?tab=payments&token=SECRET
  → server deletes+reinserts sheet_payments from Sheets
```

### 4.4 Image upload (R2)

```
User selects photo → client compresses to max 600×600 JPEG 0.75 quality (~50–150 KB)
  → base64 data URL → POST profile.updatePhoto (or announcements/merch mutation)
  → server: isDriveDataUrl(imageUrl)?
      YES (new upload) → replaceOldDriveFile(oldUrl) → delete old R2 object
                       → uploadToDrive(base64DataUrl, filename) → PutObjectCommand to R2
                       → return https://<r2PublicUrl>/photos/<uuid>-<filename>
      NO (existing URL echoed back) → store as-is, do NOT delete R2 object
  → store URL in DB column
```

**Critical guard:** When editing an announcement or merch item without changing the image, the client echoes the existing R2 URL back in the payload. The server must check `isDriveDataUrl()` before deleting the old R2 object — otherwise the image is silently deleted and the URL in the DB becomes a 404. Only call `replaceOldDriveFile` when the incoming value is a `data:` base64 string (a genuinely new upload). This applies to `announcements.update` and `merch.update`.

### 4.5 Trial membership sign-up

```
User taps "Sign up for Trial" on /membership (Non-Member only — blocked if trialStartDate already set)
  → POST membership.signupTrial
    → guard: hasTrialled (trialStartDate set) → BAD_REQUEST
    → guard: already Trial/Member/Student → BAD_REQUEST
    → insert sheetSignups row: activity="Trial Membership", baseFee/actualFees=$10, pool/dateOfTraining=""
    → trialStart = today (DD/MM/YYYY), trialEnd = today + 3 months (DD/MM/YYYY)
    → UPDATE sheet_users SET memberStatus="Trial", trialStartDate, trialEndDate
      WHERE email = $email OR userEmail = $email
    → upsertUser: memberStatus="Trial", trialStartDate, trialEndDate
  → return updated user; UI refreshes membership page to show trial card
```

**Key behaviours:**
- $10 trial fee is recorded as a sign-up row — it appears in the user's Payments page under Membership Fees and contributes to their debt
- Dates stored as `DD/MM/YYYY` format
- Trial cannot be taken a second time (trialStartDate guard)
- Trial is 3 calendar months from today regardless of training schedule

### 4.6 Annual membership sign-up

```
User taps "Become a Member" on /membership (any authenticated user)
  → POST membership.signupMember
    → pro-rated fee: $80 × (12 − currentMonthIndex) / 12, rounded to nearest dollar
      (Jan = full $80; Dec = ~$7)
    → insert sheetSignups row: activity="Membership Fee", baseFee/actualFees=proRatedFee,
      dateOfTraining=today (DD/MM/YYYY), pool=""
    → UPDATE sheet_users SET memberStatus="Member", membershipStartDate=today
      WHERE email = $email OR userEmail = $email
    → upsertUser: memberStatus="Member"   ← membershipStartDate is NOT on the users table; only sheetUsers has it
  → return updated user
```

**Key behaviours:**
- Annual fee is pro-rated: full $80 in January, reduced by completed months through the year
- Fee is recorded as a sign-up row (activity="Membership Fee") — visible in Payments page under Membership Fees
- `MEMBERSHIP_ACTIVITIES = ["Membership Fee", "Trial Membership"]` — both appear under Membership Fees section in Payments, not Training Fees
- Membership start date stored as `DD/MM/YYYY` in `sheetUsers.membershipStartDate` only — the `users` table has no such column

### 4.7 Admin delete of sign-up / membership records

Admin can delete any sign-up row from **Admin → User → Sign-ups tab**. The delete logic differs by `activity`:

| `activity` value | Delete behaviour |
|---|---|
| `"Trial Membership"` | Delete row; reset `memberStatus → "Non-Member"`, clear `trialStartDate` + `trialEndDate` on both `users` and `sheetUsers` |
| `"Membership Fee"` | Delete row; revert `memberStatus`: if `trialEndDate` is still in the future → `"Trial"`; else → `"Non-Member"`. Also clear `sheetUsers.membershipStartDate`. |
| Any other (training session) | Delete row only; no status changes |

tRPC procedures:
- `admin.deleteSignup` — training sign-ups (activity is a session activity name)
- `admin.deleteMembershipSignup` — membership records (Trial Membership / Membership Fee); handles status revert

Both are Admin-only. After delete, the sign-ups list refreshes and the inline edit panel collapses.

### 4.8 Session sign-up count display

```
Sessions list: COUNT(signups) per session using toIsoDate(trainingDate) as key
Session detail: getSignUpsForSession(date, pool)
  → full scan of sheet_signups filtered by datesMatch() + pool
  → datesMatch() uses new Date() — handles mixed formats (ISO + "19 April 2026")
  → NEVER use exact WHERE on dateOfTraining — date format inconsistency in legacy rows
```

---

## 5. Data model — key tables

### `sheet_sessions`
PK: `rowIndex` (sheet row number). Contains all session metadata: date, pool, fees, attendance, isClosed, training objective, sign-up close time. `trainingDate` field may contain "19 April 2026" format (legacy) or "2026-04-19" (app-created).

### `sheet_signups`
PK: auto-increment `id`. Linked to sessions by `pool + dateOfTraining` string matching (no FK — tech debt). `dateOfTraining` is always ISO for app-written rows; legacy seeded rows may be "19 April 2026". Always use `datesMatch()` for comparisons.

### `sheet_payments`
PK: auto-increment `id`. GAS-owned. Full DELETE+INSERT on every sync. `paymentId` is primary attribution key; email is fallback.

### `sheet_users`
PK: auto-increment `id`. Sheets cache. **Full DELETE+INSERT on forceSync — never store app-generated data here.** `image` column stores legacy Glide URL only.

### `users`
PK: `id` (UUID). Auth table. `email`, `name`, `phone`, `dob`, `memberStatus`, `clubRole`, `paymentId`, `image` (MEDIUMTEXT — R2 URL or null).

### `announcements`, `merch_items`, `videos`
Fully DB-primary. Never touch Sheets. The `videos` table includes a `notes` text column (free-text field shown on video cards and in the add-video form).

---

## 6. Key file locations

| Concern | File |
|---|---|
| Schema | `drizzle/schema.ts` |
| tRPC router (all mutations) | `server/routers.ts` |
| GAS caller | `server/appsScript.ts` |
| Sheets read cache | `server/googleSheets.ts` |
| DB sync service | `server/sync.ts` |
| Image upload (R2) | `server/driveUpload.ts` |
| Daily backup | `server/backup.ts` |
| Server entry + /api/sync endpoint | `server/_core/index.ts` |
| Environment config | `server/_core/env.ts` |
| OTP email send | `server/email.ts` |
| GAS script (live) | `google-apps-script/Code_v10_2026-04-18.gs` |
| Date utilities | `client/src/lib/dateUtils.ts` |
| Fee utilities | `client/src/lib/feeUtils.ts` |
| Routes | `client/src/App.tsx` |
| Landing / login | `client/src/pages/Login.tsx` |
| Announcement detail | `client/src/pages/AnnouncementDetail.tsx` |
| Sessions list | `client/src/pages/Sessions.tsx` |
| Session detail | `client/src/pages/SessionDetail.tsx` |
| Sign-up form | `client/src/pages/SignUpForm.tsx` |
| Edit sign-up sheet | `client/src/components/EditSignupSheet.tsx` |
| Profile | `client/src/pages/Profile.tsx` |
| Admin panel | `client/src/pages/Admin.tsx` |
| Bottom nav | `client/src/components/BottomNav.tsx` |

---

## 7. Access model

**`memberStatus` and `clubRole` are independent and concurrent.** A user always has a `memberStatus` (Non-Member / Trial / Member / Student) AND optionally a `clubRole` (empty / Helper / Admin). These are not mutually exclusive — an Admin can be a Non-Member, a Helper can be a Member, etc.

### memberStatus — determines fee rate and membership UI

| Status | Fee rate | Notes |
|---|---|---|
| Non-Member | Non-member rate | Default for new accounts; debt warnings and nudge apply |
| Trial | Member rate | Valid until `trialEndDate`; expiry nudge shown ≤14 days before; auto-downgraded to Non-Member after expiry |
| Member | Member rate | Annual member |
| Student | Student rate | Managed by Admin only |

### clubRole — determines administrative access

| Role | Access |
|---|---|
| (none) | No admin access |
| Helper | Can **read** Admin panel (Members tab, Payments tab); can **write** announcements, merch, videos; cannot access Sessions or Data tabs; cannot edit users or payments |
| Admin | Full admin access; bypasses debt blocking and duplicate sign-up check; can edit users, payments, sessions, run data imports |

### Unauthenticated users
- All routes redirect to `/login` (the welcome/landing screen) when not authenticated
- The welcome screen shows the logo, "Sign in" and "Create account" buttons — no app content is accessible before login

---

## 8. Critical behaviours

### PaymentId-primary attribution
If a sign-up or payment row has a `paymentId`, ownership is by paymentId **only** — email is ignored. This is essential because admins create sign-ups on behalf of others using the person's paymentId (with the admin's own email on the row).

### Date format inconsistency (CRITICAL — do not regress)
- Sessions seeded from Sheets: `trainingDate` = `"19 April 2026"` (free text)
- Sessions created in-app: `trainingDate` = `"2026-04-19"` (ISO)
- Sign-ups: `dateOfTraining` now always ISO (write-time normalisation via `toIsoDate()`)
- **Rule**: always use `datesMatch()` for session ↔ sign-up comparisons. Never use an exact DB WHERE on these date columns without verifying format uniformity first.

### Session visibility cutoff
Sessions hidden from user-facing list once `now > sessionStart + 1 hour` in SGT (UTC+8). Admin panel shows all sessions always.

### sheet_users is a sync cache — never write app data to it
`forceSync("users")` does DELETE+INSERT — any app-written data would be wiped. Profile photos must be in `users.image`, not `sheetUsers.image`.

### Trial membership — fee rate is determined by the SESSION DATE, not today's date

**The most important rule:** what matters for fee calculation is whether the **training session's date** falls within the user's trial period — not whether the user is a Trial member at the moment they sign up.

- A Trial member signing up for a session **on or before** `trialEndDate` → **member fee rate**
- A Trial member signing up for a session **after** `trialEndDate` → **non-member fee rate** + warning shown in sign-up form, even though the user is still technically on Trial status today

This is implemented in `getMembershipOnTrainingDate()` in `client/src/lib/feeUtils.ts`, which takes the session date as input and compares it against `trialEndDate`. The result is used for all fee calculations in the sign-up form and edit sheet.

**Why this matters:** A member could sign up weeks in advance for a session that falls after their trial expires. Charging them the member rate at sign-up time would be incorrect — they should be paying non-member fees for that session.

Additional trial behaviour:
- Trial is a `memberStatus` value, independent of `clubRole`. A Helper or Admin can also be on Trial.
- Trial cannot be taken more than once — guarded by `trialStartDate` being set (even if the trial has since expired).
- Expiry is enforced two ways: (1) server-side job runs at startup + every 24h, flips expired Trial → Non-Member in `users` table; (2) `resolveSheetMemberStatus()` on login applies the same logic immediately so a stale DB row doesn't briefly show the wrong status after expiry.
- Trial warning banner shown on `/` (Sessions) when ≤14 days remain until `trialEndDate`.

### 60-second sessions cache
`getSessions()` caches results in module-level vars for 60 seconds. `clearSessionsCache()` is called after every session mutation. Do not add other tables to this cache without careful thought — payments and sign-ups must be fresh.

---

## 9. Recurring bugs & lessons

### Bug 1: Session detail showed fewer sign-ups than sessions list
**Root cause:** `getSignUpsForSession` had an exact WHERE `dateOfTraining = $isoDate`. Most rows matched, but legacy rows with `"21 April 2026"` format did not. The query returned early (non-zero result), silently dropping the remaining rows.
**Fix:** Full table scan + JS `datesMatch()` in `getSignUpsForSession`. Composite index ready for when all rows are normalised.
**Lesson:** Never use an exact WHERE on date columns from Sheets until 100% of values are in the expected format.

### Bug 2: Sign-up count on sessions list always showed 0
**Root cause:** Lookup key built from `s.trainingDate` (raw "19 April 2026") didn't match ISO keys from sign-ups.
**Fix:** `toIsoDate(s.trainingDate)` normalises before building the lookup map.

### Bug 3: Glide photo migration only migrated 7/84 users
**Root cause:** Migration looked for a `users` row per sheetUser. 77 users had never logged into the new app — no `users` row existed.
**Fix:** For sheet-only users, write to `sheetUsers.image` by PK instead. On first login, copy `sheetUsers.image` → `users.image`.

### Bug 4: Google Drive upload quota error for service accounts
**Root cause:** "Service Accounts do not have storage quota." Service accounts cannot write to personal Google Drive.
**Fix:** Switched to Cloudflare R2 (S3-compatible). `server/driveUpload.ts` exports kept same signatures.

### Bug 5: iOS bottom nav / header scrolling detachment
**Root cause:** iOS Safari demotes `position: fixed` elements from GPU layers when compositing budget exceeded or a CSS containing block is created.
**Fix:** `transform: translateZ(0)` + `backfaceVisibility: hidden` on both `BottomNav` and `AppHeader`. `willChange: transform` is intentionally NOT used — creates a new containing block and breaks child fixed elements.
**Long-term fix (not yet done):** Scroll inner container instead of body.

### Bug 6: Railway console backticks cause bash substitution
When running SQL in Railway's console, backticks are interpreted as bash command substitution. Use unquoted column names in lowercase or single quotes instead.

### Bug 7: Railway console auto-appends LIMIT 100
Do not include your own LIMIT clause when querying in Railway console — syntax error results.

### Bug 8: Signup edit/delete must use DB primary key
**Rule:** Always edit/delete sign-ups by `id` (DB PK). Matching by `email + pool + date` can affect multiple rows due to date format inconsistency.

### Bug 9: R2 image silently deleted on announcement/merch edit (fixed 2026-04-29)
**Root cause:** `announcements.update` and `merch.update` called `replaceOldDriveFile(oldUrl)` unconditionally whenever `imageUrl`/`photo` was present in the payload. The client echoes the existing URL back when editing text fields without changing the image — so the R2 object was deleted, leaving a broken image in the DB.
**Fix:** Gate the delete+re-upload on `isDriveDataUrl(input.imageUrl)`. If the value is already a hosted URL (not a `data:` base64 string), store it as-is and do not touch R2.
**Rule:** Only call `replaceOldDriveFile` when the incoming value is a `data:` base64 string. This applies to every mutation that accepts an image field.

### Bug 10: membershipStartDate silently dropped on upsertUser (fixed 2026-04-29)
**Root cause:** `membership.signupMember` passed `membershipStartDate` to `db.upsertUser()`, but the `users` table has no such column. `InsertUser` (Drizzle's inferred type) does not include it — Drizzle silently ignores unknown fields, so the value was never persisted to `users`.
**Fix:** Removed `membershipStartDate` from the `upsertUser` call. The correct write path is `sheetUsers` only (already done one line above via `UPDATE sheet_users SET memberStatus="Member", membershipStartDate=today`).
**Rule:** `membershipStartDate` belongs to `sheetUsers` only. Never attempt to write it to `users`.

---

## 10. How we work together (Claude ↔ Melanie)

### Context continuity
- **Always read `SYSTEM.md` + the latest `checkpoint_*.md` at session start.** These are the single source of truth — not the conversation history.
- Before any significant change, check whether the relevant section of `SYSTEM.md` describes the current state correctly.

### GAS files — versioning rule
**Never overwrite or edit existing `.gs` files.** Always create a new versioned file (e.g. `Code_v11_2026-05-01.gs`). GAS has no version control; the file name is the history.

### Deployment
- Push to `main` → Railway auto-deploys.
- Schema changes: run `pnpm db:push` (or `railway run pnpm db:push`) after deploy.
- Check Railway logs for `[Sync]` entries and health endpoint `/api/health`.

### When something looks wrong in the DB
- Use Railway's MySQL console for investigation.
- Remember: backtick = bash substitution; no LIMIT clause needed; lowercase unquoted column names work.

### Before touching sign-up / payment logic
- Re-read §8 Critical behaviours and §9 Recurring bugs.
- The paymentId-primary rule and date format handling have caused multiple regressions — treat these as the most fragile parts of the system.

### Mutations that touch session data
Always call `clearSessionsCache()` after any session mutation. Already done in all 8 handlers in `routers.ts` — verify when adding new session mutations.

### When in doubt, ask first
If a requirement is ambiguous, a behaviour is unclear, or there is a risk of making a wrong assumption that would require reverting code — **stop and ask** rather than guessing and writing code. This applies especially to: role/permission logic, financial calculations, date handling, and anything that writes to the DB. A one-line clarifying question is always cheaper than a regression.

---

## 11. Test cases — core flows

Full test case matrix is in `TEST_CASES.md`. Below are the **highest-risk cases** to verify after any deployment.

### AUTH — smoke tests
| ID | Scenario | Expected |
|---|---|---|
| A1 | Enter valid email → OTP arrives → enter correct 6-digit code | Redirect to `/`; JWT cookie set |
| A2 | Enter correct code for new email | Profile step shown; after name submitted, redirect to `/` |
| A3 | Enter wrong code 5× within 10 min | Locked with wait message |
| A4 | OTP resend before 60s | Button disabled |

### SIGN-UP — smoke tests
| ID | Scenario | Expected |
|---|---|---|
| S1 | Sign up for open session as Member | Success; count increments on sessions list |
| S2 | Sign up for same session twice (non-admin) | CONFLICT error |
| S3 | Debt > $50 (non-admin) | Submit button disabled |
| S4 | Admin signs up for closed session | Succeeds (admin bypass) |
| S5 | Session detail after sign-up | All attendees shown including newly added; count matches sessions list |

### PAYMENTS — smoke tests
| ID | Scenario | Expected |
|---|---|---|
| P1 | Maybank credit email arrives | Appears in Admin payments tab within ~2 min |
| P2 | Payment matched by paymentId (no email) | Appears correctly in user's Payments page |

### IMAGES — smoke tests
| ID | Scenario | Expected |
|---|---|---|
| I1 | Upload profile photo | Shown in avatar immediately; persists after reload |
| I2 | Replace profile photo | Old R2 object deleted; new URL in DB |
| I3 | Run "Migrate Glide photos" (Admin → Data) | Glide URLs replaced with R2 URLs |

---

## 12. Automated testing approach

The app currently has no automated tests. The recommended approach:

### Unit tests — server logic (highest ROI)
Use **Vitest** (already in the monorepo's JS ecosystem).

Priority functions to test:
- `feeUtils.ts` — `getMembershipOnTrainingDate`, `getActivityFee`, `computeDebt` — pure functions, easy to unit test with fixture data
- `dateUtils.ts` — `parseAnyDate`, `formatDisplayDate`, `toIsoDate`, `datesMatch` — pure functions; many edge cases (M/D/YYYY, ISO, "19 April 2026")
- `getSignUpsForSession` — mock DB, test that mixed-format dates all match correctly
- `generatePaymentId` — mock DB, test all 4 naming steps

```bash
# Install
pnpm add -D vitest

# Add to package.json scripts
"test": "vitest run"

# Example test file
# server/__tests__/dateUtils.test.ts
import { describe, it, expect } from 'vitest';
import { datesMatch, toIsoDate } from '../lib/dateUtils';

describe('datesMatch', () => {
  it('matches ISO to ISO', () => expect(datesMatch('2026-04-19', '2026-04-19')).toBe(true));
  it('matches "19 April 2026" to ISO', () => expect(datesMatch('19 April 2026', '2026-04-19')).toBe(true));
  it('rejects different dates', () => expect(datesMatch('2026-04-19', '2026-04-20')).toBe(false));
});
```

### Integration tests — tRPC endpoints
Use **supertest** or Vitest with a test DB (separate `DATABASE_URL`).

Priority endpoints:
- `auth.sendOtp` — rate limiting (mock clock with `vi.useFakeTimers`)
- `auth.verifyOtp` — correct code, wrong code, expired code, locked state
- `signups.submit` — debt blocking, duplicate check, admin bypass
- `/api/sync` — auth token check, tab validation

### E2E tests — critical user paths
Use **Playwright** (native TypeScript support, mobile viewport emulation).

Priority flows:
1. Full login flow (landing → email → OTP → home)
2. Session sign-up + verify count on list matches detail
3. Admin: add session → close session → view PnL

```bash
pnpm add -D @playwright/test
npx playwright install chromium

# playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  use: { baseURL: 'http://localhost:3000' },
  projects: [
    { name: 'Mobile Safari', use: { ...devices['iPhone 14'] } },
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

### Running in CI
Add to `.github/workflows/test.yml`:
```yaml
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install
      - run: pnpm test          # unit tests
      # E2E: needs DATABASE_URL pointing at a test DB
      # - run: pnpm test:e2e
```

### Current manual testing checklist
Until automated tests exist, run through `TESTING_CHECKLIST.md` (role-based smoke tests) after every deploy.

---

## 13. Outstanding work / tech debt

### High priority
1. **Sign-up ↔ session linkage by session FK** — currently matched by `pool + dateOfTraining` string. Fragile. Add `sessionRowId` FK to `sheet_signups`; update submit + addSignup to populate it.
2. **Normalise legacy session dates** — `sheet_sessions.trainingDate` may contain "19 April 2026". One-time UPDATE to ISO allows indexed queries on sessions.
3. **GAS bug: Maybank2 label not removed** — after `thread.addLabel(doneLabel)`, add `thread.removeLabel(maybankLabel)`. Paste fix into Apps Script editor.

### Medium priority
4. **Restore indexed WHERE on `getSignUpsForSession`** — safe after all dates are normalised.
5. **Prevent body scroll (long-term iOS fix)** — scroll inner container instead of `<body>` to permanently fix fixed-element detachment on iOS Safari.

### Deferred / nice-to-have
6. **Real-time payment notifications** — Pub/Sub (Gmail push) instead of 1-min cron. Current 1-min cron is the ceiling for Apps Script.
7. **Automated tests** — as described in §12.
8. **Newbie flow screens 2–6** — design complete in `design_handoff_newbie_flow/`; only the welcome landing screen (screen 1) has been implemented.

---

## 14. GAS version history

| File | Notes |
|---|---|
| `Code_v10_2026-04-18.gs` | Previous live version |
| `Code_v11_2026-04-26.gs` | **DEPLOY THIS** — OAuth validity check + alert email; both labels → Maybank_Done2; appendPaymentRow in try-catch with per-thread write-ok flag |

**Never edit live GAS files in place. Always create a new versioned file.**
