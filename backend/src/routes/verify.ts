import { Router } from "express";
import { z } from "zod";
import { getCurrentSlot, getRegionAccount, getNullifierAccount, registerNullifier, SolanaUnavailableError } from "../services/solana.js";
import { verifyProof, isVerifierReady } from "../services/verifier.js";
import { signJwt, isJwtSignerReady } from "../services/jwtSigner.js";
import { AppError } from "../middleware/errorHandler.js";
import { verifyLimiter } from "../middleware/rateLimiter.js";
import { config } from "../config/index.js";
import type { VerifyResponse } from "../types/index.js";

export const verifyRouter = Router();

const HEX32 = /^[0-9a-f]{64}$/i;   // 32 bytes = 64 hex chars
const HEX16 = /^[0-9a-f]{32}$/i;   // 16 bytes = 32 hex chars
const DECIMAL_U64 = /^\d{1,20}$/;   // u64 as decimal string

const VerifySchema = z.object({
  proof: z.string().regex(/^[0-9a-f]+$/i, "proof must be hex"),
  public_inputs: z.object({
    nullifier_hash: z.string().regex(HEX32, "nullifier_hash must be 32-byte hex"),
    region_id: z.string().regex(HEX16, "region_id must be 16-byte hex"),
    centroid_lat: z.number().int(),
    centroid_lon: z.number().int(),
    radius_m: z.number().int().min(1).max(100_000),
    slot_field: z.string().regex(DECIMAL_U64, "slot_field must be a decimal u64 string"),
  }),
  expires_in_seconds: z.number().int().min(1).max(3600).optional().default(3600),
});

verifyRouter.post("/verify", verifyLimiter, async (req, res, next) => {
  try {
    // Step 1: validate inputs
    const parsed = VerifySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "INVALID_INPUTS", parsed.error.issues[0]?.message ?? "Invalid inputs.");
    }
    const { proof, public_inputs, expires_in_seconds } = parsed.data;

    if (!isVerifierReady()) {
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Circuit not loaded.");
    }
    if (!isJwtSignerReady()) {
      throw new AppError(503, "SERVICE_UNAVAILABLE", "JWT signer not ready.");
    }

    // Step 2: slot window check
    let current_slot: bigint;
    try {
      current_slot = await getCurrentSlot();
    } catch (err) {
      if (err instanceof SolanaUnavailableError) {
        throw new AppError(503, "SERVICE_UNAVAILABLE", err.message);
      }
      throw err;
    }

    const slot_field = BigInt(public_inputs.slot_field);
    if (slot_field < current_slot - BigInt(config.slotWindow)) {
      throw new AppError(400, "SLOT_EXPIRED", "slot_field is too old (outside ±150 slot window).");
    }
    if (slot_field > current_slot) {
      throw new AppError(400, "SLOT_IN_FUTURE", "slot_field is ahead of current slot.");
    }

    // Step 3: fetch RegionAccount PDA and compare public inputs
    const region_id_bytes = Uint8Array.from(Buffer.from(public_inputs.region_id, "hex"));
    const regionAccount = await getRegionAccount(region_id_bytes).catch((err: unknown) => {
      if (err instanceof SolanaUnavailableError) throw new AppError(503, "SERVICE_UNAVAILABLE", err.message);
      throw err;
    });

    if (!regionAccount) {
      throw new AppError(404, "REGION_NOT_FOUND", `Region ${public_inputs.region_id} not found on-chain.`);
    }

    if (
      Number(regionAccount.centroidLat) !== public_inputs.centroid_lat ||
      Number(regionAccount.centroidLon) !== public_inputs.centroid_lon ||
      regionAccount.radiusM !== public_inputs.radius_m
    ) {
      throw new AppError(400, "REGION_MISMATCH", "Public inputs don't match on-chain RegionAccount.");
    }

    const region_name = (regionAccount.name as string) ?? public_inputs.region_id;

    // Step 4: verify UltraHonk proof
    let valid: boolean;
    try {
      valid = await verifyProof(proof, public_inputs);
    } catch {
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Proof verification failed internally.");
    }
    if (!valid) {
      throw new AppError(400, "PROOF_INVALID", "Proof is invalid.");
    }

    // Step 5: check nullifier PDA
    const nullifier_hash_bytes = Uint8Array.from(Buffer.from(public_inputs.nullifier_hash, "hex"));
    const nullifierInfo = await getNullifierAccount(nullifier_hash_bytes).catch((err: unknown) => {
      if (err instanceof SolanaUnavailableError) throw new AppError(503, "SERVICE_UNAVAILABLE", err.message);
      throw err;
    });

    if (nullifierInfo) {
      // Idempotent re-issue: nullifier exists with same slot means the backend crashed after
      // step 6 succeeded on-chain but before step 7 returned the JWT. Re-issue instead of failing.
      if (BigInt(nullifierInfo.usedAtSlot as bigint) === slot_field) {
        const { jwt, expires_at } = await signJwt({
          nullifier_hash: public_inputs.nullifier_hash,
          region_id: public_inputs.region_id,
          region_name,
          solana_slot: public_inputs.slot_field,
          expires_in_seconds: expires_in_seconds,
        });
        res.status(200).json({ jwt, expires_at } satisfies VerifyResponse);
        return;
      }
      throw new AppError(409, "NULLIFIER_USED", "This nullifier has already been registered.");
    }

    // Step 6: register nullifier on-chain
    try {
      await registerNullifier(nullifier_hash_bytes, region_id_bytes, slot_field);
    } catch (err) {
      // Log nullifier_hash for /recover in case backend crashes after on-chain success.
      console.error(
        `[verify] register_nullifier failed. nullifier_hash=${public_inputs.nullifier_hash} ` +
        `region_id=${public_inputs.region_id} slot=${slot_field}`,
        err,
      );
      if (err instanceof SolanaUnavailableError) {
        throw new AppError(503, "SERVICE_UNAVAILABLE", err.message);
      }
      throw new AppError(500, "SOLANA_ERROR", "Failed to register nullifier on-chain.");
    }

    // Step 7: sign and return JWT
    const { jwt, expires_at } = await signJwt({
      nullifier_hash: public_inputs.nullifier_hash,
      region_id: public_inputs.region_id,
      region_name,
      solana_slot: public_inputs.slot_field,
      expires_in_seconds: expires_in_seconds,
    });

    const body: VerifyResponse = { jwt, expires_at };
    res.status(200).json(body);
  } catch (err) {
    next(err);
  }
});
