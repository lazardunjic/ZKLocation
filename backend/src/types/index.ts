// ── POST /verify ──────────────────────────────────────────────────────────────
export interface VerifyRequest {
  proof: string; // hex-encoded UltraHonk proof
  public_inputs: {
    nullifier_hash: string; // 32-byte hex
    region_id: string;      // 16-byte hex (UUID v4)
    centroid_lat: number;   // micro-degrees i64
    centroid_lon: number;
    radius_m: number;       // u32
    slot_field: string;     // u64 as DECIMAL STRING — prevents JS precision loss
  };
  expires_in_seconds?: number; // 1..=3600; default 3600
}

export interface VerifyResponse {
  jwt: string;
  expires_at: number; // Unix timestamp seconds
}

// ── GET /regions/nearby?lat=44787000&lon=20457000 ─────────────────────────────
export interface RegionSummary {
  region_id: string;
  name: string;
  centroid_lat: number;
  centroid_lon: number;
  radius_m: number;
  distance_m: number;
}

export type NearbyResponse = RegionSummary[];

// ── GET /slot ─────────────────────────────────────────────────────────────────
export interface SlotResponse {
  slot: string;          // u64 as DECIMAL STRING
  timestamp_ms: number;  // server Unix ms, informational only
}

// ── GET /vk/:version ─────────────────────────────────────────────────────────
export interface VkResponse {
  version: string;
  vk_hex: string;       // hex-encoded VK bytes
  circuit_hash: string; // SHA-256 of compiled circuit.json
}

// ── GET /recover?nullifier_hash=<hex> ────────────────────────────────────────
// Auth: Bearer base64(signature over nullifier_hash using client keypair)
export interface RecoverResponse {
  jwt: string;
  expires_at: number;
}

// ── Error response ────────────────────────────────────────────────────────────
export interface ErrorResponse {
  error: ErrorCode;
  message: string;
}

export type ErrorCode =
  | "INVALID_INPUTS"
  | "SLOT_EXPIRED"
  | "SLOT_IN_FUTURE"
  | "REGION_MISMATCH"
  | "PROOF_INVALID"
  | "REGION_NOT_FOUND"
  | "NULLIFIER_USED"
  | "NULLIFIER_EXPIRED"
  | "RATE_LIMITED"
  | "SOLANA_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "INVALID_COORDS";

// ── On-chain account shapes (mirroring Anchor structs) ───────────────────────
export interface RegionAccount {
  region_id: Uint8Array;   // [u8; 16]
  name: string;
  centroid_lat: bigint;    // i64
  centroid_lon: bigint;    // i64
  radius_m: number;        // u32
  authority: string;       // Pubkey as base58
  bump: number;
}

export interface NullifierAccount {
  nullifier_hash: Uint8Array; // [u8; 32]
  region_id: Uint8Array;      // [u8; 16]
  used_at_slot: bigint;       // u64
  bump: number;
}
