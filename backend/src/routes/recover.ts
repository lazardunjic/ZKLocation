import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { getCurrentSlot, getNullifierAccount, SolanaUnavailableError } from "../services/solana.js";
import { signJwt, isJwtSignerReady } from "../services/jwtSigner.js";
import { AppError } from "../middleware/errorHandler.js";
import { recoverLimiter } from "../middleware/rateLimiter.js";
import { config } from "../config/index.js";
import { getRegionById } from "../services/regionCache.js";

export const recoverRouter = Router();

// Ed25519 SPKI header — prepended to raw 32-byte public key so Node.js crypto can parse it
const ED25519_SPKI_HEADER = Buffer.from("302a300506032b6570032100", "hex");

const QuerySchema = z.object({
  nullifier_hash: z.string().regex(/^[0-9a-f]{64}$/i, "nullifier_hash must be 32-byte hex"),
  public_key: z.string().regex(/^[0-9a-f]{64}$/i, "public_key must be 32-byte hex Ed25519 public key"),
});

function verifySessionSignature(nullifier_hash: string, public_key: string, signature_hex: string): boolean {
  try {
    const spkiKey = Buffer.concat([ED25519_SPKI_HEADER, Buffer.from(public_key, "hex")]);
    const keyObject = crypto.createPublicKey({ key: spkiKey, format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(nullifier_hash, "hex"), keyObject, Buffer.from(signature_hex, "hex"));
  } catch {
    return false;
  }
}

recoverRouter.get("/recover", recoverLimiter, async (req, res, next) => {
  try {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, "INVALID_INPUTS", parsed.error.issues[0]?.message ?? "Invalid inputs.");
    }
    const { nullifier_hash, public_key } = parsed.data;

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(400, "INVALID_INPUTS", "Authorization: Bearer <signature> required.");
    }
    const signature = authHeader.slice(7);

    if (!/^[0-9a-f]{128}$/i.test(signature)) {
      throw new AppError(400, "INVALID_INPUTS", "Signature must be 64-byte hex.");
    }

    if (!verifySessionSignature(nullifier_hash, public_key, signature)) {
      throw new AppError(401, "UNAUTHORIZED", "Signature verification failed.");
    }

    if (!isJwtSignerReady()) {
      throw new AppError(503, "SERVICE_UNAVAILABLE", "JWT signer not ready.");
    }

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
