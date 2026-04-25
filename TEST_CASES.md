# FATUWR Training Portal — Test Cases by Role

Last updated: 2026-04-20

## Roles
| Role | Description |
|---|---|
| **Unauthenticated** | Not logged in |
| **Non-Member** | Logged in, no active membership |
| **Trial** | Logged in, active trial membership (within trial end date) |
| **Member** | Logged in, annual member |
| **Student** | Logged in, student member |
| **Helper** | Logged in, club helper (can manage announcements & merch, cannot access admin sessions/data) |
| **Admin** | Logged in, full admin access |

---

## 1. Authentication & Login

### TC-AUTH-00 — Landing screen
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Visit `/login` | Welcome screen shown: logo (dark blue gradient bg), "Sign in" primary button, "Create account" ghost button; no "Find out more" link | Unauthenticated |
| 2 | Tap "Sign in" | Advances to email step | Unauthenticated |
| 3 | Tap "Create account" | Also advances to email step (same OTP flow handles both) | Unauthenticated |

### TC-AUTH-01 — Email entry
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | On email step, leave email blank, tap Send | Inline error "Email is required" | All |
| 2 | Enter invalid email (no @), tap Send | Inline error "Please enter a valid email" | All |
| 3 | Enter valid email, tap Send | OTP sent toast, step advances to OTP screen, 60 s countdown begins | All |
| 4 | Tap Send again within 60 s | Server returns rate-limit error "Please wait Xs before requesting another code" | All |

### TC-AUTH-02 — OTP verification
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Enter wrong 6-digit code | Toast "Invalid or expired code", code field clears | All |
| 2 | Enter wrong code 5 times within 10 min | Subsequent attempt returns "Too many failed attempts. Try again in X minute(s)" | All |
| 3 | Enter correct code | Advances: existing user → home, new user → profile completion step | All |
| 4 | Enter correct code after OTP has expired (>10 min) | Error "Invalid or expired code" | All |

### TC-AUTH-03 — Resend code
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | On OTP screen, wait 60 s | "Resend code" button becomes active | All |
| 2 | Tap Resend before 60 s elapsed | Button is disabled, shows remaining seconds | All |
| 3 | Tap Resend after 60 s | New code sent, countdown resets to 60 s | All |

### TC-AUTH-04 — New user profile completion
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | New user verifies OTP | Step 3 (profile) shown: Name required, Phone, DOB fields | New users |
| 2 | Submit with empty Name | Validation error "Name is required" | New users |
| 3 | Submit with Name filled | Account created, redirected to `/`, welcome toast | New users |

### TC-AUTH-05 — Existing user login
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Existing user verifies OTP | Redirected to `/` with "Welcome back!" toast | All returning |
| 2 | Membership status syncs from sheetUsers on login | Any admin changes to memberStatus/role take effect immediately | All |
| 3 | User with expired trial in sheetUsers logs in | Shown as Non-Member (not briefly Trial then Non-Member) | Trial (expired) |

### TC-AUTH-06 — Navigation without auth
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Visit `/` without logging in | Sessions list shown with "Not signed in" banner; no redirect | Unauthenticated |
| 2 | Visit `/payments` without logging in | Redirected to `/login` | Unauthenticated |
| 3 | Visit `/membership` without logging in | Redirected to `/login` | Unauthenticated |
| 4 | Visit `/admin` without logging in | Redirected to `/login` | Unauthenticated |

---

## 2. Training Sessions (`/`)

### TC-SESS-01 — Sessions list visibility
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Load `/` | Shows up to 6 upcoming sessions sorted by date ascending | All |
| 2 | Session starts in the past (>1 h after start time) | Session no longer appears in list | All |
| 3 | Session is closed (`isClosed` set) but within time window | Still appears, shows "Session closed" overlay on image | All |
| 4 | No upcoming sessions | Empty state "No upcoming sessions" shown | All |

### TC-SESS-02 — Unauthenticated access
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Load `/` while not logged in | Sessions list visible; "Not signed in. Sign in to register…" banner shown | Unauthenticated |
| 2 | Auth is still loading | Banner not shown (no flash of "Sign in" while loading) | All |
| 3 | Tap "Sign in ›" in banner | Navigates to `/login` | Unauthenticated |

