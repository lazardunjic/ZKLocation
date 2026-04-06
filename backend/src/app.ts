import express from "express";
import { errorHandler } from "./middleware/errorHandler.js";
import { healthRouter } from "./routes/health.js";
import { slotRouter } from "./routes/slot.js";
import { regionsRouter } from "./routes/regions.js";
import { verifyRouter } from "./routes/verify.js";
import { jwksRouter } from "./routes/jwks.js";
import { vkRouter } from "./routes/vk.js";
import { recoverRouter } from "./routes/recover.js";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "2mb" }));

  app.use(healthRouter);
  app.use(slotRouter);
  app.use(regionsRouter);
  app.use(verifyRouter);
  app.use(jwksRouter);
  app.use(vkRouter);
  app.use(recoverRouter);

  app.use(errorHandler);

  return app;
}
