import { Router } from "express";
import { isVerifierReady } from "../services/verifier.js";
import { isJwtSignerReady } from "../services/jwtSigner.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    verifier: isVerifierReady(),
    jwtSigner: isJwtSignerReady(),
    timestamp_ms: Date.now(),
  });
});
