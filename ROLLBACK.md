# Database move — cutover and rollback

Moving the app's database from the US West MySQL (public proxy, ~239ms per query) to the
Singapore one in the app's own Railway project (private network, ~1-5ms per query).

Nothing here is destructive to the old database. It keeps running, untouched, and going
back to it is one variable change.

---

## Before cutover

- [ ] `npx tsx scripts/dump-database.ts <file>` — fresh dump
- [ ] `npx tsx scripts/restore-database.ts <file>` — restore, verifies row counts
- [ ] `npx tsx scripts/verify-migration.ts` — must end with "Everything matches"
- [ ] **Record the current `DATABASE_URL` value** from the app service's Variables tab.
      This is the rollback. It is also in this repo's `.env` as `DATABASE_URL`.

## Cutover

1. App service → Variables → `DATABASE_URL` → replace with the internal reference to the
   new MySQL service (type `${{` and pick its `MYSQL_URL` — the `railway.internal` one).
2. Save. Railway redeploys, ~2 minutes. **This is the only member-visible downtime.**
3. `npx tsx scripts/catch-up-new-database.ts` — dry run; shows anything written to the old
   database during the window. Re-run with `--apply` to replay it.
4. `npx tsx scripts/verify-migration.ts` again.
5. Check the app: sessions list, open a session, sign up, payments screen.

---

## Rollback

### If nothing has been written to the new database yet

Paste the old `DATABASE_URL` back into the app service's Variables and save. Railway
redeploys and you are exactly where you started. The old database never stopped holding
the current data.

### If members have been using the app on the new database

Their sign-ups are in the new database and the old one does not know about them, so replay
them BEFORE switching back. The catch-up script takes its source from `DATABASE_URL` and
its target from `NEW_DATABASE_URL`, so swapping those two reverses it (verified
2026-09-26, dry run, both directions):

```bash
# dry run: what is in the new database that the old one is missing
DATABASE_URL="$NEW_DATABASE_URL" NEW_DATABASE_URL="$OLD_URL" npx tsx scripts/catch-up-new-database.ts

# replay it
DATABASE_URL="$NEW_DATABASE_URL" NEW_DATABASE_URL="$OLD_URL" npx tsx scripts/catch-up-new-database.ts --apply
```

Then paste the old `DATABASE_URL` back in Railway.

The safety guard still applies in reverse: the script refuses to run if source and target
resolve to the same host.

### What a rollback cannot recover

- **Rows EDITED rather than inserted** during the window — an activity changed, a fee
  adjusted. These keep their id, so the id-based replay does not see them. Short windows
  keep this theoretical; if you need certainty, note the time of any admin edit.
- **Payments do not need recovering.** The Sheet is the source of truth and the app
  re-syncs from it at boot, every 6 hours, and on the GAS webhook. Never copy payment rows
  between databases by hand: the sync rewrites the whole table, so ids are not stable and
  an id-based copy duplicates every row and doubles every member's balance.

---

## After a successful cutover

- [ ] Turn OFF the new database's public TCP proxy (it existed only so the data could be
      loaded from a laptop). The app uses the private network.
- [ ] Remove the temporary `/api/dev/db-latency` endpoint from `server/_core/index.ts`.
- [ ] Keep the old database running for a few days, then delete it.
- [ ] Rotate the old database password — it has been shared in a chat transcript.
- [ ] Remove `NEW_DATABASE_URL` from `.env` and make `DATABASE_URL` point at the new
      database's PUBLIC url, so the maintenance scripts keep working.
