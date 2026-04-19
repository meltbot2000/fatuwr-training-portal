import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { testEmailSending } from "../email";
import { startBackgroundSync, syncTab, forceSyncTab, getSyncStatus } from "../sync";
import { seedMerchIfEmpty } from "../merchSeed";
import { startDailyBackup } from "../backup";
import { getDb } from "../db";
import { sheetSessions, sheetSignups, sheetPayments, sheetUsers } from "../../drizzle/schema";
import { ENV } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Prevent Railway's Fastly CDN from stripping Set-Cookie headers on API responses.
  // Fastly uses Surrogate-Control (not Cache-Control) to decide pass-through behaviour.
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Surrogate-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    next();
  });

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Header echo endpoint for debugging — protected by DEV_SECRET
  app.get("/api/dev/headers", (req, res) => {
    const devSecret = process.env.DEV_SECRET;
    if (!devSecret || req.query.secret !== devSecret) { res.status(403).json({ error: "Forbidden" }); return; }
    res.json({ headers: req.headers });
  });

  // Sheets → DB sync webhook (called by GAS after each write)
  // POST /api/sync?tab=payments&token=APPS_SCRIPT_SECRET
  // Also accepts GET for manual testing: GET /api/sync/status
  app.post("/api/sync", async (req, res) => {
    const { tab, token, force } = req.query as Record<string, string>;
    if (!token || token !== ENV.appsScriptSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const validTabs = ["sessions", "payments", "signups", "users"] as const;
    if (tab !== "all" && !validTabs.includes(tab as any)) {
      res.status(400).json({ error: `Invalid tab. Use one of: ${validTabs.join(", ")} or "all"` });
      return;
    }
    const tabs: readonly string[] = tab === "all" ? validTabs : [tab];
    const fn = force === "true" ? forceSyncTab : syncTab;
    tabs.forEach(t => (fn as any)(t).catch((e: any) => console.error(`[Sync webhook] ${t}:`, e)));
    res.json({ status: force === "true" ? "force sync queued" : "sync queued", tabs });
  });

  app.get("/api/sync/status", (_req, res) => {
    res.json(getSyncStatus());
  });

  // DB → Sheet export endpoint (called by GAS "Sync from DB" menu)
  // GET /api/export?tab=sessions&token=APPS_SCRIPT_SECRET
  // Returns rows as arrays in exact sheet column order so GAS can write them directly.
  app.get("/api/export", async (req, res) => {
    const { tab, token } = req.query as Record<string, string>;
    if (!token || token !== ENV.appsScriptSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const exportDb = await getDb();
    if (!exportDb) {
      res.status(503).json({ error: "DB unavailable" });
      return;
    }
    try {
      if (tab === "sessions") {
        const rows = await exportDb.select().from(sheetSessions).orderBy(sheetSessions.rowIndex);
        res.json({
          tab,
          count: rows.length,
          rows: rows.map(r => [
            r.trainingDate,        // [0]  Training Date
            r.day ?? "",           // [1]  Day
            r.trainingTime ?? "",  // [2]  Training Time
            r.pool ?? "",          // [3]  Pool
            r.poolImageUrl ?? "",  // [4]  Pool Image URL
            r.memberFee ?? 0,      // [5]  Member Fee
            r.nonMemberFee ?? 0,   // [6]  Non-Member Fee
            r.memberSwimFee ?? 0,  // [7]  Member Swim Fee
            r.nonMemberSwimFee ?? 0, // [8] Non-Member Swim Fee
            r.studentFee ?? 0,     // [9]  Student Fee
            r.studentSwimFee ?? 0, // [10] Student Swim Fee
            r.trainerFee ?? 0,     // [11] Trainer Fee
            r.notes ?? "",         // [12] Notes
            r.rowId ?? "",         // [13] Row ID
            r.attendance ?? 0,     // [14] Attendance
            r.isClosed ?? "",      // [15] Close?
            r.trainingObjective ?? "", // [16] Training Objective
            "",                    // [17] (unused)
            "",                    // [18] (unused)
            r.signUpCloseTime ?? "", // [19] Sign-Up Close Time
          ]),
        });
        return;
      }

      if (tab === "signups") {
        const rows = await exportDb.select().from(sheetSignups).orderBy(sheetSignups.id);
        res.json({
          tab,
          count: rows.length,
          rows: rows.map(r => [
            r.name ?? "",              // [0]  Name
            r.email ?? "",             // [1]  Email
            r.paymentId ?? "",         // [2]  Payment ID
            r.dateTimeOfSignUp ?? "",  // [3]  DateTime Signed Up
            r.pool ?? "",              // [4]  Pool
            r.dateOfTraining ?? "",    // [5]  Date of Training
            r.activity ?? "",          // [6]  Activity
            r.activityValue ?? "",     // [7]  Activity Value
            r.baseFee ?? 0,            // [8]  Base Fee
            r.actualFees ?? 0,         // [9]  Actual Fee
            r.memberOnTrainingDate ?? "", // [10] Member on Training Date
          ]),
        });
        return;
      }

      if (tab === "payments") {
        const rows = await exportDb.select().from(sheetPayments).orderBy(sheetPayments.id);
        res.json({
          tab,
          count: rows.length,
          rows: rows.map(r => [
            "",                // [0]  Maybank Payment Message (raw body — not stored in DB)
            "",                // [1]  Subject (not stored in DB)
            r.date ?? "",      // [2]  Date
            r.amount ?? 0,     // [3]  Amount
            r.reference ?? "", // [4]  OTHR Message
            r.paymentId ?? "", // [5]  PaymentID Match
            r.email ?? "",     // [6]  Email
          ]),
        });
        return;
      }

      if (tab === "users") {
        const rows = await exportDb.select().from(sheetUsers).orderBy(sheetUsers.id);
        res.json({
          tab,
          count: rows.length,
          rows: rows.map(r => [
            r.paymentId ?? "",     // [0]  Payment ID (col A)
            r.name ?? "",          // [1]  Name (col B)
            r.userEmail ?? "",     // [2]  User Email (col C)
            r.email ?? "",         // [3]  Email (col D)
            r.image ?? "",         // [4]  Image (col E)
            r.clubRole ?? "",      // [5]  Club Role (col F)
            r.membershipStartDate ?? "", // [6]  Annual Membership Start (col G)
            "",                    // [7]  Phone Number (col H — not in DB)
            r.dob ?? "",           // [8]  Birth Date (col I)
            r.memberStatus ?? "Non-Member", // [9]  Membership Status (col J)
            r.trialStartDate ?? "", // [10] Trial Start Date (col K)
            r.trialEndDate ?? "",  // [11] Trial End Date (col L)
            "",                    // [12] Date Created (col M — not in DB)
          ]),
        });
        return;
      }

      res.status(400).json({ error: "Unknown tab. Use one of: sessions, signups, payments, users" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Export] Error for tab=" + tab + ":", msg);
      res.status(500).json({ error: msg });
    }
  });

  // Email diagnostic endpoint — sends a real test email and returns the result
  // Usage: GET /api/test-email?to=youremail@example.com
  app.get("/api/test-email", async (req, res) => {
    const to = (req.query.to as string) || "";
    if (!to || !to.includes("@")) {
      res.status(400).json({ error: "Provide ?to=your@email.com" });
      return;
    }
    try {
      const result = await testEmailSending(to);
      res.json({ to, ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start background Sheets → DB sync after server is up
    startBackgroundSync();
    seedMerchIfEmpty().catch(e => console.error("[Seed] merch failed:", e));
    startDailyBackup();
  });
}

startServer().catch(console.error);
