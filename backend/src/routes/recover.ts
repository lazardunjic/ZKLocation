import { Router } from "express";
import { z } from "zod";
import { getCurrentSlot, getNullifierAccount, SolanaUnavailableError } from "../services/solana.js";
import { signJwt, isJwtSignerReady } from "../services/jwtSigner.js";
import { AppError } from "../middleware/errorHandler.js";
import { recoverLimiter } from "../middleware/rateLimiter.js";
import { config } from "../config/index.js";
import { getRegionById } from "../services/regionCache.js";

export const recoverRouter = Router();

const QuerySchema = z.object({
  nullifier_hash: z.string().regex(/^[0-9a-f]{64}$/i, "nullifier_hash must be 32-byte hex"),
});

recoverRouter.get("/recover", recoverLimiter, async (req, res, next) => {
  try {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, "INVALID_INPUTS", "nullifier_hash must be 32-byte hex.");
    }
    const { nullifier_hash } = parsed.data;

    if (!isJwtSignerReady()) {
      throw new AppError(503, "SERVICE_UNAVAILABLE", "JWT signer not ready.");
    }

    // TODO: verify Bearer signature over nullifier_hash once client keypair scheme is decided (spec open issue #1). DO NOT deploy without this.
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(400, "INVALID_INPUTS", "Authorization: Bearer <signature> required.");
    }
    console.warn(`[recover] Signature verification not yet implemented. nullifier_hash=${nullifier_hash}`);

    const nullifier_hash_bytes = Uint8Array.from(Buffer.from(nullifier_hash, "hex"));

    let current_slot: bigint;
    try {
      current_slot = await getCurrentSlot();
    } catch (err) {
      if (err instanceof SolanaUnavailableError) throw new AppError(503, "SERVICE_UNAVAILABLE", err.message);
      throw err;
    }

    const nullifierAccount = await getNullifierAccount(nullifier_hash_bytes).catch((err: unknown) => {
      if (err instanceof SolanaUnavailableError) throw new AppError(503, "SERVICE_UNAVAILABLE", err.message);
      throw err;
    });

    if (!nullifierAccount) {
      throw new AppError(404, "REGION_NOT_FOUND", "NullifierAccount not found on-chain.");
    }

    const used_at_slot = BigInt(nullifierAccount.usedAtSlot as bigint);

    // ~90 min grace window: 13,000 slots × 400ms/slot
    if (used_at_slot < current_slot - BigInt(config.recoverGraceSlots)) {
      console.warn(
        `[recover] NULLIFIER_EXPIRED. nullifier_hash=${nullifier_hash} ` +
        `used_at_slot=${used_at_slot} current_slot=${current_slot} ip=${req.ip}`,
      );
      throw new AppError(409, "NULLIFIER_USED", "Nullifier is outside the 90-minute recovery window.");
    }

    const region_id_hex = Buffer.from(nullifierAccount.regionId as Uint8Array).toString("hex");

    const { jwt, expires_at } = await signJwt({
      nullifier_hash,
      region_id: region_id_hex,
      region_name: getRegionById(region_id_hex)?.name ?? region_id_hex,
      solana_slot: used_at_slot.toString(),
      expires_in_seconds: 3600,
    });

    console.log(
      `[recover] JWT re-issued. nullifier_hash=${nullifier_hash} ` +
      `region_id=${region_id_hex} ip=${req.ip} expires_at=${expires_at}`,
    );

    res.json({ jwt, expires_at });
  } catch (err) {
    next(err);
  }
});
