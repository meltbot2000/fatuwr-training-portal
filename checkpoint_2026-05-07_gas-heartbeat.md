# Checkpoint — 2026-05-07 — GAS heartbeat replaces "payment sync stale" alert

**Session goal:** Diagnose why the `⚠️ FATUWR: GAS payment sync is stale` alert was firing multiple times a day even though GAS was healthy, and replace it with something meaningful.

**Status:** Shipped. **Verification window:** user observing for 24 h (until ~2026-05-08).

---

## Diagnosis

The watchdog in `server/sync.ts` reset its 90-min timer on **every** `notifyRailway` webhook (signups, admin edits, new payment emails). For a small club with sporadic activity, going >90 min without any of those is normal — so absence-of-activity was being misread as GAS failure.

Compounding factors:
- `processMaybankEmails` only called `notifyRailway("payments")` when `newCount > 0`, so payment processing alone could not produce a heartbeat.
- The only GAS trigger was `onNewPaymentEmail` (Gmail event-based). No time-based trigger existed, so during quiet inboxes GAS literally had no reason to contact Railway.
- Net effect: the alert was a "did anything happen in the last 90 min?" detector, not a health check.

## Fix shipped (PR #1, merged → `main` at `c01cd35`, 2026-05-07T04:58:37Z)

### Server
- `server/sync.ts` — `recordGasWebhook` → `recordGasHeartbeat`; threshold 90 min → 75 min (~2 missed 30-min beats + buffer); alert subject/body now points at the heartbeat trigger.
- `server/_core/index.ts` — added `POST /api/health/gas-heartbeat?token=...`. **Removed** the watchdog reset from `POST /api/sync` (so a broken heartbeat trigger can no longer be masked by sporadic sign-ups).

### GAS — Code v14 (`google-apps-script/Code_v14_2026-05-07.gs`)
- New `gasHeartbeat()` — POSTs to `/api/health/gas-heartbeat`, reuses existing `RAILWAY_URL` + `APPS_SCRIPT_SECRET` Script Properties.
- New `createHeartbeatTrigger()` — installs a 30-min time-based trigger.
- New `deleteHeartbeatTrigger()` — symmetry with the existing payment-trigger pattern.
- **Deployed by user** on 2026-05-07; trigger confirmed installed.

### Docs
- `SYSTEM.md` §3 (sync flow) and §3 (GAS health monitor) updated.
- `google-apps-script/DEPLOY_INSTRUCTIONS.md` Step 7 added.

## Verification plan (24 h window)

| Check | Expected | Owner |
|---|---|---|
| `POST /api/health/gas-heartbeat` returns `{"status":"ok"}` after Railway redeploy | yes | done at deploy |
| Apps Script execution log shows `[gasHeartbeat] Pinged Railway` every 30 min | yes | passive |
| **No false stale-alert emails over a normal quiet period (overnight, weekend, between trainings)** | yes — this is the whole point | passive, 24 h |
| Test: pause heartbeat trigger → alert email arrives within ~75 min | yes | optional manual test if user wants extra confidence |

## What "verified" means

User reports back within 24 h either:
- **OK** — no false alerts, heartbeats are landing → close this checkpoint, mark "GAS health monitor" section in SYSTEM.md as verified.
- **NOT OK** — describe symptom (false alert / no heartbeat / etc), reopen.

## Rollback (if needed)

1. Revert PR #1 via `gh pr revert 1` or `git revert c01cd35` → push to `main` (Railway redeploys).
2. In GAS: run `deleteHeartbeatTrigger`. The old reactive watchdog comes back as it was, with all its known false-positive behavior. Use only as a stop-gap.
3. The dedicated `POST /api/health/gas-heartbeat` endpoint becomes a 404 — harmless, GAS-side calls log "Failed" but don't break anything.

## Open follow-ups (out of scope here)

None opened from this session. The fix is self-contained.

## How to resume from this checkpoint cold

1. Read `SYSTEM.md` §3 "GAS health monitor" — it now describes the heartbeat-only design.
2. If the user reports a false alert *again*, the new failure surface is one of:
   - Heartbeat trigger paused/deleted in GAS (check Triggers panel)
   - GAS OAuth revoked (re-run any function in the editor to re-grant)
   - Network/DNS issue between GAS UrlFetchApp and Railway
   - `RAILWAY_URL` or `APPS_SCRIPT_SECRET` Script Properties drifted
3. If the user reports the alert is *not firing* when it should: temporarily pause the heartbeat trigger and confirm an email arrives within 75 min.
