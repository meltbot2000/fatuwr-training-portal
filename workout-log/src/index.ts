import { createApp, serveFrontend } from "./app";
import { assertConfig, config } from "./config";
import { migrate } from "./db";
import { startBackgroundSync } from "./sync";

async function main() {
  assertConfig();
  await migrate();
  const app = createApp();
  serveFrontend(app);
  app.listen(config.port, () => {
    console.log(`[workout-log] listening on :${config.port}, portal ${config.portalUrl}`);
    startBackgroundSync();
  });
}

main().catch(e => { console.error("[workout-log] failed to start:", e); process.exit(1); });
