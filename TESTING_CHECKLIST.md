# FATUWR — Post-Deploy Smoke Test Checklist

Run through this after every Railway deployment. Full role-based test cases are in `TEST_CASES.md`.

---

## Landing & Auth
- [ ] Visit `/login` → Welcome landing screen shown (logo, dark blue gradient, Sign in + Create account buttons)
- [ ] Tap "Sign in" → OTP email step shown
- [ ] Enter valid email → OTP arrives in inbox
- [ ] Enter correct code → redirect to `/`; welcome toast shown
- [ ] Enter wrong code 5× → locked with wait message

## Sessions
- [ ] Sessions list loads; upcoming sessions shown sorted by date
- [ ] Session card shows correct sign-up count (should match session detail count)
- [ ] Tap session card → session detail loads with attendee list
- [ ] Attendee count on list matches attendee count on detail page

## Sign-up
- [ ] Tap "Sign up" on open session → sign-up form loads with correct fee for role
- [ ] Confirm sign-up → success toast → navigate to `/`
- [ ] Count increments on sessions list
- [ ] Try signing up again → CONFLICT error "already signed up"
- [ ] Debt > $50 (non-admin) → submit button disabled

## Profile photo
- [ ] Tap avatar on Profile page → file picker opens
- [ ] Select photo → avatar updates; persists after page reload
- [ ] Avatar shown (not just initial) in top-right of Info/Home tab

## Payments
- [ ] Payments page loads; own Payment ID shown
- [ ] Training fees and payments received listed correctly

## Admin (Admin role only)
- [ ] Admin panel loads; all tabs visible
- [ ] Members tab: search works, tap user → edit sheet opens
- [ ] Payments tab loads
- [ ] Sessions tab: filter, add session, close session
- [ ] Data tab: PnL table loads; Spreadsheet Import PIN gates correctly (PIN: 1987)
- [ ] "Migrate Glide photos" button visible (run if Glide URLs still present)

## Health
- [ ] `GET /api/health` returns `{ "status": "ok" }`
- [ ] Railway logs show no startup errors
- [ ] Railway logs show `[Sync] Background sync started`

---

## Current debt thresholds (for test data reference)
- Warning: debt > $26
- Block: debt > $50
- Club UEN: T14SS0144D
