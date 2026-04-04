import { Router } from "express";
import { getVkHex, getCircuitHash } from "../services/verifier.js";
import { config } from "../config/index.js";
import { AppError } from "../middleware/errorHandler.js";
import type { VkResponse } from "../types/index.js";

export const vkRouter = Router();

// Keep all historical versions live forever — integrators may cache independently.
// For now only the current version is served; add a version map when circuit upgrades occur.
vkRouter.get("/vk/:version", (req, res, next) => {
  const { version } = req.params;

  if (version !== config.circuit.vkVersion) {
    next(new AppError(404, "REGION_NOT_FOUND", `VK version ${version} not found.`));
    return;
  }

  const vk_hex = getVkHex();
  const circuit_hash = getCircuitHash();

  if (!vk_hex || !circuit_hash) {
    next(new AppError(503, "SERVICE_UNAVAILABLE", "Circuit artifact not loaded."));
    return;
  }

  const body: VkResponse = { version, vk_hex, circuit_hash };
  res.json(body);
});
