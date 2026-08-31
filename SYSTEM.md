# FATUWR Training Portal — System Reference

*Last updated: 2026-09-01 (Data-tab attendance derived from sign-ups, payment transfer timestamp preserved + displayed, timezone-safe `toIsoDate`)*

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
Railway MySQL (PRIMARY read source for app)
  ├── sheet_sessions    ← DB-primary; app writes directly; seeded once from Sheets on first boot
  ├── sheet_signups     ← DB-primary; app writes directly; seeded once from Sheets on first boot
  ├── sheet_users       ← Sheets cache; full DELETE+INSERT on forceSync — NEVER write app data here
  ├── sheet_payments    ← Sheets cache; GAS is source of truth; Sheet→DB sync only
  ├── users             ← auth table + profile photo (users.image)
  ├── otp_codes
  ├── announcements     ← fully DB-primary
  ├── merch_items       ← fully DB-primary
  └── videos            ← fully DB-primary

Google Apps Script (GAS) — web app + 1-min cron
  └── processes Maybank payment emails → appends rows to Sheets payments tab
      → pings /api/sync?tab=payments only when new payment emails were found

Cloudflare R2
  └── all user photos (profiles, announcements, merch) stored as objects
      DB columns store the public R2 URL (~80 bytes), not base64
```

### Data flow directions — critical

```
DB-primary tabs (sessions, signups, users):
  App mutation → DB insert/update  (Sheet is NOT written for these)
  Sheets API → DB  (seeding only, via forceSync in Admin → Data tab)

Payments tab:
  Maybank email → GAS → Sheet append  (source of truth)
  Sheet → DB  (via syncTab, runs on startup, every 6h, and on GAS webhook when new payments arrive)
  Admin edit → GAS writes Sheet first → server updates DB directly (by rowIndex)

NEVER: DB → Sheet (except via the manual syncPaymentsFromDb GAS function — see §4.3)
```

**`DB_PRIMARY_TABS = ["sessions", "signups", "users"]`** — `syncTab()` in `sync.ts` skips these with a guard. Only `payments` goes through the Sheet→DB sync path automatically.

---

## 3. Infrastructure

| Component | Service | Notes |
|---|---|---|
| App hosting | Railway | Auto-deploys from GitHub `main`. Dockerfile: pnpm install → pnpm build → `node dist/index.js` |
| Database | Railway MySQL | `DATABASE_URL` env var |
| Image storage | Cloudflare R2 | S3-compatible; free tier (10 GB, 1M requests, zero egress) |
| Email (OTP) | Resend | `RESEND_API_KEY`, `RESEND_API_FROM` |
| Payment emails | Google Apps Script | Gmail-based; 1-min cron trigger on `processMaybankEmails`. Only calls `/api/sync` when new payment rows are written. |
| Alert email | Resend → SendGrid fallback → console.error | `sendAlertEmail()` in `server/email.ts`; sends to tanmelanie@gmail.com, fatuwr@gmail.com, fatuwrevents@gmail.com |
| Backup | SMTP/Resend | Daily CSV email to fatuwrevents@gmail.com at 23:59 SGT |

### Required environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Railway MySQL connection string |
| `JWT_SECRET` | Cookie signing |
| `NODE_ENV` | `production` |
| `RESEND_API_KEY` | OTP email + alert fallback |
| `RESEND_API_FROM` | OTP from address |
| `GOOGLE_APPS_SCRIPT_URL` | GAS web app URL — must match the active deployed version (not a past version) |
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

**Login title:** The landing screen has two buttons — "Sign in" and "Create account". Both lead to the same OTP email flow but the email step title reflects the choice via `isCreatingAccount` state. There is no functional difference — both paths create an account if the email is new.

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

### 4.3 Payment processing

#### GAS cron (new payment emails)

```
Maybank email arrives → Gmail label "Maybank" or "Maybank2"
  → GAS 1-min cron → processMaybankEmails()
    → dedup layer 1: Gmail label (Maybank_Done2 = already processed)
    → dedup layer 2: Script Properties (processedMaybankIds — rolling 200-entry window)
    → for each unprocessed email: parse credit amount + OTHR reference
    → appendPaymentRow(): sheet.appendRow([body, subject, date, amount, othr, paymentId, email])
    → if newCount > 0:
        notifyRailway("payments") → POST /api/sync?tab=payments&token=SECRET
        → server queues syncTab("payments") asynchronously
          → fetchSheetsPayments() → Sheet → DELETE+INSERT sheet_payments DB
