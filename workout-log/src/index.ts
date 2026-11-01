import express from "express";
import { createApp, serveFrontend } from "./app";
import { assertConfig, config } from "./config";
import { getPool, migrate } from "./db";
import { seedCompetitions } from "./seed";
import { startBackgroundSync } from "./sync";

async function main() {
  assertConfig();
  await migrate();
  await seedCompetitions();

  const inner = createApp();
  serveFrontend(inner, config.basePath);

  let app = inner;
  if (config.basePath) {
    // Served under a prefix (e.g. /amager, forwarded by the portal). The prefix is kept
    // on forwarded requests, so mount the whole app beneath it.
    app = express();
    app.disable("x-powered-by");
    // Healthchecks stay at the root: Railway probes this service directly.
    app.get("/api/health", (_req, res) => { res.json({ status: "ok" }); });
    app.get("/api/health/db", async (_req, res) => {
      try { await getPool().query("SELECT 1"); res.json({ status: "ok" }); }
      catch { res.status(503).json({ status: "db_unreachable" }); }
    });
    // /amager → /amager/ so relative URLs and <base href> resolve under the prefix.
    app.use((req, res, next) => {
      if (req.path === config.basePath) { res.redirect(302, config.basePath + "/" + (req.url.split("?")[1] ? "?" + req.url.split("?")[1] : "")); return; }
      next();
    });
    app.use(config.basePath, inner);
  }

  // No host argument: Node binds "::" (dual-stack), which Railway's private network needs.
  app.listen(config.port, () => {
    console.log(`[workout-log] listening on :${config.port}${config.basePath || "/"}, portal ${config.portalUrl}`);
    startBackgroundSync();
  });
}

main().catch(e => { console.error("[workout-log] failed to start:", e); process.exit(1); });
