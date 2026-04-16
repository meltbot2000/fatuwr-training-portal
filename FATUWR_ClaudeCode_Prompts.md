# FATUWR Training Portal — Master Deployment Plan

Last updated: April 2026. This is the single source of truth.

---

## Honest Current Status

| Item | Status | Notes |
|------|--------|-------|
| App runs locally | ✅ Done | http://localhost:3000 |
| Column mapping fix (memberStatus/clubRole) | ✅ Done | Step 1 complete |
| DB schema extended (paymentId, clubRole, trial dates) | ✅ Done | Step 2 complete |
| All features Steps 3–12 built | ✅ Done | Confirmed by user |
| Cookie fix applied | ✅ Done | Claude Code applied |
| GAS secret token added | ✅ Done | APP_SECRET in Script Properties |
| Service account JSON file downloaded | ✅ Done | File is in ~/Downloads |
| Google Sheet set to Restricted | ✅ Done | No more public access |
| MySQL on Railway | ✅ Done | Database service exists |
| Service account JSON in local .env | ⚠️ In progress | bash command ran, needs verify |
| Session cookie working after fix | ⚠️ Untested | Need to restart pnpm dev and test |
| Resend email working for all users | ❌ Blocked | Needs domain — see Section 1 |
| GAS deployed as standalone script | ❓ Unknown | Confirm in Apps Script dashboard |
| GitHub repo created | ❓ Unknown | Needed for Railway deployment |
| Node.js app deployed to Railway | ❌ Not done | No app service yet, only MySQL |
| Railway env vars set | ❌ Not done | Only MySQL exists so far |
| DB tables pushed to Railway MySQL | ❌ Not done | pnpm db:push not yet run against Railway |

---

## SECTION 1 — Get a Domain for Email (Manual, ~15 mins + DNS propagation)

You need a domain to send OTP emails to anyone other than meltbot2000@gmail.com.
This is a one-time ~$10–15/year cost. It also gives the app a proper URL.

**Recommended: Cloudflare Registrar** — sells domains at cost (no markup).

1. Go to https://www.cloudflare.com/products/registrar/
2. Sign up for a free Cloudflare account
3. Search for a domain — suggestions: `fatuwr.com`, `fatuwr.app`, `fatuwr.club`
   (fatuwr.club is often ~$2–5/year)
4. Purchase it — you'll need a credit card

**Then verify it in Resend:**
1. Go to https://resend.com/domains
2. Click **Add Domain** → enter your domain (e.g. `fatuwr.club`)
3. Resend shows you 3 DNS records to add (TXT and MX records)
4. In Cloudflare dashboard → your domain → **DNS** → add each record exactly as shown
5. Click **Verify** in Resend — usually takes 5–30 minutes
6. Once verified, update your `.env`:
   ```
   RESEND_API_FROM=noreply@fatuwr.club
   ```

**Until the domain is set up:** use `meltbot2000@gmail.com` to log in and test
everything else. The OTP will print in the terminal as a fallback.

---

## SECTION 2 — Verify Local Setup is Working (Do This Now)

**Step 1: Confirm service account JSON is in .env**

Run this in your project terminal:
```bash
grep "GOOGLE_SERVICE_ACCOUNT_JSON" "/Users/melanietan/Claude code/fatuwr-training-portal/.env" | cut -c1-60
```
You should see: `GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account"...`

If you see nothing, run this (replace the filename with your actual JSON file from Downloads):
```bash
ls ~/Downloads/*.json
```
Then:
```bash
node -e "console.log('GOOGLE_SERVICE_ACCOUNT_JSON=' + JSON.stringify(JSON.parse(require('fs').readFileSync('/Users/melanietan/Downloads/REPLACE-WITH-YOUR-FILENAME.json','utf8'))))" >> "/Users/melanietan/Claude code/fatuwr-training-portal/.env"
```

**Step 2: Restart the dev server**
```bash
cd "/Users/melanietan/Claude code/fatuwr-training-portal"
pnpm dev
```

**Step 3: Test login**
1. Go to http://localhost:3000
2. Enter `meltbot2000@gmail.com`
3. Look in the terminal for `Code: XXXXXX`
4. Enter that code in the app
5. You should be logged in and see the Training Sessions list

**If sessions load → local setup is working. Move to Section 3.**
**If sessions show 401/error → paste the terminal error here.**

---

## SECTION 3 — Confirm GAS is Deployed as Standalone

1. Go to https://script.google.com
2. You should see a project that is NOT linked to any spreadsheet
   (it shows as a standalone script, not inside a Sheets file)
