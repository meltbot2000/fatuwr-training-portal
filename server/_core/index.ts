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
import { getLatestOtp } from "../db";
import { startBackgroundSync, syncTab, getSyncStatus } from "../sync";
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

  // OTP retrieval endpoint for automated testing — protected by DEV_SECRET env var
  // Usage: GET /api/dev/otp?email=x@y.com&secret=YOUR_DEV_SECRET
  app.get("/api/dev/otp", async (req, res) => {
    const devSecret = process.env.DEV_SECRET;
    if (!devSecret) { res.status(404).json({ error: "Not found" }); return; }
    if (req.query.secret !== devSecret) { res.status(403).json({ error: "Forbidden" }); return; }
    const email = (req.query.email as string) || "";
    if (!email) { res.status(400).json({ error: "Provide ?email=" }); return; }
    const code = await getLatestOtp(email.toLowerCase().trim());
    res.json({ code });
  });

  // Sheets → DB sync webhook (called by GAS after each write)
  // POST /api/sync?tab=payments&token=APPS_SCRIPT_SECRET
  // Also accepts GET for manual testing: GET /api/sync/status
  app.post("/api/sync", async (req, res) => {
    const { tab, token } = req.query as Record<string, string>;
    if (!token || token !== ENV.appsScriptSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const validTabs = ["sessions", "payments", "signups", "users"] as const;
    if (!validTabs.includes(tab as any)) {
      res.status(400).json({ error: `Invalid tab. Use one of: ${validTabs.join(", ")}` });
      return;
    }
    // Fire sync asynchronously — don't block GAS waiting for it
    syncTab(tab as any).catch(e => console.error(`[Sync webhook] ${tab}:`, e));
    res.json({ status: "sync queued", tab });
  });

  app.get("/api/sync/status", (_req, res) => {
    res.json(getSyncStatus());
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
  });
}

startServer().catch(console.error);
