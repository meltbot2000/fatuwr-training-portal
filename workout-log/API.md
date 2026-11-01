# Portal partner API v1

The training portal exposes a small REST API at `/api/v1` for companion apps. The workout
log is the first consumer. Implementation: `server/partnerApi.ts` (portal repo root).

## Auth

Every request: `Authorization: Bearer <key>`, where the key is the portal's
`WORKOUT_LOG_API_KEY` env var. **Server-to-server only, so never ship it to a browser.**

| Response | Meaning |
|---|---|
| `503 partner_api_disabled` | Portal has no key configured (the default) |
| `401 unauthorized` | Missing or wrong key |

## Data rules

- Read-only, except that the login relay creates OTP codes.
- **No money**: fees, balances and payments are never returned.
- **No emails or paymentIds** in member objects.
- Login never creates a portal account.

## Endpoints

### `POST /auth/otp/send` `{ email }`
Emails a 6-digit code with the portal's own login template, under the same per-email rate
limits as portal login. `200 {ok:true}` · `404 no_portal_account` · `429 rate_limited` · `400 invalid_email`

### `POST /auth/otp/verify` `{ email, code }`
`200 { member }` · `401 invalid_code` · `429 rate_limited` · `404 no_portal_account`

### `GET /members?q=<name>` · `GET /members?ids=1,2,3`
Name search (≥2 chars, max 25 results) or bulk lookup (max 200). `200 { members: Member[] }`

### `GET /members/:id`
`200 { member }` · `404 not_found`

### `GET /members/:id/trainings?from=YYYY-MM-DD&to=YYYY-MM-DD`
That person's regular-training attendance, derived live from sign-ups.
`200 { member, records: TrainingRecord[], generatedAt }` · `404` · `400 invalid_date` ·
`503 db_unavailable` (the portal's DB read failed; keep your last good copy)

A sign-up counts as an attended training when **all** of these hold:
1. It matches a session by pool + date. Membership/trial fees and refunds never count.
2. That session is **closed** (`isClosed` is non-empty). Sign-ups become attendances
   when the session closes, not before.
3. The session was not a **full** rain-off. Half rain-offs count, flagged `rainOff: "half"`.
4. One record per person per session, even if duplicate sign-up rows exist.

Ownership is paymentId-first, the same rule as the portal's history screens: an admin-made
sign-up carrying the member's paymentId belongs to the member.

## Types

```ts
Member         { id: number; name: string; image: string | null; memberStatus: string; clubRole: string }
TrainingRecord { signupId: number;   // portal sheet_signups.id, stable, use as upsert key
                 date: string;       // YYYY-MM-DD
                 pool: string; trainingTime: string; day: string;
                 activity: string;   // "Regular Training" | "Swims only" | "Trainer" | "First Timer" | raw
                 sessionId: string;  // portal session rowId
                 rainOff: "" | "half" }
```

## Versioning
Additive changes (new fields, new endpoints) stay on v1. Anything that removes or changes
the meaning of a field goes to `/api/v2`, with v1 kept until consumers move.
