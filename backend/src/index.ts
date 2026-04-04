import "dotenv/config";
import express from "express";
import { config } from "./config/index.js";
import { initVerifier } from "./services/verifier.js";
import { initJwtSigner } from "./services/jwtSigner.js";
import { startCacheRefresh, stopCacheRefresh } from "./services/regionCache.js";
import { checkBackendKeypairBalance } from "./services/solana.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { healthRouter } from "./routes/health.js";
import { slotRouter } from "./routes/slot.js";
import { regionsRouter } from "./routes/regions.js";
import { verifyRouter } from "./routes/verify.js";
import { jwksRouter } from "./routes/jwks.js";
import { vkRouter } from "./routes/vk.js";
import { recoverRouter } from "./routes/recover.js";

async function start(): Promise<void> {
  const app = express();

  app.use(express.json({ limit: "2mb" }));

  app.use(healthRouter);
  app.use(slotRouter);
  app.use(regionsRouter);
  app.use(verifyRouter);
  app.use(jwksRouter);
  app.use(vkRouter);
  app.use(recoverRouter);

  app.use(errorHandler); // must be last

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
