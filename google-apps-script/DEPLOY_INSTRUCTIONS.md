# Deploying the FATUWR Google Apps Script

## Prerequisites
You must be signed into Google as the owner of the sheet (`meltbot2000@gmail.com`).

---

## Step 1 — Open the Google Sheet

Open this URL in your browser:
```
https://docs.google.com/spreadsheets/d/19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM/edit
```

---

## Step 2 — Open Apps Script

In the menu bar: **Extensions → Apps Script**

This opens the Apps Script IDE in a new tab.

---

## Step 3 — Replace the script code

1. In the Apps Script IDE, click on `Code.gs` in the left file panel.
2. Select all existing code (`Cmd+A` on Mac, `Ctrl+A` on Windows).
3. Delete it.
4. Open `google-apps-script/Code.gs` from this project and paste the entire contents.
5. Click **Save** (the floppy disk icon, or `Cmd+S`).

---

## Step 4 — Deploy as a Web App

1. Click **Deploy** (top right) → **New deployment**.
2. Click the gear icon ⚙️ next to "Select type" and choose **Web app**.
3. Fill in the settings:
   - **Description:** `FATUWR GAS v1`
   - **Execute as:** `Me (meltbot2000@gmail.com)`
   - **Who has access:** `Anyone`
4. Click **Deploy**.
5. If prompted, click **Authorize access** and grant the requested permissions.
6. Copy the **Web app URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfyc.../exec
   ```

---

## Step 5 — Add the URL to your environment

Open `fatuwr-training-portal/.env` and set:
```
GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfyc.../exec
```
Replace the URL with the one you copied in Step 4.

---

## Step 6 — Verify the deployment

Run this in your terminal (replace the URL):
```bash
curl "https://script.google.com/macros/s/AKfyc.../exec"
```

Expected response:
```json
{"status":"ok","message":"FATUWR GAS v1 running"}
```

---

## Re-deploying after code changes

When you update `Code.gs`, you must create a **new deployment version** for changes to take effect:

1. Apps Script IDE → **Deploy** → **Manage deployments**.
2. Click the pencil ✏️ icon on your existing deployment.
3. Change **Version** to `New version`.
4. Click **Deploy**.

The `/exec` URL stays the same — no need to update `.env`.

---

## Action reference

All write actions are called via `POST` with a JSON body:

| `action`               | Required params                                                   |
|------------------------|-------------------------------------------------------------------|
| `submitSignUp`         | `name`, `email`, `trainingDate`, `pool`, `activity`, `baseFee`, `actualFee`, `memberOnTrainingDate` |
| `editSignup`           | `email`, `trainingDate`, `pool`, `activity`, `baseFee`, `actualFee` |
| `deleteSignup`         | `email`, `trainingDate`, `pool`                                   |
| `createUser`           | `name`, `email`                                                   |
| `updateTrialSignup`    | `email`                                                           |
| `updateMemberSignup`   | `email`                                                           |
| `grantStudentStatus`   | `email`                                                           |
