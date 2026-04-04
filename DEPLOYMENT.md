# Deployment Guide — Railway.app

## Prerequisites

- Code pushed to a GitHub repository
- `.env` is in `.gitignore` — **never commit it** (already set)
- A Railway account at [railway.app](https://railway.app)

---

## Steps

### 1. Push to GitHub

```bash
git add .
git commit -m "ready for deployment"
git push
```

### 2. Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Choose **Deploy from GitHub repo** → select your repository
3. Railway detects the `Dockerfile` automatically and builds it

### 3. Add MySQL database

1. In your Railway project → **New Service** → **Database** → **MySQL**
2. Once provisioned, click the MySQL service → **Variables** tab
3. Copy the `DATABASE_URL` value (format: `mysql://user:pass@host:port/dbname`)

### 4. Set environment variables

In your app service → **Variables** tab, add all of the following:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Copied from Railway MySQL service |
| `JWT_SECRET` | A long random string (e.g. `openssl rand -hex 32`) |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `RESEND_API_KEY` | Your Resend API key (`re_...`) |
| `RESEND_API_FROM` | Verified sender address (e.g. `noreply@yourdomain.com`) |
| `GOOGLE_APPS_SCRIPT_URL` | Your deployed GAS web app URL |
| `APPS_SCRIPT_SECRET` | Shared secret for GAS auth (set the same value in Code.gs) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Paste the **entire contents** of your service account JSON key file as a single line |

> **GOOGLE_SERVICE_ACCOUNT_JSON tip:** Open the downloaded JSON file, copy all contents, and paste as one line. Railway handles newlines in values correctly.

### 5. Deploy

Railway will automatically redeploy when you push to GitHub, or you can trigger a manual deploy from the dashboard. The build runs the Dockerfile:
- `pnpm install` → `pnpm build` (Vite frontend + esbuild server bundle)
- Container starts with `node dist/index.js`

### 6. Run database migrations

Once the app is live, run migrations **once** from your local machine, pointing at the Railway MySQL instance:

```bash
DATABASE_URL="mysql://user:pass@host:port/dbname" pnpm db:push
```

This creates the `users` and `otp_codes` tables.

### 7. Verify

1. Visit `https://your-app.railway.app/api/health` — should return `{ "status": "ok", "timestamp": "..." }`
2. Test the full login flow: enter email → receive OTP → verify → land on home page
3. Check the Railway logs for any errors

---

## GAS secret validation

Add this check at the top of `doPost` in `Code.gs` to reject requests without the shared secret:

```javascript
var APPS_SCRIPT_SECRET = "your-secret-here"; // same value as APPS_SCRIPT_SECRET env var

function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    if (params.token !== APPS_SCRIPT_SECRET) {
      return jsonResponse({ status: "error", message: "Unauthorized" });
    }
    // ... rest of doPost
  }
}
```

---

## Useful Railway CLI commands

```bash
# Install CLI
npm install -g @railway/cli

# Login and link project
railway login
railway link

# Tail live logs
railway logs

# Run a one-off command against the Railway environment (e.g. db:push)
railway run pnpm db:push
```