### TC-SESS-03 — Non-member nudge
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Load `/` as Non-Member | Blue nudge banner + "How to become a Member" button shown | Non-Member |
| 2 | Tap "How to become a Member" | Navigates to `/membership` | Non-Member |
| 3 | Load `/` as Trial/Member/Student | Nudge banner not shown | Trial, Member, Student |

### TC-SESS-04 — Trial expiry warning
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Trial end date is >14 days away | No warning shown | Trial |
| 2 | Trial end date is ≤14 days away | Warning banner shows end date with link to Membership tab | Trial |
| 3 | Trial end date is in the past | User treated as Non-Member; non-member nudge shown instead | Trial (expired) |

### TC-SESS-05 — Session card
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View session card | Shows: pool image, day, date+time, pool name, signed-up count (or Attendance if closed) | All |
| 2 | Session has notes | Yellow warning box shown on card (only when session is open) | All |
| 3 | Tap session card | Navigates to `/session/:rowId` | All |

---

## 3. Session Detail (`/session/:rowId`)

### TC-DET-01 — Display
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Open session detail | Shows: hero image, day, pool, date+time, training objective (if set), notes (if set), Splits button, sign-up button, attendee list | All (authenticated) |
| 2 | Session is closed | "Session closed" overlay on image; "Sign-ups closed" disabled button shown | All |
| 3 | Session has started (≤1 h ago) and user not signed up | "Session in progress" disabled button shown | Non-Admin |
| 4 | Session has started and user not signed up | Admin still sees active "Sign up" button | Admin |

### TC-DET-02 — Sign-up button states
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | User is not signed up, session is open | "Sign up" button shown | All (auth) |
| 2 | User is already signed up | "You're signed up" disabled state shown | All |
| 3 | Session is closed | "Sign-ups closed" disabled | All |
| 4 | Not logged in | "Sign in to register" button | Unauthenticated |

### TC-DET-03 — Attendee list
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View session with sign-ups | Attendee list shows: avatar (photo or initials), name, activity, fee | All (auth) |
| 2 | Logged-in user's own row | Highlighted with blue avatar | Signed-up user |
| 3 | Tap own row (session open, not closed) | EditSignupSheet opens | Non-Admin (own row) |
| 4 | Tap any row | EditSignupSheet opens for that row | Admin |
| 5 | Tap row as Helper | No action (helpers cannot edit sign-ups via this UI) | Helper |

### TC-DET-04 — Admin edit (pencil icon)
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Open session detail | Pencil icon visible in top-right header | Admin, Helper |
| 2 | Tap pencil | EditSessionSheet opens with all session fields pre-filled | Admin, Helper |

---

## 4. Sign-Up Form (`/signup/:rowId`)

### TC-SUB-01 — Fee calculation
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Open sign-up form as Member | Member rate shown for Regular Training | Member |
| 2 | Open as Non-Member | Non-Member rate shown; savings nudge displayed | Non-Member |
| 3 | Open as Trial, session is before trial end | Trial (member) rate shown | Trial |
| 4 | Open as Trial, session is after trial end date | Non-Member rate shown; "trial will have expired" warning | Trial |
| 5 | Switch to "Swims only" | Swim fee for current membership status shown | All |
| 6 | Switch to "First Timer" or "Trainer" | $0.00 fee shown | All |

### TC-SUB-02 — Debt guard
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Debt > $26 and ≤ $50 | Yellow warning "will be blocked once you exceed $50" | Non-Admin |
| 2 | Debt > $50 | Red block banner; Confirm button disabled | Non-Admin |
| 3 | Debt > $50 | No restriction; can sign up | Admin |

### TC-SUB-03 — Submission
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Tap Confirm sign up | Success toast, navigates back to `/` after 1.8 s | All |
| 2 | Try to sign up for same session twice | Server returns CONFLICT error "You are already signed up" | Non-Admin |
| 3 | Admin signs up multiple times for same session | No duplicate check; each submission succeeds (for adding different people) | Admin |

---

## 5. Edit Sign-Up (`EditSignupSheet`)

