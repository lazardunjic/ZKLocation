import { Router } from "express";
import { z } from "zod";
import { getNearbyRegions, getRegionById } from "../services/regionCache.js";
import { AppError } from "../middleware/errorHandler.js";
import { nearbyLimiter } from "../middleware/rateLimiter.js";

export const regionsRouter = Router();

const NearbyQuerySchema = z.object({
  lat: z.string().regex(/^-?\d+$/).transform(Number),
  lon: z.string().regex(/^-?\d+$/).transform(Number),
});

regionsRouter.get("/regions/nearby", nearbyLimiter, (req, res, next) => {
  const parsed = NearbyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    next(new AppError(400, "INVALID_COORDS", "lat and lon must be integers (micro-degrees)."));
    return;
  }

  const { lat, lon } = parsed.data;

  // Sanity bounds: micro-degrees
  if (lat < -90_000_000 || lat > 90_000_000 || lon < -180_000_000 || lon > 180_000_000) {
    next(new AppError(400, "INVALID_COORDS", "lat/lon out of valid range."));
    return;
  }

  const regions = getNearbyRegions(lat, lon);
  res.json(regions);
});

regionsRouter.get("/regions/:region_id", (req, res, next) => {
  const { region_id } = req.params;
  const region = getRegionById(region_id);
  if (!region) {
    next(new AppError(404, "REGION_NOT_FOUND", `Region ${region_id} not found.`));
    return;
  }
  res.json(region);
});