3. Click on it → confirm it has your `doPost()` with the token check
4. Click **Deploy → Manage deployments** → confirm there is an active deployment
5. Copy the `/exec` URL → make sure it's in your `.env` as `GOOGLE_APPS_SCRIPT_URL`
6. Also confirm `APPS_SCRIPT_SECRET` in `.env` matches the APP_SECRET in Script Properties

**If the standalone script doesn't exist yet:** Go back to the Step 3 prompt in
the previous prompts guide and run it in Claude Code, then deploy manually.

---

## SECTION 4 — Deploy to Railway (Do After Local is Confirmed Working)

### Step A: Push code to GitHub

In your project terminal:
```bash
cd "/Users/melanietan/Claude code/fatuwr-training-portal"
git init
git add .
git commit -m "FATUWR Training Portal v1"
```

Then:
1. Go to https://github.com → click **+** → **New repository**
2. Name it `fatuwr-training-portal` → **Private** → **Create repository**
3. GitHub shows you commands — run the ones under "push an existing repository":
```bash
git remote add origin https://github.com/YOUR-USERNAME/fatuwr-training-portal.git
git branch -M main
git push -u origin main
```

### Step B: Create the Node.js service in Railway

1. Go to https://railway.app → open your existing project (where MySQL is)
2. Click **+ New** → **GitHub Repo**
3. Connect your GitHub account if prompted → select `fatuwr-training-portal`
4. Railway starts building — wait for the build to complete

### Step C: Add ALL environment variables

In the new service → **Variables** tab, add every single one of these:

| Variable | Where to get it |
|----------|----------------|
| `DATABASE_URL` | Your Railway MySQL service → Variables tab → copy `DATABASE_URL` |
| `RESEND_API_KEY` | https://resend.com/api-keys |
| `RESEND_API_FROM` | `noreply@yourdomain.com` (after domain verified) or `onboarding@resend.dev` for now |
| `GOOGLE_APPS_SCRIPT_URL` | Your standalone GAS deployment → the `/exec` URL |
| `APPS_SCRIPT_SECRET` | The APP_SECRET value you set in GAS Script Properties |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Open your JSON file in TextEdit → Select All → Copy → paste directly into Railway (multi-line is fine) |
| `JWT_SECRET` | Make up any long random string, e.g. `fatuwr-secret-2026-xK9mP3qR` |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |

### Step D: Run database migrations

Once the Railway app service is deployed and running, run this once from your
local terminal (replace the URL with your actual Railway MySQL URL):

```bash
cd "/Users/melanietan/Claude code/fatuwr-training-portal"
DATABASE_URL="mysql://root:PASSWORD@HOST:PORT/railway" pnpm db:push
```

Get the exact DATABASE_URL from Railway → MySQL service → Variables tab.

### Step E: Get your public URL

In your Railway app service → **Settings** → **Networking** → **Generate Domain**
This gives you a URL like `fatuwr-training-portal.up.railway.app`

Test it by visiting that URL — you should see the app.

---

## SECTION 5 — Point Your Domain at the App (Optional but Recommended)

Once you have a domain (Section 1), you can use it for the app URL too:

1. Railway service → Settings → Networking → **Custom Domain** → enter your domain
2. Railway shows you a CNAME record to add
3. In Cloudflare → DNS → add that CNAME record
4. Wait 5–30 minutes → your app is live at `https://yourdomain.com`

---

## SECTION 6 — Final Production Checklist

Run through this after deployment:

**Auth**
- [ ] Login with meltbot2000@gmail.com → OTP arrives in email → logged in
- [ ] Login with another club member email → OTP arrives (requires verified domain)
- [ ] Logout works

**Sessions**
- [ ] Training sessions list loads
- [ ] Session detail loads with Splits button
- [ ] Sign up for a session → row appears in Google Sheet

**Payments**
- [ ] Payments tab loads, shows correct debt
- [ ] Copy buttons work for UEN and Payment ID

**Membership**
- [ ] Non-member sees Trial and Member options
- [ ] Trial sign-up sets dates in sheet

**Admin**
- [ ] Admin tab visible when logged in as Admin role user
- [ ] Members list loads

**Security**
- [ ] Google Sheet is set to Restricted (no public access)
- [ ] GAS endpoint rejects requests without correct token
- [ ] .env file is NOT committed to GitHub (check: `cat .gitignore | grep .env`)

---

## Summary: Exact Order of Next Steps

1. ✋ **Right now:** Verify local setup works (Section 2) — test login with meltbot2000@gmail.com
2. 🌐 **Get a domain** (Section 1) — Cloudflare Registrar, ~10 mins, ~$10/year
3. ✉️ **Verify domain in Resend** — add DNS records, wait for propagation
4. 🔧 **Confirm GAS standalone deployment** (Section 3)
5. 🚀 **Deploy to Railway** (Section 4, Steps A–E)
6. ✅ **Run production checklist** (Section 6)