### TC-EDIT-01 — Non-admin editing own sign-up
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Open edit on own sign-up | Activity chips and fee shown; name/email/paymentId NOT editable | Non-Admin |
| 2 | Change activity to higher-fee type when debt would exceed $50 | Warning shown; Save button disabled | Non-Admin |
| 3 | Save | Sign-up updated; navigate to `/` | Non-Admin |
| 4 | Delete | Confirmation dialog, then sign-up removed; navigate to `/` | Non-Admin |
| 5 | Try to edit when session is closed or started | Edit button not shown / sheet not tappable | Non-Admin |

### TC-EDIT-02 — Admin editing any sign-up
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Open edit on any attendee row | Editable fields: Name, Status, Payment ID, Actual fee, Activity chips | Admin |
| 2 | Change Payment ID | Saved; future debt calculation uses new paymentId | Admin |
| 3 | Set Actual fee to different value from calculated fee | Custom fee saved | Admin |
| 4 | Delete any sign-up | Confirmation dialog, then sign-up removed | Admin |

---

## 6. Payments (`/payments`)

### TC-PAY-01 — Summary card
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View Payments page | Club UEN, your Payment ID, Amount owed shown | All (auth) |
| 2 | Tap copy next to Club UEN | Clipboard copy, "Copied!" toast | All (auth) |
| 3 | Tap copy next to Payment ID | Clipboard copy | All (auth) |
| 4 | Debt = $0 and no credit | "All paid up" shown in green | All |
| 5 | Total paid > total fees | "Credit: $X.XX" shown in green | All |
| 6 | Debt > $26 and ≤ $50 | Yellow warning banner shown | All |
| 7 | Debt > $50 | Red "Account blocked" banner shown | All |

### TC-PAY-02 — Payments received
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View Payments received section | All payments matched to user's paymentId shown (even if no email on row) | All (auth) |
| 2 | Year-start credit (paymentId only, no email) | Appears in list | All |
| 3 | Tap section header | Section collapses/expands | All |

### TC-PAY-03 — Training & membership fees
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View Training fees | All sign-ups matched to paymentId shown with date, pool, activity, fee | All (auth) |
| 2 | Admin-created sign-up with user's paymentId (admin's email on row) | Appears in user's training fees | All |
| 3 | Membership fee entries (Trial Membership / Membership Fee activity) | Appear under Membership fee section, not Training fees | All |

---

## 7. Membership (`/membership`)

### TC-MEM-01 — Non-Member view
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View Membership page | Trial option and Annual Member option shown | Non-Member (never trialled) |
| 2 | Non-Member who has already used trial | Trial option not shown (trialStartDate guard); only Annual Member option | Non-Member (ex-trial) |
| 3 | Tap Sign up for Trial | Confirmation dialog with 3-month trial details and $10 fee | Non-Member |
| 4 | Confirm trial sign-up | memberStatus → Trial; $10 "Trial Membership" row inserted in sign-ups; trialStart/End dates set (DD/MM/YYYY, 3 months from today) | Non-Member |
| 5 | After sign-up, revisit Membership page | Trial card shown with start/end dates | (now Trial) |
| 6 | Tap Annual Member option | Confirmation dialog showing pro-rated fee (80 × (12 − monthIndex) / 12, rounded) | Non-Member |
| 7 | Confirm annual sign-up | memberStatus → Member; Membership Fee row inserted; membershipStartDate set | Non-Member |

### TC-MEM-02 — Trial memberStatus view
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View Membership page | Trial card showing start/end dates (formatted as "16 January 2026") | Trial |
| 2 | Annual member option present | Shows pro-rated fee for current month | Trial |
| 3 | Confirm annual upgrade | Status → Member; Membership Fee row created for pro-rated amount | Trial |
| 4 | Trial fee session: session date after trialEndDate | Non-member fee shown + warning in sign-up form | Trial |
| 5 | Trial fee session: session date before trialEndDate | Member fee shown | Trial |
| 6 | Trial expiry warning on Sessions list | Warning banner with end date shown when ≤14 days remain | Trial |
| 7 | Day after trialEndDate | User treated as Non-Member (expiry job + resolveSheetMemberStatus) | Trial (expired) |

