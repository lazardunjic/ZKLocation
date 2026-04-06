import { Router } from "express";
import { isVerifierReady } from "../services/verifier.js";
import { isJwtSignerReady } from "../services/jwtSigner.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  const verifier = isVerifierReady();
  const jwtSigner = isJwtSignerReady();
  const ready = verifier && jwtSigner;

  res.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "degraded",
    verifier,
    jwtSigner,
    timestamp_ms: Date.now(),
  });
});
