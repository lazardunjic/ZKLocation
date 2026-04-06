import "dotenv/config";
import { config } from "./config/index.js";
import { createApp } from "./app.js";
import { initVerifier } from "./services/verifier.js";
import { initJwtSigner } from "./services/jwtSigner.js";
import { startCacheRefresh, stopCacheRefresh } from "./services/regionCache.js";
import { checkBackendKeypairBalance } from "./services/solana.js";

async function start(): Promise<void> {
  const app = createApp();

  await initVerifier();
  await initJwtSigner();
  startCacheRefresh();

  // Balance check on startup + every 30 min
  await checkBackendKeypairBalance();
  setInterval(() => void checkBackendKeypairBalance(), 30 * 60 * 1000);

  const server = app.listen(config.port, () => {
    console.log(`[server] ZK Location backend running on port ${config.port} (${config.nodeEnv})`);
  });

  const shutdown = (): void => {
    console.log("[server] Shutting down...");
    stopCacheRefresh();
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

start().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});
