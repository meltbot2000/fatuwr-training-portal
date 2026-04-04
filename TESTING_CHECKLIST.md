# FATUWR Training Portal — Testing Checklist

## AUTH

- [ ] Login with existing email → OTP arrives in inbox → logged in, correct name/status shown in bottom nav and profile
- [ ] Login with new email → OTP → Non-Member account created in Google Sheet User tab
- [ ] Logout → redirected to /login, bottom nav hidden

## SESSIONS

- [ ] Sessions list loads from Google Sheets (Training Sessions tab)
- [ ] Session cards show correct fee for user's membership status (Member/Trial/Student/Non-Member)
- [ ] Closed sessions hidden from upcoming list (isClosed non-empty)
- [ ] Session detail loads: pool image, time, venue, fee table, sign-ups list
- [ ] Splits button present on detail page and navigates to /session/:rowId/splits
- [ ] Amber splits warning banner shown on open sessions

## SIGN-UP

- [ ] Sign up for a session → row appears in Google Sheet Training Sign-ups tab
- [ ] Fee shown is based on membership status **on the training date** (not today) — e.g. trial-expired user sees non-member rate
- [ ] Trial-expiry amber warning shown in sign-up form when trial will be expired on training date
- [ ] Duplicate sign-up blocked: "You are already signed up for this session"
- [ ] Debt ≥ $54: red banner shown, Submit button disabled
- [ ] Debt ≥ $26 and < $54: amber warning shown, Submit still allowed

## EDIT / DELETE

- [ ] Own sign-up row shows Edit link (open sessions only)
- [ ] Edit Activity → fee recalculates live → Save updates row in Sheet
- [ ] Delete sign-up → confirmation dialog → row removed from Sheet → no longer in sign-ups list
- [ ] Edit/Delete links hidden on closed sessions

## SPLITS

- [ ] Splits page at /session/:rowId/splits loads all sign-ups grouped by activity (Regular Training / Swims only / Trainer / First-timer)
- [ ] Empty activity sections show "—"
- [ ] Tap a section header → copies those names to clipboard, toast confirms count
- [ ] Tap top "Tap to copy all names" banner → copies all names
- [ ] Accessible to any logged-in user (not admin-only)

## PAYMENTS

- [ ] Club UEN (T14SS0144D) shown with copy button
- [ ] User's Payment ID shown with copy button (or "Contact admin" if not set)
- [ ] Amount Owed: amber for positive debt, green tick for zero/credit
- [ ] Warning banner at debt ≥ $26; blocked banner at debt ≥ $54
- [ ] Fees Accrued section lists all sign-ups with correct actual fee
- [ ] Payments Received section lists all matched payments

## MEMBERSHIP

- [ ] Non-Member (never trialled): sees "30-Day Free Trial" card and "Become an Annual Member" instructions
- [ ] Tap "Sign up for Trial" → trial dates set in Google Sheet → UI switches to active trial state (shows expiry)
- [ ] Already-trialled Non-Member: Trial card hidden, only "Become an Annual Member" instructions shown
- [ ] Active Trial: expiry date shown, "Upgrade to Annual Member" instructions shown
- [ ] Expired Trial: amber "Your trial expired" banner + Member upgrade instructions
- [ ] Member: green "You're an Annual Member" banner
- [ ] Student: blue "You have Student membership" banner

## ADMIN

- [ ] Admin tab in bottom nav is visible for clubRole = Admin and clubRole = Helper; hidden for all others
- [ ] Non-admin/helper visiting /admin directly is redirected to /
- [ ] Members tab loads full user list from Google Sheet, searchable by name or email
- [ ] Helper sees members read-only (lock icon, no edit on tap); Admin can tap a user to open edit sheet
- [ ] Admin edits membership status → Google Sheet User tab updated, local DB updated
- [ ] Payments tab shows all club payments newest-first (read-only for both Admin and Helper)
- [ ] Sessions tab visible to Admin only; shows all sessions newest-first
- [ ] "Add Session" form creates a new row in Google Sheet Training Sessions tab with generated ROW-id
- [ ] "Close" button on an open session → confirmation dialog → marks session as Closed in Sheet, badge shows on detail page
- [ ] "Admin: Close Sign-ups" button on SessionDetail (Admin only) → same close action

## HEALTH & DEPLOYMENT

- [ ] GET /api/health returns `{ "status": "ok", "timestamp": "..." }`
- [ ] Dockerfile builds without errors (`docker build .` locally if Docker available)
- [ ] All required environment variables set in Railway before deploy
- [ ] `pnpm db:push` run against Railway MySQL after first deploy (creates `users` and `otp_codes` tables)
