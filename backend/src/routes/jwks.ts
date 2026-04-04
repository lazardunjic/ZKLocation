import { Router } from "express";
import { getJwks } from "../services/jwtSigner.js";

export const jwksRouter = Router();

jwksRouter.get("/jwks", async (_req, res, next) => {
  try {
    const jwks = await getJwks();
    // Third-party apps cache this for 1h; refresh on verification failure.
    res.set("Cache-Control", "public, max-age=3600");
    res.json(jwks);
  } catch (err) {
    next(err);
  }
});
