export interface RegionSummary {
  region_id: string;   // 16-byte hex (32 chars)
  name: string;
  centroid_lat: number;  // micro-degrees
  centroid_lon: number;
  radius_m: number;
  distance_m: number;
}

export interface SlotResponse {
  slot: string;         // u64 decimal string
  timestamp_ms: number;
}

export interface VerifyRequest {
  proof: string;  // hex
  public_inputs: {
    nullifier_hash: string;  // 32-byte hex (64 chars)
    region_id: string;       // 16-byte hex (32 chars)
    centroid_lat: number;
    centroid_lon: number;
    radius_m: number;
    slot_field: string;      // u64 decimal string
  };
  expires_in_seconds?: number;
}

export interface VerifyResponse {
  jwt: string;
  expires_at: number;  // Unix timestamp seconds
}

export interface ErrorResponse {
  error: string;
  message: string;
}
