# Database move — cutover and rollback

Moving the app's database from the US West MySQL (public proxy, ~239ms per query) to the
Singapore one in the app's own Railway project (private network, ~1-5ms per query).

The old database keeps running throughout and is never written to by this procedure.

**Confirmed by probe, 2026-09-26:** the app reaches the new database at
`mysql.railway.internal` — resolves and connects in **30ms** (the probe got
`ER_ACCESS_DENIED_ERROR` only because it was built from the old database's password).
The public proxy, by comparison, takes 1,173ms just to open a connection.

---

## Before cutover

- [ ] The DB-aware healthcheck (`/api/health/db`, `railway.toml`) must already be
      **deployed and green**. Without it a cutover to an unreachable database passes
      Railway's healthcheck in seconds, the old container is killed, every member is
      silently logged out, and sessions and rosters fall back to the STALE Google Sheet
      while looking like they work.
- [ ] Tell anyone else with Admin: **do not touch Admin → Data** until this is done.
      "Import from Sheets" (`forceSyncTab`) does a DELETE + INSERT from the Sheet, which
      for DB-primary tables destroys data on whichever database is live.
- [ ] `npx tsx scripts/dump-database.ts <file>`
- [ ] `npx tsx scripts/restore-database.ts <file>` — restores and checks row counts
- [ ] `npx tsx scripts/verify-migration.ts` — must end with "Everything matches"
- [ ] **Record the current `DATABASE_URL`** from the app service's Variables tab. That
      value is the rollback. It is also this repo's `.env` `DATABASE_URL`.

## Cutover

1. App service → Variables → `DATABASE_URL` → `${{MySQL.MYSQL_URL}}`
   (type `${{` and pick the new MySQL service's `MYSQL_URL` — the `railway.internal` one).
2. Save. Railway redeploys.
3. **Watch the deploy logs. Do not walk away.** You are looking for
   `[DB] Connection warmed in <N>ms` — single or low double digits now — and NOT
   `[DB] Warm-up failed`. If the healthcheck fails, the deployment does not go live and
   the old one keeps serving: fix the variable and redeploy.
4. Wait until the **old deployment is fully removed**, not just until the new one is green.
   Railway drains the old container, and it keeps writing until it stops (every
   authenticated request updates `users.lastSignedIn`).
5. `npx tsx scripts/catch-up-new-database.ts` — dry run; shows what landed on the old
   database during the window. Re-run with `--apply` to replay it, then run it once more:
   the second run should say "up to date" for every table.
6. **Repoint `.env` now**, not later: set `DATABASE_URL` to the new database's PUBLIC url
   and keep the old one under `OLD_DATABASE_URL`. Until you do, `pnpm db:push` and the
   repair scripts all operate on the abandoned database.
7. Check the app by hand: sessions list, open a session, sign up, payments screen, admin.

**Do not run `verify-migration.ts` after cutover.** It compares the two databases row for
row, and the moment the new one takes traffic they legitimately diverge — the first
authenticated request alone bumps `users.lastSignedIn`. It would report "DO NOT CUT OVER"
about a healthy system.

---

## Rollback

### Before anything has been written to the new database

Paste the old `DATABASE_URL` back into the app service's Variables and save. Railway
redeploys and you are exactly where you started.

### After members have used the new database

Their sign-ups exist only there, so replay them to the old database BEFORE switching back.
The catch-up script takes its source from `DATABASE_URL` and its target from
`NEW_DATABASE_URL`, so swapping those two reverses it (verified in dry run, both
directions, 2026-09-26). It refuses to run if both resolve to the same host.

```bash
# from the project folder, with OLD_DATABASE_URL and NEW_DATABASE_URL set in .env:
export NEW_URL="$(grep '^NEW_DATABASE_URL=' .env | cut -d= -f2-)"
export OLD_URL="$(grep '^OLD_DATABASE_URL=' .env | cut -d= -f2-)"

# dry run: what the old database is missing
DATABASE_URL="$NEW_URL" NEW_DATABASE_URL="$OLD_URL" npx tsx scripts/catch-up-new-database.ts

# replay it
DATABASE_URL="$NEW_URL" NEW_DATABASE_URL="$OLD_URL" npx tsx scripts/catch-up-new-database.ts --apply
```

Then paste the old `DATABASE_URL` back in Railway.

**The new database's public TCP proxy must stay ON until the rollback window has closed** —
that proxy is `NEW_DATABASE_URL`, and the replay above runs from a laptop. Turning it off
early closes the rollback door.

### What a rollback cannot recover

- **Rows edited rather than inserted.** They keep their id, so a watermark replay cannot
  see them. The catch-up script now reports timestamp drift per table so these are at
  least visible. Concretely: a trial sign-up in the window is replayed as a row but its
  membership-status update is not, leaving the member charged and still Non-Member; a
  rain-off sets fees to zero by UPDATE; a deleted sign-up reappears, because the replay
  only copies forward.
- **Payments need no recovery.** The Sheet owns them and the app re-syncs at boot, every
  6 hours, and on the GAS webhook. Never copy payment rows between databases: the sync
  rewrites the whole table, so ids are not stable and an id-based copy duplicates every
  row and doubles every member's balance.

---

## Once the rollback window has closed

- [ ] Turn OFF the new database's public TCP proxy
- [ ] Remove `/api/dev/db-latency` from `server/_core/index.ts`
- [ ] Delete the old database service
- [ ] Rotate the old database password — it was shared in a chat transcript
