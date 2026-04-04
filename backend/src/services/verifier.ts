import fs from "fs";
import crypto from "crypto";
import { config, resolvedPath } from "../config/index.js";

interface CircuitArtifact {
  bytecode: string;
  [key: string]: unknown;
}

let _circuit: CircuitArtifact | null = null;
let _vkBytes: Uint8Array | null = null;
let _circuitHash: string | null = null;
let _backend: unknown = null; // UltraHonkBackend instance, typed as unknown until bb.js is imported

export function isVerifierReady(): boolean {
  return _circuit !== null && _vkBytes !== null && _backend !== null;
}

export async function initVerifier(): Promise<void> {
  const circuitPath = resolvedPath(config.circuit.path);
  const vkPath = resolvedPath(config.circuit.vkPath);

  if (!fs.existsSync(circuitPath)) {
    console.warn(
      `[verifier] Circuit not found at ${circuitPath}. ` +
      "POST /verify will return 503 until the circuit artifact is provided.",
    );
    return;
  }

  if (!fs.existsSync(vkPath)) {
    console.warn(
      `[verifier] VK not found at ${vkPath}. ` +
      "POST /verify will return 503 until the VK is generated (bb write_vk).",
    );
    return;
  }

  const circuitRaw = fs.readFileSync(circuitPath, "utf-8");
  _circuit = JSON.parse(circuitRaw) as CircuitArtifact;
  _circuitHash = crypto.createHash("sha256").update(circuitRaw).digest("hex");

  _vkBytes = new Uint8Array(fs.readFileSync(vkPath));

  // Dynamic import — defers the heavy WASM load to startup, not module load time.
  // Always use UltraHonkBackend, NOT BarretenbergBackend (deprecated since bb v0.87.0).
  const { UltraHonkBackend } = await import("@aztec/bb.js");
  _backend = new UltraHonkBackend(_circuit.bytecode);

  console.log(`[verifier] Ready. Circuit hash: ${_circuitHash} VK version: ${config.circuit.vkVersion}`);
}

export interface ProofPublicInputs {
  nullifier_hash: string;
  region_id: string;
  centroid_lat: number;
  centroid_lon: number;
  radius_m: number;
  slot_field: string;
}

export async function verifyProof(
  proof_hex: string,
  public_inputs: ProofPublicInputs,
): Promise<boolean> {
  if (!isVerifierReady()) {
    throw new Error("Verifier not initialised — circuit artifact missing.");
  }

  const backend = _backend as {
    verifyProof: (proof: Uint8Array, publicInputs: string[]) => Promise<boolean>;
  };

  const proofBytes = Uint8Array.from(Buffer.from(proof_hex, "hex"));

  // Public inputs order must match circuit definition (see spec A.1):
  // nullifier_hash, region_id, centroid_lat, centroid_lon, radius_m, slot_field
  const inputs = [
    public_inputs.nullifier_hash,
    public_inputs.region_id,
    public_inputs.centroid_lat.toString(),
    public_inputs.centroid_lon.toString(),
    public_inputs.radius_m.toString(),
    public_inputs.slot_field,
  ];

  return backend.verifyProof(proofBytes, inputs);
}

export function getVkHex(): string | null {
  return _vkBytes ? Buffer.from(_vkBytes).toString("hex") : null;
}

export function getCircuitHash(): string | null {
  return _circuitHash;
}
