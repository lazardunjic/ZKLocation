import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { config } from "../config/index.js";
import type { ErrorResponse } from "../types/index.js";

function rateLimitHandler(_req: Request, res: Response): void {
  const body: ErrorResponse = {
    error: "RATE_LIMITED",
    message: "Too many requests — slow down and retry.",
  };
  res.status(429).json(body);
}

const skipInTest = () => process.env.NODE_ENV === "test";

export const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimits.verifyPerMin,
  handler: rateLimitHandler,
  skip: skipInTest,
  standardHeaders: true,
  legacyHeaders: false,
});

export const recoverLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimits.recoverPerMin,
  handler: rateLimitHandler,
  skip: skipInTest,
  standardHeaders: true,
  legacyHeaders: false,
});

export const nearbyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimits.nearbyPerMin,
  handler: rateLimitHandler,
  skip: skipInTest,
  standardHeaders: true,
  legacyHeaders: false,
});
