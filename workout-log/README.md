# FATUWR Comp Prep (workout log)

A separate small app for squads preparing for a competition:

- **Log workouts** outside regular training (type, duration, RPE, notes). Only squad members
  of an upcoming competition can log.
- **Training attendance syncs in automatically** from the portal through its partner API
  (`API.md`).
- **Dashboard** for any signed-in club member: each squad member's regular trainings and
  extra workouts, with All time / Since prep start / Last 4 weeks views, plus a per-person
  timeline with workout details.
- **Admin** (portal `clubRole = Admin`): create competitions (name, prep start, competition
  date) and pick the squad from portal members.

Sign-in uses the portal account (same emailed code), relayed through the API. There are no
separate accounts.

## Architecture

```
Browser ──bearer token──▶ workout-log (Express, this folder) ──▶ its own MySQL
                                 │  Bearer PORTAL_API_KEY
                                 ▼
                          portal /api/v1  (server/partnerApi.ts)
```

| Table | Owner | Notes |
|---|---|---|
| `workouts`, `competitions`, `squad_members` | this app | source of truth here |
| `members` | portal (cache) | name/photo/role keyed by portal `users.id`; refreshed each sync |
| `training_records` | portal (cache) | replaced per member, **only after a successful portal response**. An outage keeps the last good copy and shows a banner |

Sync runs every `SYNC_INTERVAL_MINUTES` (default 30) for members of active squads
(competition date ≥ today − 14 days). It also runs right after a squad member signs in,
when an admin adds someone, and on the admin "Sync now" button.

Counts are computed on read (`src/stats.ts`). Dates are `CHAR(10)` ISO strings and
"today" is Singapore time.

## Deploy (Railway, same project as the portal)

1. **Portal service**: add env `WORKOUT_LOG_API_KEY` = a long random string
   (`openssl rand -hex 32`). Until it is set, `/api/v1` answers 503.
2. **New MySQL service** for this app (keep it separate from the portal's DB).
3. **New service** from this GitHub repo, with **Root Directory `/workout-log`**. It builds
   from this folder's `Dockerfile` and `railway.toml`. Env vars:
   - `DATABASE_URL` = `${{<new MySQL>.MYSQL_URL}}`
   - `PORTAL_URL` = `http://${{<portal service>.RAILWAY_PRIVATE_DOMAIN}}:<port>` (private network), or `https://fatuwr.up.railway.app`
   - `PORTAL_API_KEY` = same value as the portal's `WORKOUT_LOG_API_KEY`
   - `SESSION_SECRET` = another `openssl rand -hex 32`
4. Generate a domain for the service. Tables are created on boot.
5. Sign in as a portal Admin → Admin tab → create the competition → add the squad.

## Local dev

```bash
cp .env.example .env   # fill in, point PORTAL_URL at a local portal
npm install
npm run dev            # http://localhost:3100
npm test               # unit tests
npm run check          # typecheck
```
