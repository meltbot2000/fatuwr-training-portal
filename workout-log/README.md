# FATUWR Comp Prep (workout log)

A separate small app for squads preparing for a competition:

- **Log workouts** outside regular training (type: Run, Swim, Gym/Strength, HIIT, Mobility,
  Others; duration; notes). Only squad members
  of an upcoming competition can log.
- **Training attendance syncs in automatically** from the portal through its partner API
  (`API.md`).
- **Dashboard** for the squad: each squad member's regular trainings and
  extra workouts, with Since prep start (default) / Since <prep-start year> / one chip per month from prep start up to the competition month, plus a per-person
  timeline with workout details.
- **Admin** (only the login emails in `ADMIN_EMAILS`, default `tanmelanie@gmail.com`;
  **not** the portal's Admin role): create competitions (name, prep start, competition
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

**Sync problems** are listed per person, with a plain-English reason, under Admin →
Training data. Syncs for one person never overlap (they share a run), and a portal blip
or a database deadlock gets one automatic retry before it is recorded as a failure.

Counts are computed on read (`src/stats.ts`). Dates are `CHAR(10)` ISO strings and
"today" is Singapore time.

## Access

Only **squad members** (of any competition) and **this app's admins** can sign in. Admins
are the login emails in `ADMIN_EMAILS` (default `tanmelanie@gmail.com`), checked against the
email the person just verified a code for. Being an Admin in the portal grants nothing here. Everyone else gets "This app is only for the competition squad". This is checked at
login and on every request, so removing someone from the squad locks them out immediately.

## URL: fatuwr.up.railway.app/amager

Railway can't send a *path* of one domain to another service, so the **portal forwards
`/amager/*`** to this service over Railway's private network (`server/workoutLogProxy.ts`).
This service runs with `BASE_PATH=/amager` and needs **no public domain of its own**.

On first boot it creates the **Amager Cup** competition (10 Apr 2027, prep start 1 Nov
2026 as a placeholder; change it in Admin if needed) and queues the initial squad names
(`src/seed.ts`). This runs once only (`app_meta` marker), so later Admin edits stick.

**Squad names → portal accounts** (`src/invites.ts`): a name is added automatically only
when exactly one portal account has it as its first or full name. The portal search is a
substring match, so "Rei" alone would also hit "Andrei". Names with no match, or several,
wait in Admin → **Still to match**, with the candidates as one-tap buttons. They are
retried at every sync, so someone who signs up to the portal later is picked up.

## Deploy (Railway, same project as the portal)

1. **New MySQL service** (call it `workout-db`). Keep it separate from the portal's DB.
2. **New service** from this GitHub repo, named `workout-log`:
   - Settings → Source → **Root Directory `/workout-log`**. Railway then picks up this
     folder's `Dockerfile` and `railway.toml`.
   - Variables:
     - `DATABASE_URL` = `${{workout-db.MYSQL_URL}}`
     - `PORTAL_URL` = `https://fatuwr.up.railway.app`
     - `PORTAL_API_KEY` = a long random string (`openssl rand -hex 32`)
     - `SESSION_SECRET` = a different long random string
     - `BASE_PATH` = `/amager`
     - `PORT` = `3100` (fixed, so the private URL below is predictable)
   - Do **not** generate a public domain.
3. **Portal service** variables:
   - `WORKOUT_LOG_API_KEY` = the same value as `PORTAL_API_KEY` above
   - `WORKOUT_LOG_URL` = `http://${{workout-log.RAILWAY_PRIVATE_DOMAIN}}:3100`
4. Wait for both deploys, then open `https://fatuwr.up.railway.app/amager`, sign in as a
   admin email → Admin → check "Still to match".

Until step 3 is done, `/amager` answers "not configured yet" and the portal is otherwise
unaffected.

## Local dev

```bash
cp .env.example .env   # fill in, point PORTAL_URL at a local portal
npm install
npm run dev            # http://localhost:3100
npm test               # unit tests
npm run check          # typecheck
```