### TC-MEM-03 — Member view
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View Membership page as Member | Annual membership card showing start date; no sign-up options shown | Member |

### TC-MEM-04 — Student view
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View Membership page as Student | Student membership shown; managed by Admin only | Student |

---

## 8. Info / Announcements (`/home`)

### TC-ANN-01 — Viewing
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Open Info tab | List of announcement cards shown (image + title) | All (auth) |
| 2 | Tap announcement card | Navigates to `/announcements/:id` detail page | All (auth) |
| 3 | Detail page | Shows: full image, title, rendered HTML content, date | All (auth) |
| 4 | No announcements | "No announcements yet." empty state | All (auth) |

### TC-ANN-02 — Admin/Helper management
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Open Info tab | "+" button visible in top-right | Admin, Helper |
| 2 | "+" button not visible | — | Non-Member, Trial, Member, Student |
| 3 | Tap "+" | New announcement sheet opens with Title, Content, Photo, Image URL fields | Admin, Helper |
| 4 | Submit with all fields empty | Toast "Please add a title, content, or image" | Admin, Helper |
| 5 | Submit with content only | Announcement created and appears in list | Admin, Helper |
| 6 | Right-click / long-press announcement card | Delete confirmation dialog | Admin, Helper |
| 7 | Confirm delete | Announcement removed from list | Admin, Helper |
| 8 | Open announcement detail, tap Edit | AnnouncementSheet opens pre-filled | Admin, Helper |

---

## 9. More Section (`/fun-resources`)

### TC-MORE-01 — Index
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Open More tab | 7 cards shown: Membership, Club Policies, Invite a Friend, Merchandise, New to the Club, Resources & Links, Videos | All (auth) |

### TC-MORE-02 — Videos (`/fun-resources/videos`)
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View Videos | List of videos with YouTube thumbnail, title, date, poster name | All (auth) |
| 2 | Tap video card | Opens YouTube URL in new tab | All (auth) |
| 3 | Tap "+" / Add button | Add video form (title + URL) | All (auth) |
| 4 | Submit valid YouTube URL | Video added to list | All (auth) |
| 5 | Delete button (×) visible | Only on own or any video | Admin, Helper |
| 6 | Delete button not visible | — | Non-Member, Trial, Member, Student |

### TC-MORE-03 — Merchandise (`/fun-resources/merch`)
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View Merch | 2-column grid of merch items | All (auth) |
| 2 | Tap item | Detail page with photos, info, price | All (auth) |
| 3 | Edit button on detail page | Visible | Admin, Helper |
| 4 | Edit button not visible | — | Non-Member, Trial, Member, Student |
| 5 | Edit merch item | MerchEditSheet opens with all fields + 2 photo slots | Admin, Helper |
| 6 | Delete merch item | Confirmation dialog, item removed | Admin, Helper |

### TC-MORE-04 — Resources & Links
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View Resources | Two sections (Resources, Useful Links) fetched live from Google Sheets | All (auth) |
| 2 | Tap link | Opens in new tab | All (auth) |

### TC-MORE-05 — New to Club (`/newbie`)
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View page | New-to-club guide content shown | All (auth) |

---

## 10. Profile (`/profile`)

### TC-PROF-01 — Viewing
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Open Profile | Avatar (photo or initials), name, email, membership status shown | All (auth) |
| 2 | App URL shown at bottom | Copyable app URL visible | All (auth) |
| 3 | Tap copy URL | URL copied, ✓ icon shown for 2 s | All (auth) |

### TC-PROF-02 — Photo upload
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Tap avatar | File picker opens | All (auth) |
| 2 | Select image file | Image previewed as avatar | All (auth) |
| 3 | Image saved | Avatar persists on next page load; shown in session attendee list | All (auth) |

---

## 11. Admin Panel (`/admin`)

> Admin panel is only accessible to Admin and Helper roles. Non-admin users are redirected to `/`.

### TC-ADMIN-01 — Access control
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Visit `/admin` | Redirected to `/` | Non-Member, Trial, Member, Student, Unauthenticated |
| 2 | Visit `/admin` | Admin panel loads | Admin, Helper |
| 3 | Sessions and Data tabs visible | — | Admin only |
| 4 | Sessions and Data tabs not visible | — | Helper |