```

**Critical:** `notifyRailway("payments")` is called from `processMaybankEmails` **only when `newCount > 0`** (new payment rows were written). If no new emails are found in a given minute, the server is NOT called. The 1-min cron itself does not trigger a sync on every tick.

The reactive `/api/sync` endpoint **does not** reset the GAS health timer — that signal would be too noisy / too sparse to reliably detect a broken GAS. The dedicated `gasHeartbeat()` trigger is the sole source of `recordGasHeartbeat()` (see GAS health monitor below).

#### Admin payment edit flow (current — as of v17)

```
Admin opens payment row → EditPaymentSheet (Admin.tsx)
  → "Transfer received" read-only row shows the FULL timestamp (formatDateTimeDisplay)
  → form pre-populated from DB: date via toInputDate() (any format → YYYY-MM-DD for <input type="date">)
  → admin edits fields → Save
  → admin.editPayment tRPC mutation:
      validates: rowIndex must be >= 2 (else throw — row has no Sheet reference)
      preservePaymentTime(): re-attaches the row's time-of-day, emitting
        "M/D/YYYY HH:MM:SS". Time source is the client's `originalDate`
        first, DB-by-rowIndex only as fallback (see "Payment transfer
        timestamp" in §8)
      AWAIT appsScript.editPayment({ rowIndex, paymentId, email, reference, amount, date })
        → GAS editPaymentRow():
            writes to Sheet by 1-based rowIndex:
              col C (3) = date
              col D (4) = amount
              col E (5) = reference (OTHR field)
              col F (6) = paymentId
              col G (7) = email
            SpreadsheetApp.flush()   ← commits buffered writes before returning
            ← does NOT call notifyRailway (removed — see Bug 15)
            return { status: "success" }
        ← if GAS throws: server throws TRPCError; admin sees error; DB is NOT updated
      payDb.update(sheetPayments).set(updates).where(rowIndex = rowIndex)
        ← uses rowIndex (stable Sheet row number), NOT id (id changes on every sync — see §5)
  → client: toast success, invalidate allPayments query
```

#### Payments Sheet column mapping

| Col | Index (0-based for JS / 1-based for GAS getRange) | Field | Written by |
|---|---|---|---|
| A | 0 / 1 | Maybank email body (raw) | GAS appendPaymentRow — not stored in DB |
| B | 1 / 2 | Email subject | GAS appendPaymentRow — not stored in DB |
| C | 2 / 3 | Date | GAS appendPaymentRow + editPaymentRow |
| D | 3 / 4 | Amount | GAS appendPaymentRow + editPaymentRow |
| E | 4 / 5 | OTHR reference (raw PayNow ref) | GAS appendPaymentRow + editPaymentRow |
| F | 5 / 6 | PaymentID Match (resolved handle) | GAS appendPaymentRow + editPaymentRow |
| G | 6 / 7 | Email | GAS appendPaymentRow + editPaymentRow |

`fetchSheetsPayments()` reads from 0-based index; `editPaymentRow` writes via 1-based `getRange(rowIndex, colNum)`.

#### GAS health monitor

- Health is tracked via a dedicated heartbeat: `gasHeartbeat()` in `Code.gs` runs every 30 min on a time-based trigger and POSTs to `/api/health/gas-heartbeat` (token-protected). That endpoint is the *only* caller of `recordGasHeartbeat()`.
- Hourly background check in `sync.ts`: if no heartbeat in > 75 min (~2 missed beats + buffer), send alert email to tanmelanie@gmail.com via `sendAlertEmail()`.
- Alert fires at most once per hour (cooldown); silent on fresh deploys (only alerts after the first-ever heartbeat).
- **Reactive `/api/sync` calls do NOT reset the timer** — earlier design did, which silently masked broken triggers behind sporadic sign-up / admin / payment activity. The heartbeat is independent of work happening.
- Covers: OAuth revocation, deletion/pause of the heartbeat trigger, unhandled errors in `gasHeartbeat`, and the 7-day refresh-token expiry that silently stops triggers from firing (see §"GAS deployment facts" — the common weekly disconnect case).
- One-time setup: in the Apps Script editor, run `createHeartbeatTrigger()` once and grant permissions.

#### Dedup layers for email processing

- **Primary:** Gmail label — processed threads moved to `Maybank_Done2`, removed from `Maybank`/`Maybank2`
- **Secondary:** Script Properties (`processedMaybankIds`) — rolling window of 200 message IDs
- **CRITICAL:** Do NOT manually re-label processed emails back to `Maybank`. Both dedup layers are defeated simultaneously if you do — Script Properties can be wiped during script edits, leaving no fallback.

#### syncPaymentsFromDb GAS function — MANUAL USE ONLY

`syncPaymentsFromDb()` and `syncAllTabsFromDb()` in the GAS script fetch from `/api/export?tab=payments` and overwrite the entire Payments sheet with DB data. This was designed as a **one-time seeding tool** to import initial data from DB back to a blank Sheet. **Do NOT set it on a recurring GAS trigger.** Running it on a schedule creates a circular sync loop and reverts any direct Sheet edits (because the DB was populated from the Sheet — any edit made directly to the Sheet that hasn't yet triggered a Sheet→DB sync will be overwritten by this function reading the old DB values).

The `/api/export` endpoint blanks cols A and B (email body and subject) since those are not stored in the DB. Running `syncPaymentsFromDb` destroys the raw email body data permanently.

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

**Critical guard:** When editing an announcement or merch item without changing the image, the client echoes the existing R2 URL back. The server must check `isDriveDataUrl()` before deleting the old R2 object — otherwise the image is silently deleted. Only call `replaceOldDriveFile` when the incoming value is a `data:` base64 string.

### 4.5 Trial membership sign-up

```
User taps "Sign up for Trial" on /membership (Non-Member only)
  → POST membership.signupTrial
    → guard: hasTrialled (trialStartDate set) → BAD_REQUEST
    → guard: already Trial/Member/Student → BAD_REQUEST
    → insert sheetSignups row: activity="Trial Membership", baseFee/actualFees=$10
    → trialStart = today (DD/MM/YYYY), trialEnd = today + 3 months (DD/MM/YYYY)
    → UPDATE sheet_users SET memberStatus="Trial", trialStartDate, trialEndDate
    → upsertUser: memberStatus="Trial", trialStartDate, trialEndDate
  → return updated user
```

#### trialStartDate semantics (CRITICAL)

| Value | Meaning | Can sign up for trial? |
|---|---|---|
| `""` (empty string) | Never trialled | **Yes** |
| `"null"` or `"undefined"` | Data corruption (stringified JS null) | **Yes** (sanitised to `""` at every layer) |
| `"NA"` | Legacy marker: already trialled in past years, no date on record | **No** |
| Any date string (e.g. `"01/05/2025"`) | Trialled on that date | **No** |

**`"NA"` blocks trial signup.** It is the legacy convention for users who trialled before the app existed and have no recorded date. Do NOT treat `"NA"` as empty/non-trialled.

Sanitisation layers (all convert `"null"`/`"undefined"` → `""`):
- `normalizeToddmmyyyy()` in `routers.ts` (login sync path)
- `fetchSheetsUsers()` in `googleSheets.ts` (Sheets → DB sync)
- `upsertUser()` in `db.ts` (DB write layer)
- `signupTrial` guard in `routers.ts` (server-side check)
- `Membership.tsx` (client-side check)

### 4.6 Annual membership sign-up

```
User taps "Become a Member" on /membership
  → POST membership.signupMember
    → pro-rated fee: $80 × (12 − currentMonthIndex) / 12, rounded to nearest dollar
    → insert sheetSignups row: activity="Membership Fee", baseFee/actualFees=proRatedFee
    → UPDATE sheet_users SET memberStatus="Member", membershipStartDate=today
    → upsertUser: memberStatus="Member"
```

`membershipStartDate` belongs to `sheetUsers` only — the `users` table has no such column. Never attempt to write it to `users`.

### 4.7 Session management (Admin)

All session mutations call `clearSessionsCache()` after completion.

**Add session:** Admin fills `AddSessionSheet` form → inserts into `sheet_sessions`.

**Close session:** Sets `isClosed = "TRUE"` by `rowId`.

**Edit session:** Updates any field on a session row by `rowId`.

**Rain-off:** Marks session as rain-off, refunds all sign-ups (sets `actualFees = 0`).

**Add sign-up on behalf of user:** Admin enters paymentId + activity. Bypasses debt and duplicate checks.

**Edit sign-up:** Admin edits any field on an existing sign-up row by `id` (DB PK).

### 4.8 Admin delete of sign-up / membership records

| `activity` value | Delete behaviour |
|---|---|
| `"Trial Membership"` | Delete row; reset `memberStatus → "Non-Member"`, clear `trialStartDate` + `trialEndDate` on both `users` and `sheetUsers` |
| `"Membership Fee"` | Delete row; revert `memberStatus`: if `trialEndDate` still future → `"Trial"`; else → `"Non-Member"`. Clear `sheetUsers.membershipStartDate`. |
| Any other (training) | Delete row only; no status changes |

---

## 5. Data model — key tables

### `sheet_sessions`
PK: `rowIndex` (sheet row number). DB-primary. App writes directly. `trainingDate` may contain "19 April 2026" (legacy seeded) or "2026-04-19" (app-created). Always use `datesMatch()` for comparisons.

**`attendance` column is DEAD DATA — never read it.** It is a one-off snapshot seeded from Sheet col [14] and is maintained by nothing: `addSession` writes `attendance: 0` and no mutation ever updates it, so every app-created session sits at 0 forever and every seeded session is frozen at whatever the count was on seeding day. `admin.allSessions` derives attendance live from `sheet_signups` (count per `date+pool`, same key as `revenue`). The column is still written out by `/api/export` for Sheet parity — that is its only remaining use. See Bug 17.

### `sheet_signups`
PK: auto-increment `id`. DB-primary. App writes directly. `dateOfTraining` is always ISO for app-written rows; legacy seeded rows may be "19 April 2026". Always use `datesMatch()`.

### `sheet_payments`
PK: auto-increment `id`. **GAS-owned. Google Sheet is the source of truth.**

**CRITICAL — `id` is NOT stable.** Every `syncTab("payments")` run (startup, 6-hourly, GAS webhook) does a full **DELETE then INSERT** of all rows. Auto-increment `id` values change on every cycle. Never target a payment row by `id` in a mutation — the row will likely have been re-inserted with a new `id` by the time the server code runs.

**`rowIndex` IS stable.** It stores the 1-based Sheet row number (set during sync from the Sheet row position). Payment rows do not move in the Sheet, so `rowIndex` is permanent. **Always use `rowIndex` for any mutation that targets a specific payment row.**

`paymentId` is the primary attribution key; `email` is the fallback. `reference` stores the raw OTHR PayNow reference string from the Maybank email.

### `sheet_users`
PK: auto-increment `id`. Sheets cache. **Full DELETE+INSERT on forceSync — never store app-generated data here.** `image` column stores legacy Glide URL only.

### `users`
PK: `id` (auto-increment int). Auth table. Key columns: `openId` (unique), `email`, `name`, `memberStatus`, `clubRole`, `paymentId`, `trialStartDate`, `trialEndDate`, `image` (MEDIUMTEXT — R2 URL or null). **No `phone`, `dob`, or `membershipStartDate` columns** — those live on `sheetUsers` only.

### `announcements`, `merch_items`, `videos`
Fully DB-primary. Never touch Sheets. `videos` includes a `notes` text column.

---

## 6. Key file locations

### Server

| Concern | File |
|---|---|
| Schema | `drizzle/schema.ts` |
| tRPC router (all mutations) | `server/routers.ts` |
| GAS caller | `server/appsScript.ts` |
| Sheets read + DB-first reads | `server/googleSheets.ts` |
| DB sync service | `server/sync.ts` |
| Image upload (R2) | `server/driveUpload.ts` |
| Daily backup | `server/backup.ts` |
| Server entry + /api/sync + /api/export endpoints | `server/_core/index.ts` |
| Environment config | `server/_core/env.ts` |
| OTP + alert email | `server/email.ts` — `sendOtpEmail()` for OTP; `sendAlertEmail(subject, text)` for alerts |

### Client — utilities & components

| Concern | File |
|---|---|
| Date utilities | `client/src/lib/dateUtils.ts` |
| Fee utilities | `client/src/lib/feeUtils.ts` |
| tRPC client | `client/src/lib/trpc.ts` |
| Routes | `client/src/App.tsx` |
| Bottom nav | `client/src/components/BottomNav.tsx` |
| App header | `client/src/components/AppHeader.tsx` |
| Edit sign-up sheet | `client/src/components/EditSignupSheet.tsx` |

### Client — pages

| Route | File | Notes |
|---|---|---|
| `/login` | `Login.tsx` | Landing screen + OTP flow |
| `/` | `Sessions.tsx` | Sessions list (home tab) |
| `/home` | `Home.tsx` | Announcements / home tab |
| `/session/:rowId` | `SessionDetail.tsx` | Session detail + attendees |
| `/session/:rowId/splits` | `Splits.tsx` | Per-session PnL splits view |
| `/signup/:rowId` | `SignUpForm.tsx` | Sign-up form with fee calc |
| `/payments` | `Payments.tsx` | User payment history + instructions |
| `/membership` | `Membership.tsx` | Membership status + sign-up |
| `/admin` | `Admin.tsx` | Full admin panel (see §6.1) |
| `/profile` | `Profile.tsx` | User profile + photo upload |
| `/announcements` | `Announcements.tsx` | Announcements list |
| `/announcements/:id` | `AnnouncementDetail.tsx` | back → `/home` |
| `/fun-resources` | `FunResources.tsx` | Hub page |
| `/fun-resources/invite` | `FunResourcesInvite.tsx` | Invite + newbie form link |
| `/fun-resources/merch` | `FunResourcesMerch.tsx` | Merch catalogue |
| `/fun-resources/merch/:id` | `MerchDetail.tsx` | Merch item detail |
| `/fun-resources/videos` | `FunResourcesVideos.tsx` | Training videos |
| `/fun-resources/resources` | `FunResourcesResources.tsx` | Downloadable resources |
| `/fun-resources/policies` | `FunResourcesPolicies.tsx` | Club policies |
| `/newbie` | `NewToClub.tsx` | New-to-club info page |

### 6.1 Admin panel structure (`/admin`)

Four tabs. Access gated by `clubRole`:

| Tab | Visible to | Contents |
|---|---|---|
| **Members** | Admin + Helper | Searchable user list. Click user → `EditUserSheet` (3 sub-tabs: Profile / Payments / Sign-ups). **Admin:** full edit. **Helper:** read-only. |
| **Payments** | Admin + Helper | All payments list with search. Admin: add payment, edit any field (reference, amount, date, paymentId, email), delete. Helper: read-only. |
| **Sessions** | Admin only | All sessions. Add, close, rain-off, edit, add sign-up on behalf. |
| **Data** | Admin only | PnL report. Spreadsheet force-sync panel. Migrate Glide photos. |

**Bottom nav:** Admin tab shown to both `"Admin"` and `"Helper"` (`BottomNav.tsx` — checks `clubRole === "Admin" || clubRole === "Helper"`). Sessions and Data tabs inside `/admin` are hidden for Helpers.

---

## 7. Access model

**`memberStatus` and `clubRole` are independent.** A user always has a `memberStatus` AND optionally a `clubRole`.

### memberStatus

| Status | Fee rate | Notes |
|---|---|---|
| Non-Member | Non-member rate | Default |
| Trial | Member rate | Valid until `trialEndDate`; auto-downgraded after expiry |
| Member | Member rate | Annual member |
| Student | Student rate | Admin-managed only |

### clubRole

| Role | Access |
|---|---|
| (none) | No admin access |
| Helper | Admin tab in nav; read Members + Payments; write announcements/merch/videos; no Sessions or Data tab |
| Admin | Full access; bypasses debt blocking and duplicate sign-up check |

---

## 8. Critical behaviours

### PaymentId-primary attribution
If a sign-up or payment row has a `paymentId`, ownership is by paymentId **only** — email is ignored. Admins create sign-ups on behalf of others using the target's paymentId (with the admin's email on the row).

### Date format inconsistency (CRITICAL — do not regress)
- Sessions seeded from Sheets: `trainingDate` = `"19 April 2026"` (free text)
- Sessions created in-app: `trainingDate` = `"2026-04-19"` (ISO)
- Sign-ups: `dateOfTraining` now always ISO
- Payment dates from GAS: `"M/D/YYYY HH:MM:SS"` (e.g. `"5/4/2026 14:30:00"`) — GAS `formatDateTime` output
- **Rule**: always use `datesMatch()` for session ↔ sign-up comparisons. For display, always use `parseAnyDate()` from `dateUtils.ts` — it handles all formats. For `<input type="date">`, use `toInputDate()` (converts any format → `YYYY-MM-DD`).

### Date normalisation must use LOCAL components, never toISOString()
Both `toIsoDate()` helpers (`routers.ts`, `googleSheets.ts`) fall back to `new Date(raw)` for free-text dates like `"1 March 2026"`. JS parses that as **local** midnight. `toISOString().slice(0,10)` then converts to UTC, which in any timezone east of UTC (SGT is UTC+8) rolls the date back one day — so every seeded session keys to the wrong date and matches zero sign-ups. Railway runs in UTC so production was unaffected, but local dev and tests silently produced wrong counts. Both helpers now read back `getFullYear()/getMonth()/getDate()`. **Never reintroduce `toISOString()` in a date-normalisation path.**

### Payment transfer timestamp
`sheet_payments.date` holds the real bank-transfer timestamp as `"M/D/YYYY HH:MM:SS"` (GAS `formatDateTime`, taken from the Maybank email's send time). All 459 live rows carry a genuine time.

- **Display:** `formatDateTimeDisplay()` / `parseAnyDateTime()` / `extractTimeOfDay()` in `dateUtils.ts`. `parseAnyDate()` still deliberately discards the time — it is for timezone-safe date comparison, not display.
- **A time of exactly `00:00:00` means "no time recorded", not midnight.** It is what GAS `normalisePaymentDate()` writes when a date-only value is saved, i.e. a normalisation artefact. All three helpers treat it as absent.
- **Editing must not destroy it.** The admin form is an `<input type="date">` and can only return `"YYYY-MM-DD"`; `preservePaymentTime()` in `routers.ts` re-attaches the row's existing time before the value reaches GAS. See Bug 18.
- **The time source is the client's `originalDate`, not a DB read.** `admin.editPayment` takes an optional `originalDate` — the row's stored date exactly as the client rendered it. A fresh DB read is only the fallback, because `syncTab("payments")` does a full DELETE+INSERT: a read landing inside that window returns no row, and the code would then write a bare ISO date that GAS zeroes to `00:00:00`. The whole point of the fix is to not lose the timestamp, so it must not depend on a table that is periodically empty.
- **Seconds are displayed.** Bulk-imported payments can share a minute and differ only in seconds (five live rows sit at `17:30:00`–`17:30:04`); dropping seconds would make distinct transfers indistinguishable when reconciling.

### sheet_payments id instability (CRITICAL)
`sheet_payments.id` changes on every sync cycle (full DELETE+INSERT). **Never target a payment row by `id` in a mutation.** Use `rowIndex` (the 1-based Sheet row number, stable across cycles). The server's `admin.editPayment` mutation already uses `rowIndex` in the WHERE clause.

### GAS SpreadsheetApp buffering
GAS batches `setValue()` calls internally. They are committed to Google Sheets when:
1. `SpreadsheetApp.flush()` is called explicitly
2. The GAS function returns

If another external system reads the Sheet (e.g., via Sheets API) before the GAS function returns and without an explicit `flush()`, it may see stale data. **Always call `SpreadsheetApp.flush()` before any `notifyRailway()` call or before returning from a function that writes to the Sheet and relies on external consistency.**

### notifyRailway — when it IS and IS NOT called
- **processMaybankEmails:** calls `notifyRailway("payments")` only when `newCount > 0` (new payment rows were appended). A run with no new emails does NOT call the server.
- **editPaymentRow:** does NOT call `notifyRailway`. The server handles the DB update directly (by `rowIndex`) after GAS returns. A full Sheet→DB sync immediately after a GAS write risks reading stale Sheets API cached data, reverting the reference field.
- **Other GAS functions** (addSession, submitSignUp, etc.): call `notifyRailway` for their respective tabs.

### Session visibility cutoff
Sessions hidden from user-facing list once `now > sessionStart + 1 hour` in SGT (UTC+8). Admin panel shows all sessions always.

### sheet_users is a sync cache — never write app data to it
`forceSync("users")` does DELETE+INSERT — any app-written data would be wiped. Profile photos must be in `users.image`, not `sheetUsers.image`.

### Trial date — "NA" means already trialled (CRITICAL)
`"NA"` in `trialStartDate` is a legacy marker meaning "user already used their trial in past years, no date recorded." It **blocks** trial sign-up. Do NOT treat `"NA"` as empty or exclude it from the `hasTrialled` check. See §4.5 for the full semantics table.

### Admin form — blank vs undefined (CRITICAL)
When building admin form submissions, do NOT use `value || undefined` for fields where blank/empty is a meaningful write. `"" || undefined` evaluates to `undefined`, and the server skips `undefined` fields — so the save silently does nothing. Send the value directly: `trialStartDate: trialStartDate`.

### String "null" sanitisation
JS `null` can silently become the string `"null"` when crossing system boundaries (GAS → Sheets → DB, or JSON serialization). All DB write paths sanitise `"null"` and `"undefined"` strings to `""` for `trialStartDate`/`trialEndDate`. If adding new nullable fields to the sync pipeline, add the same sanitisation.

### Trial membership — fee rate determined by SESSION DATE
What matters for fee calculation is whether the **training session's date** falls within the user's trial period — not whether the user is Trial at the moment they sign up. Implemented in `getMembershipOnTrainingDate()` in `feeUtils.ts`.

### 60-second sessions cache
`getSessions()` caches results for 60 seconds. `clearSessionsCache()` is called after every session mutation.

---

## 9. Recurring bugs & lessons

### Bug 1: Session detail showed fewer sign-ups than sessions list
**Root cause:** Exact WHERE `dateOfTraining = $isoDate`. Legacy "21 April 2026" rows didn't match.
**Fix:** Full table scan + JS `datesMatch()`. **Lesson:** Never exact-WHERE on date columns from Sheets.

### Bug 2: Sign-up count on sessions list always showed 0
**Root cause:** Lookup key from `s.trainingDate` raw format didn't match ISO keys.
**Fix:** `toIsoDate(s.trainingDate)` normalises before building the lookup map.

### Bug 3: Glide photo migration only migrated 7/84 users
**Root cause:** Migration looked for a `users` row per sheetUser; 77 users had never logged in.
**Fix:** For sheet-only users, write to `sheetUsers.image`. On first login, copy to `users.image`.

### Bug 4: Google Drive upload quota error for service accounts
**Root cause:** Service accounts have no storage quota.
**Fix:** Switched to Cloudflare R2.

### Bug 5: iOS bottom nav / header scrolling detachment
**Root cause:** iOS Safari demotes `position: fixed` elements under certain compositing conditions.
**Fix:** `transform: translateZ(0)` + `backfaceVisibility: hidden` on `BottomNav` and `AppHeader`. `willChange: transform` intentionally NOT used — creates a new containing block breaking child fixed elements.

### Bug 6: Railway console backticks cause bash substitution
Use unquoted lowercase column names or single quotes, not backticks.

### Bug 7: Railway console auto-appends LIMIT 100
Do not include your own LIMIT clause.

### Bug 8: Signup edit/delete must use DB primary key
Always edit/delete sign-ups by `id` (DB PK). Matching by `email + pool + date` can affect multiple rows.

### Bug 9: R2 image silently deleted on announcement/merch edit (fixed 2026-04-29)
**Root cause:** `replaceOldDriveFile` called unconditionally. Client echoes existing URL on text-only edits.
**Fix:** Gate on `isDriveDataUrl()`. Only call `replaceOldDriveFile` when incoming value is a `data:` base64 string.

### Bug 10: membershipStartDate silently dropped on upsertUser (fixed 2026-04-29)
**Root cause:** `membership.signupMember` passed `membershipStartDate` to `upsertUser()` but `users` table has no such column. Drizzle silently ignored it.
**Fix:** Removed from `upsertUser` call. Correct write path is `sheetUsers` only.

### Bug 11: Payment data-patch reverted after deployment (fixed 2026-05-04)
**Root cause:** `GOOGLE_APPS_SCRIPT_URL` pointed at a stale v1 deployment. GAS returned "Unknown action" for all calls. Server error was swallowed — try/catch explicitly fell through to update DB anyway. On next deploy (or 6-hour sync), `syncTab("payments")` read the unchanged Sheet and overwrote the DB-only edit.
**Fix:** (1) Correct GAS URL in Railway env. (2) Server now throws `TRPCError` if GAS fails — DB is never updated when Sheet write fails. (3) `editPaymentRow` in GAS writes all 5 editable columns (was only col F/G in v12).

### Bug 12: Helper role could not see Admin tab in bottom nav (fixed 2026-05-04)
**Root cause:** `BottomNav.tsx` checked `clubRole === "Admin"` only.
**Fix:** `clubRole === "Admin" || clubRole === "Helper"`.

### Bug 13: Payment dates not displaying (fixed 2026-05-05)
**Root cause:** GAS stores payment dates as `"M/D/YYYY HH:MM:SS"` (e.g. `"5/4/2026 14:30:00"`). This format was not handled by `parseAnyDate()` — it fell through to `new Date()` which is unreliable cross-browser (fails on Safari). The `<input type="date">` edit field also requires `YYYY-MM-DD` format, so the date field was always blank on open.
**Fix:** Added explicit `M/D/YYYY HH:MM:SS` branch in `parseAnyDate()` (before the plain `M/D/YYYY` catch-all). Added `toInputDate()` helper in `Admin.tsx` (any format → `YYYY-MM-DD`). Switched `formatDate`/`formatPaymentDate` in `Admin.tsx` and `Payments.tsx` to use `parseAnyDate()`.

### Bug 14: Payment edit DB update targeted stale id (fixed 2026-05-05)
**Root cause:** `admin.editPayment` used `payDb.update(sheetPayments).where(id = input.id)`. The `id` is an auto-increment PK that changes on every `syncTab("payments")` DELETE+INSERT cycle. If the sync ran between when the admin loaded the payments list and when they saved the edit, the `id` no longer existed — 0 rows updated, silently.
**Fix:** Changed WHERE clause to `rowIndex = input.rowIndex`. `rowIndex` is the 1-based Sheet row number, stable across sync cycles. `rowIndex` is already validated (must be ≥ 2) before the GAS call.

### Bug 15: Trial signup blocked by "null" string in trialStartDate (fixed 2026-05-27)
**Root cause:** A user (Cheryl Cheong) had the literal string `"null"` in `trialStartDate` (stringified JS `null` written during a sync or data corruption). The `hasTrialled` check treated any non-empty, non-`""` value as "already trialled", so `"null"` blocked trial signup.
**Secondary issue:** The `hasTrialled` check incorrectly EXCLUDED `"NA"` from blocking. `"NA"` is the legacy marker for "already trialled in past years" and SHOULD block.
**Tertiary issue:** Admin panel could not clear the field — `trialStartDate || undefined` converted blank input to `undefined`, which the server skips. The save appeared to succeed but wrote nothing.
**Fix:** (1) Sanitise `"null"`/`"undefined"` strings to `""` at every layer (DB write, Sheets sync, login sync, trial guard). (2) `"NA"` now correctly blocks trial signup (removed from exclusion list). (3) Admin form sends `trialStartDate` directly (not `|| undefined`) so blanking the field writes `""` to DB.
**Lesson:** When syncing data between systems (GAS ↔ Sheets ↔ DB), JS `null` can silently become the string `"null"`. Always sanitise at write boundaries. Also: `value || undefined` in form submissions silently drops empty strings — use the value directly when blank is a meaningful state.

### Bug 16: Payment reference field reverted immediately after save (fixed 2026-05-05)
**Root cause:** `editPaymentRow` in GAS called `notifyRailway("payments")` at the end, which triggered an immediate Sheet→DB sync. The Google Sheets API can serve cached/pre-flush data in the seconds after a GAS `SpreadsheetApp.flush()`. The sync read old col E (reference) from the Sheets API before the flush had propagated externally, then did a full DELETE+INSERT — overwriting the DB with the old reference within seconds of the save.
**Fix:** Removed `notifyRailway("payments")` from `editPaymentRow`. The server updates the DB directly via `payDb.update(...).where(rowIndex = ...)` after GAS returns. The 6-hourly sync will re-read the Sheet (which GAS has correctly flushed) and confirms the DB. `SpreadsheetApp.flush()` is kept in `editPaymentRow` for consistency.

### Bug 17: Data tab attendee counts wrong for months (fixed 2026-09-01)
**Symptom:** The Admin → Data per-session PnL rows showed the wrong number of attendees — most sessions read "0 attendees" despite having a full sign-up list, and older ones showed a number that never moved.
**Root cause:** The card read `sheet_sessions.attendance`, a column seeded once from Sheet col [14] and maintained by nothing. `addSession` hardcodes `attendance: 0`, so every session created in the app stayed at 0 permanently; seeded sessions were frozen at the count on seeding day. Measured against live data: **52 of 155 sessions showed 0 while having sign-ups**, 19 more were stale, and **0 sessions depended on the column for anything sign-ups could not reproduce**.
**Contributing:** `revenue` on the same card was already derived live from sign-ups, so the two numbers beside each other described different things — a session could read "0 attendees · +$258".
**Fix:** `admin.allSessions` now builds `attendanceMap` in the same pass as `revenueMap`, keyed on the same normalised `date+pool`, so attendance and revenue always describe the same rows. Sign-up rows with a blank `dateOfTraining` (Trial Membership / Membership Fee) are skipped — they belong to no session.
**Lesson:** A denormalised count column with no writer is worse than no column: it reads as authoritative and is silently wrong forever. Derive counts at read time unless something actually maintains them.

### Bug 18: Payment edit destroyed the transfer timestamp (fixed 2026-09-01)
**Root cause:** The edit form's `<input type="date">` can only return `"YYYY-MM-DD"`. GAS `normalisePaymentDate()` expands a bare ISO date to `"M/D/YYYY 00:00:00"` — so saving a payment for *any* reason (fixing a typo'd reference, re-matching a paymentId) rewrote col C and threw away the bank's transfer time. Latent since v13 and about to start biting: `editPaymentRow` was missing from the live script from v14 until v17, so every edit failed outright rather than corrupting data.
**Fix:** (1) `preservePaymentTime()` on the server re-attaches the row's time-of-day, emitting canonical `"M/D/YYYY HH:MM:SS"` — which `normalisePaymentDate()` passes through untouched. The time comes from the client's `originalDate` (DB read only as fallback), so a concurrent payments sync cannot cause the very data loss being fixed. (2) EditPaymentSheet shows the full timestamp, seconds included, in a read-only "Transfer received" row so the admin can see what they are reconciling against.
**Verified against live data:** all 459 payment rows round-trip through open → save-unchanged → reopen with zero time loss, zero date drift, and idempotent re-saves, under UTC, SGT and a negative-offset timezone.
**Lesson:** An `<input type="date">` is a lossy round-trip for any value that carries a time. Either show and preserve the time explicitly, or do not let the control write that field.

### Bug 19: toIsoDate shifted free-text dates back a day outside UTC (fixed 2026-09-01)
**Root cause:** `new Date("1 March 2026")` yields local midnight; `.toISOString().slice(0,10)` then converts to UTC and returns `"2026-02-28"` in SGT. 148 of 155 sessions store free-text dates, so in any non-UTC environment every one of them keyed to the wrong day and matched zero sign-ups.
**Why it was invisible:** Railway runs in UTC. The bug only surfaced in local dev and in the unit test written for Bug 17.
**Fix:** Both `toIsoDate()` helpers read back local `getFullYear()/getMonth()/getDate()`. No behaviour change on Railway.

---

## 10. How we work together (Claude ↔ Melanie)

### Context continuity
- **Always read `SYSTEM.md` + the latest `checkpoint_*.md` at session start.** These are the single source of truth — not the conversation history.
- Before any significant change, check whether the relevant section of `SYSTEM.md` describes the current state correctly.
- The GAS script state in the repo (`.gs` files) may lag behind what is actually deployed in GAS — the user makes targeted manual edits to the live script. Treat the `.gs` files as a reference, not necessarily the exact live code.

### GAS files — versioning rule
**Never overwrite or edit existing `.gs` files.** Always create a new versioned file (e.g. `Code_v14_2026-05-05.gs`). GAS has no version control; the file name is the history.

### GAS deployment facts
- GAS is deployed as a web app with a stable URL (set in `GOOGLE_APPS_SCRIPT_URL`). Deploying a new version does NOT change the URL — the same deployment URL serves the latest version.
- The GAS 1-min cron trigger calls `processMaybankEmails`. It does NOT call `syncPaymentsFromDb` or any other sync function — those are manual-only.
- OAuth: all GAS scopes (GmailApp, MailApp, UrlFetchApp, SpreadsheetApp) share a single project authorization. If OAuth is revoked, ALL fail simultaneously. Re-run any function from the GAS editor to re-grant permissions.
- **Weekly silent disconnect pattern:** triggers stop firing with no errors in the execution log, roughly every 7 days. Root cause is the OAuth consent screen being in "Testing" status (default for unverified personal-Gmail apps using sensitive Gmail scopes) — Google expires refresh tokens after 7 days in that state. Symptom: `processMaybankEmails` and `gasHeartbeat` both stop, no failures preceding, heartbeat alert fires. Fix: open the script editor, run any function, grant consent again. The trigger entries themselves are not deleted — they just can't authorize. Do not assume code/handler failure when this pattern appears.

### Deployment
- Push to `main` → Railway auto-deploys.
- **`pnpm` is pinned in the `Dockerfile` (`pnpm@10.4.1`) and must stay in step with `packageManager` in `package.json`.** It was unpinned until 2026-09-01, so `npm install -g pnpm` pulled whatever was newest at build time. A pnpm release then added strict verification of the `packageManager` identity against the lockfile, and `pnpm-lock.yaml` has no `@pnpm/exe.*` entry — every build started failing with `ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE` with **no repo change to explain it**. If builds ever fail again at `pnpm install --frozen-lockfile` with nothing relevant in the diff, suspect the toolchain, not the code: the failing step runs *before* `COPY . .`, so application code cannot be the cause.
- Every deploy triggers: `syncTab("payments")` after 5s (startup sync).
- Schema changes: run `pnpm db:push` after deploy.
- Check Railway logs for `[Sync]` entries.

### When something looks wrong in the DB
- Use Railway's MySQL console for investigation.
- Backtick = bash substitution in Railway console; use unquoted lowercase names or single quotes.
- No LIMIT clause needed — Railway auto-adds LIMIT 100.

### Before touching payment logic
- Re-read §5 (sheet_payments id instability), §8 (critical behaviours), and §9 (bugs 11–16).
- Key rule: **Sheet is source of truth for payments. Always write Sheet first (via GAS), then update DB. Never DB-only for payments.**
- Key rule: **Target payment rows by rowIndex, not id.**

### Before touching sign-up / session logic
- Re-read §8 (paymentId-primary, date format inconsistency).
- Always call `clearSessionsCache()` after session mutations.

### When in doubt, ask first
If a requirement is ambiguous or there is risk of a wrong assumption — **stop and ask** rather than guessing. Especially: role/permission logic, financial calculations, date handling, anything that writes to the DB.

---

## 11. Test cases — core flows

### AUTH
| ID | Scenario | Expected |
|---|---|---|
| A1 | Valid email → OTP → correct code | Redirect to `/`; JWT cookie set |
| A2 | Correct code for new email | Profile step; after name → redirect to `/` |
| A3 | Wrong code 5× within 10 min | Locked |
| A4 | OTP resend before 60s | Button disabled |

### SIGN-UP
| ID | Scenario | Expected |
|---|---|---|
| S1 | Sign up for open session as Member | Success; count increments |
| S2 | Sign up for same session twice (non-admin) | CONFLICT error |
| S3 | Debt > $50 (non-admin) | Submit button disabled |
| S4 | Admin signs up for closed session | Succeeds (admin bypass) |
| S5 | Session detail after sign-up | All attendees shown; count matches list |

### PAYMENTS
| ID | Scenario | Expected |
|---|---|---|
| P1 | Maybank credit email arrives | Appears in Admin payments tab within ~2 min |
| P2 | Payment matched by paymentId (no email) | Appears correctly in user's Payments page |
| P3 | Admin edits reference field | Saved immediately; persists through 6-hour sync |
| P4 | Admin edits paymentId | Saved immediately; user's payment attribution updates |

### IMAGES
| ID | Scenario | Expected |
|---|---|---|
| I1 | Upload profile photo | Shown immediately; persists after reload |
| I2 | Replace profile photo | Old R2 object deleted; new URL in DB |
| I3 | Edit announcement text only (no image change) | Image URL unchanged; R2 object not deleted |

---

## 12. Automated testing approach

**Vitest is set up.** `pnpm test` runs it. `vitest.config.ts` only includes `server/**/*.test.ts`, so **every test file must live in `server/`** — client modules are still testable from there via the `@` alias (`@/lib/dateUtils`).

### Existing test files

| File | Covers |
|---|---|
| `server/paymentId.test.ts` | `generatePaymentId` — all 4 naming steps |
| `server/paymentDate.test.ts` | `preservePaymentTime` / `timeOfDayFrom` (server) and `extractTimeOfDay` / `parseAnyDateTime` / `formatDateTimeDisplay` (client) — Bug 18 |
| `server/adminSessions.test.ts` | `admin.allSessions` live attendance + revenue derivation, mixed date formats, membership-row exclusion — Bug 17 |
| `server/sessions.test.ts` | `sessions.list` / `sessions.detail` — **`sessions.detail` currently FAILS** (pre-existing, unrelated to the above) |
| `server/auth.logout.test.ts` | `auth.logout` — **currently FAILS** (pre-existing) |

Baseline as of 2026-09-01: **40 passing, 2 failing**, both failures pre-existing. Compare against this baseline before blaming a change.

Mocking pattern for router tests: `vi.mock("./googleSheets", ...)` for session/user reads and `vi.mock("./db", ...)` returning a stub whose `select().from()` resolves to fixture rows (see `adminSessions.test.ts`).

### Still to cover

Priority:
- `feeUtils.ts` — `getMembershipOnTrainingDate`, `getActivityFee`, `computeDebt`
- `dateUtils.ts` — `parseAnyDate`, `toInputDate`, `datesMatch` edge cases (ISO, "19 April 2026", DD/MM/YYYY)
- `toIsoDate` under a non-UTC `TZ` — the Bug 19 regression guard
- `getSignUpsForSession` — mock DB, test mixed-format dates
- Fix the two failing tests above

### Integration tests — tRPC endpoints
Priority: `auth.sendOtp`, `auth.verifyOtp`, `signups.submit`, `/api/sync`.

### E2E tests — critical user paths
Use **Playwright**. Priority flows: full login, session sign-up, admin add session.

---

## 13. Outstanding work / tech debt

### High priority
1. **Sign-up ↔ session linkage by session FK** — currently matched by `pool + dateOfTraining` string. Add `sessionRowId` FK to `sheet_signups`.
2. **Normalise legacy session dates** — one-time UPDATE to ISO allows indexed queries.

### Medium priority
3. **Restore indexed WHERE on `getSignUpsForSession`** — safe after date normalisation.
4. **Prevent body scroll (long-term iOS fix)** — scroll inner container instead of `<body>`.

### Medium priority (added 2026-09-01)
5. **Two failing unit tests** — `sessions.detail` and `auth.logout`. Pre-existing, unrelated to Bugs 17–19. See §12.
6. **Drop or repurpose `sheet_sessions.attendance`** — nothing reads it now (§5). Leaving a dead column that looks authoritative is how Bug 17 happened; either remove it or have a mutation maintain it.
7. **One malformed sign-up row** — id `242246`, `activity` "Regular Training", `dateOfTraining` `2026-03-10`, **blank `pool`**. It matches no session, so its $33.33 is silently excluded from every PnL total. Needs its pool set or the row deleted.

### Deferred / nice-to-have
8. **Real-time payment notifications** — Pub/Sub (Gmail push) instead of 1-min cron.
9. **Broader automated test coverage** — as described in §12.
10. **Newbie flow screens 2–6** — only screen 1 implemented.
11. **GAS: Maybank2 label not removed** — after `thread.addLabel(doneLabel)`, add `thread.removeLabel(maybankLabel)`.

---

## 14. GAS version history

| File | Date | Key changes |
|---|---|---|
| `Code_v10_2026-04-18.gs` | 2026-04-18 | Previous stable version |
| `Code_v11_2026-04-26.gs` | 2026-04-26 | OAuth validity check + alert email; both Maybank labels → Maybank_Done2; appendPaymentRow in try-catch |
| `Code_v12_2026-05-03.gs` | 2026-05-03 | Added `editPaymentRow()` (col F paymentId + col G email); `notifyRailway("payments")` in editPaymentRow; `notifyRailway("payments")` in processMaybankEmails when newCount > 0 |
| `Code_v13_2026-05-04.gs` | 2026-05-04 | `editPaymentRow` expanded to write ALL 5 columns (C date, D amount, E reference, F paymentId, G email); doGet returns v13 |
| `Code_v14_2026-05-07.gs` | 2026-05-07 | `gasHeartbeat()` + `createHeartbeatTrigger()` / `deleteHeartbeatTrigger()` — 30-min health beat to `/api/health/gas-heartbeat`. **Branched from the pre-v13 `Code.gs`, silently dropping `editPaymentRow` and the `editPayment` doPost route** (see v17). |
| `Code_v15_2026-06-03.gs` | 2026-06-03 | Maintenance release; no payment-path changes. |
| `Code_v16_2026-06-28.gs` | 2026-06-28 | `lookupUserByPaymentRef()` resolves the PayNow reference against the live Railway DB (`GET /api/resolve-payment-ref`) before falling back to the Sheet User tab — fixes payments not matching for users created since the last manual sheet sync. Sheet lookup kept as fallback. |
| `Code_v17_2026-09-01.gs` | 2026-09-01 | **Restored `editPaymentRow()` + the `editPayment` doPost route** (lost in the v14 branch — the live script had answered "Unknown action: editPayment" since 2026-05-07, so every admin payment edit failed). **New `addPaymentRow()` + `addPayment` route** so "+ Add payment" appends to the Sheet first and returns a real `rowIndex`. Neither calls `notifyRailway()` — see Bug 16. Adds `normalisePaymentDate()`. |

### Which version is actually LIVE — check, do not assume

The repo tells you what has been *written*, never what is *deployed*. Melanie deploys GAS by hand, so the newest `.gs` file here can sit undeployed for days.

```bash
curl -s "$GOOGLE_APPS_SCRIPT_URL"
# → {"status":"ok","message":"FATUWR GAS v17 running"}
```

`doGet` returns the version string, so this is a one-second check. **Run it before diagnosing any payment-write bug** — "the code is right but the behaviour is wrong" is almost always a stale deployment, not a logic error. Bump the string in `doGet` in every new version so it stays useful.

As of 2026-09-01: `Code_v17_2026-09-01.gs` exists in the repo. Confirm with the curl above whether it is live before trusting `editPayment` / `addPayment` to work.

**The v14 regression is the cautionary tale for this whole section.** v14 was branched from `Code.gs` rather than from `Code_v13_*.gs`, because `Code_v13_*.gs` had never been mirrored back into `Code.gs`. Three months of failing payment edits followed, with the failure visible only as a toast. When cutting a new version, branch from the **highest-numbered** file, not from `Code.gs`.

**Never edit live GAS files in place. Always create a new versioned file.**
