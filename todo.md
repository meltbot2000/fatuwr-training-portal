# FATUWR Training Portal - TODO

## Core Features
- [x] Database schema with users table (memberStatus field) and OTP codes table
- [x] Google Sheets integration layer - read sessions from '2022 Available Sessions' tab
- [x] Google Sheets integration layer - read users from 'User' tab
- [x] Google Sheets integration layer - read sign-ups from 'Training Sign-ups' tab
- [x] Email + OTP authentication flow (send code, verify code, create session)
- [x] Training sessions list view (upcoming sessions, filtered by future dates)
- [x] Session cards with venue images, date, time, pool location, and fees
- [x] Session detail view with training objective, fee table, and participant list
- [x] Training sign-up form with pre-filled user details
- [x] Dynamic fee calculation based on membership status and session type
- [x] Membership status display on profile page
- [x] User profile page with fee rates reference
- [x] Mobile-first responsive design with FATUWR brand colors
- [x] AppHeader component with navigation and auth state
- [x] Google Fonts (Inter) integration

## Backend
- [x] tRPC routers for auth (sendOtp, verifyOtp, me, logout)
- [x] tRPC routers for sessions (list, detail, refresh)
- [x] tRPC routers for sign-ups (submit, checkDuplicate)
- [x] tRPC router for profile (get)
- [x] Session caching with 5-minute TTL
- [x] Google Drive image URL conversion for pool images
- [x] Duplicate sign-up detection

## Testing
- [x] Vitest tests for sessions.list, sessions.detail, sessions.refresh
- [x] Vitest tests for auth.me, auth.logout
- [x] Vitest tests for profile.get (authenticated and unauthenticated)

## Known Limitations (First Build)
- [ ] Sign-up form writes to server log only (not directly to Google Sheets) - needs Google Apps Script endpoint
- [ ] OTP email sent via owner notification (not direct email to user) - needs email service integration
- [ ] No payment tracking view yet
- [ ] No admin panel yet