### TC-ADMIN-02 — Members tab
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View Members tab | All sheetUsers listed, newest first | Admin, Helper |
| 2 | Search by name | Filtered results (null-safe) | Admin, Helper |
| 3 | Search by email | Filtered results | Admin, Helper |
| 4 | Search for non-existent name | Empty results (no crash) | Admin, Helper |
| 5 | Filter by status chip (Member, Trial, etc.) | Only matching users shown with count | Admin, Helper |
| 6 | Tap user card | EditUserSheet opens | Admin only |
| 7 | Tap user card as Helper | No action (read-only) | Helper |
| 8 | Delete user (trash icon) | Confirmation dialog; user removed from sheetUsers | Admin only |
| 9 | Delete user as Helper | Delete button not shown | Helper |

### TC-ADMIN-03 — EditUserSheet
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Open | Profile tab default; Payments and Sign-ups tabs available | Admin |
| 2 | Edit Name, Payment ID, DOB, Status, Role, dates | Saved to sheetUsers | Admin |
| 3 | Set status to Member + enter Membership Fee | Membership fee sign-up row created in sheetSignups | Admin |
| 4 | Payments tab | Shows all payments matched by paymentId; balance summary (Paid / Charged / Balance) | Admin |
| 5 | Tap payment row | EditPaymentSheet opens | Admin |
| 6 | Sign-ups tab | Shows all sign-ups matched by paymentId | Admin |

### TC-ADMIN-04 — Payments tab
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View Payments tab | All payments listed, newest first; unmatched payments highlighted | Admin, Helper |
| 2 | Search by paymentId, reference, or email | Filtered | Admin, Helper |
| 3 | Tap payment row | EditPaymentSheet opens | Admin only |
| 4 | Edit paymentId, email, amount, date | Saved | Admin |

### TC-ADMIN-05 — Sessions tab (Admin only)
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View Sessions tab | Grouped view: Recent (2), Upcoming (4), All (rest) when no filters | Admin |
| 2 | Apply any filter | Flat list, subheaders disappear | Admin |
| 3 | Filter by month, pool, day, status | Correct subset shown | Admin |
| 4 | Search by date/pool/day text | Filtered | Admin |
| 5 | Tap "Add session" | AddSessionSheet opens | Admin |
| 6 | Add session with required fields (date, pool, time) | Session created | Admin |
| 7 | Add session missing required field | Validation toast | Admin |
| 8 | Tap "Edit" on session card | EditSessionSheet opens pre-filled | Admin |
| 9 | Tap "Close" on session | Confirmation dialog; session marked closed | Admin |
| 10 | Tap session card body | Attendees sheet opens | Admin |

### TC-ADMIN-06 — Session Attendees sheet
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | Open attendees sheet | Lists all sign-ups for that session with name, activity, fee, member status | Admin |
| 2 | Tap attendee row | Edit sign-up sheet opens: Name, Email, Payment ID, Activity, Fees, Member status | Admin |
| 3 | Edit Payment ID | Saved; debt/payment attribution updated accordingly | Admin |
| 4 | Delete sign-up from attendees sheet | Confirmation dialog; sign-up removed | Admin |
| 5 | Tap "+ Add" button | New attendee form appears: Name*, Payment ID*, Email, Activity*, Actual fee, Member status | Admin |
| 6 | Submit add with missing Name or Payment ID | Validation toast; not submitted | Admin |
| 7 | Submit valid new attendee | Row inserted with session date/pool; appears in list | Admin |
| 8 | Add attendee to past/closed session | Works (admin bypass) | Admin |

### TC-ADMIN-07 — Data tab (Admin only)
| # | Action | Expected | Roles |
|---|---|---|---|
| 1 | View Data tab | Overall PnL summary + per-session PnL table for past sessions | Admin |
| 2 | Tap session row | EditSessionSheet opens | Admin |
| 3 | Tap "Spreadsheet Import" | Collapsible expands | Admin |
| 4 | Enter wrong PIN | Error "Incorrect PIN" | Admin |
| 5 | Enter correct PIN (1987) | Import buttons revealed | Admin |
| 6 | Tap "Import sessions" | Confirmation dialog; on confirm, sessions re-synced from Sheets | Admin |
| 7 | Tap "Import all tabs" | Confirmation dialog; all 4 tables replaced | Admin |
| 8 | Tap "Lock" | Panel re-locks, PIN cleared | Admin |

