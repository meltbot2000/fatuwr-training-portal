# FATUWR Training Portal

**Read [`SYSTEM.md`](SYSTEM.md) before doing any work** — it is the single source of truth for architecture, data flow, and key flows. Also read the latest `checkpoint_*.md` if present.

## Critical rules (do not relearn these the hard way)

- **The Postgres/MySQL DB is the source of truth for everything EXCEPT payments.** For users, sign-ups, sessions, membership: the DB takes precedence. Diagnose user data from the **DB**, never from the Google Sheet.
- **The Google Sheet is only the source of truth for payments.** For users/sign-ups it is stale — it only reflects the DB when a sync is **manually triggered**. Do not draw conclusions about user data from the sheet.
- **GAS `.gs` files:** never overwrite — create a versioned copy (see `google-apps-script/`).
- **Git:** push direct to `main`; no PRs unless asked.
- Surface findings directly in chat; don't make the user dig.
