import { Router } from "express";
import { getCurrentSlot, SolanaUnavailableError } from "../services/solana.js";
import { AppError } from "../middleware/errorHandler.js";
import type { SlotResponse } from "../types/index.js";

export const slotRouter = Router();

slotRouter.get("/slot", async (_req, res, next) => {
  try {
    const slot = await getCurrentSlot();
    const body: SlotResponse = {
      slot: slot.toString(),
      timestamp_ms: Date.now(),
    };
    res.set("Cache-Control", "no-store");
    res.json(body);
  } catch (err) {
    if (err instanceof SolanaUnavailableError) {
      next(new AppError(503, "SERVICE_UNAVAILABLE", err.message));
    } else {
      next(err);
    }
  }
});