---

## 12. Fee & Debt Calculation (Cross-cutting)

### TC-FEE-01 — PaymentId-primary attribution
| # | Scenario | Expected |
|---|---|---|
| 1 | Sign-up row has paymentId + admin email | Attributed to paymentId owner, not admin |
| 2 | Sign-up row has paymentId, no email | Attributed to paymentId owner |
| 3 | Payment row has paymentId, no email (e.g. year-start credit) | Appears in paymentId owner's payments received |
| 4 | Sign-up row has no paymentId | Falls back to email attribution |
| 5 | Payment row has no paymentId, no email, paymentId in reference text | Matched via reference text extraction |

### TC-FEE-02 — Debt blocking
| # | Scenario | Expected |
|---|---|---|
| 1 | Debt ≤ $26 | No warnings |
| 2 | Debt > $26 and ≤ $50 | Yellow warning banner on Sessions and sign-up form |
| 3 | Debt > $50 | Red "blocked" banner; sign-up submit disabled; activity change blocked |
| 4 | Admin with any debt | No blocking; can sign up freely |

---

## 13. Daily Backup

### TC-BACKUP-01
| # | Action | Expected |
|---|---|---|
| 1 | 23:59 SGT daily | Email sent to fatuwrevents@gmail.com with 4 CSV attachments: users, sessions, signups, payments |
| 2 | Email subject | "FATUWR Daily DB Backup — {date}" |
| 3 | Email body | Table showing record counts per table |
| 4 | No email provider configured | Warning logged, no crash |

---

## 14. Security

### TC-SEC-01 — OTP generation
| # | Scenario | Expected |
|---|---|---|
| 1 | OTP is 6 digits | Always exactly 6 digits, zero-padded if needed |
| 2 | OTP source | Generated by `crypto.randomInt` (CSPRNG), not `Math.random` |

### TC-SEC-02 — Rate limiting
| # | Scenario | Expected |
|---|---|---|
| 1 | Send OTP twice within 60 s | Second request rejected with wait time message |
| 2 | 5 wrong OTP attempts within 10 min | Account locked for remainder of 10-min window |
| 3 | Wait for 10-min window to expire | Attempts reset; can try again |
| 4 | `/api/dev/otp` endpoint | Returns 404 (endpoint removed) |

### TC-SEC-03 — Session / auth token
| # | Scenario | Expected |
|---|---|---|
| 1 | Token stored | In localStorage + backup cookie (1-year expiry) |
| 2 | Access protected tRPC procedure without token | UNAUTHORIZED error |
| 3 | Access admin procedure as Non-Member | FORBIDDEN error |

---

## 15. Edge Cases

### TC-EDGE-01 — Date handling
| # | Scenario | Expected |
|---|---|---|
| 1 | Session trainingDate in "19 April 2026" format | Parsed correctly for filtering and display |
| 2 | Sign-up dateOfTraining in YYYY-MM-DD format | Matched correctly to session date regardless of format |
| 3 | Trial end date in M/D/YYYY (US) format | Parsed correctly; fee and expiry logic work |
| 4 | Trial end date "NA" or blank | No expiry, no warning |

### TC-EDGE-02 — Session visibility cutoff
| # | Scenario | Expected |
|---|---|---|
| 1 | Session time = "7:30 PM – 9:30 PM", current time is 8:00 PM | Session still shown (within 1 h of start) |
| 2 | Current time is 8:31 PM | Session hidden from list |
| 3 | Session has no trainingTime set | Start time defaults to 00:00; hidden after 01:00 on session day |

### TC-EDGE-03 — New user from sheetUsers
| # | Scenario | Expected |
|---|---|---|
| 1 | User in sheetUsers with Trial + expired trialEndDate logs in first time | Created as Non-Member (not Trial) |
| 2 | User in sheetUsers with valid Trial logs in | Created as Trial with correct dates |
| 3 | User not in sheetUsers logs in | Created as Non-Member with auto-generated paymentId |
