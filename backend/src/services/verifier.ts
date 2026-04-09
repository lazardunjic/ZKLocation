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
let _backend: unknown = null;
let _bb: unknown = null;

export function isVerifierReady(): boolean {
  return _circuit !== null && _backend !== null;
}

export async function initVerifier(): Promise<void> {
  const circuitPath = resolvedPath(config.circuit.path);

  if (!fs.existsSync(circuitPath)) {
    console.warn(
      `[verifier] Circuit not found at ${circuitPath}. ` +
      "POST /verify will return 503 until the circuit artifact is provided.",
    );
    return;
  }

  const circuitRaw = fs.readFileSync(circuitPath, "utf-8");
  _circuit = JSON.parse(circuitRaw) as CircuitArtifact;
  _circuitHash = crypto.createHash("sha256").update(circuitRaw).digest("hex");

  // v4 nightly API: UltraHonkBackend(bytecode, Barretenberg)
  // Force WASM backend — no native bb binary available in this environment
  const { Barretenberg, UltraHonkBackend, BackendType } = await import("@aztec/bb.js");
  const bb = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1 });
  _bb = bb;
  _backend = new UltraHonkBackend(_circuit.bytecode, bb);

  // VK path optional — v4 UltraHonkBackend computes VK internally during verifyProof
  const vkPath = resolvedPath(config.circuit.vkPath);
  if (fs.existsSync(vkPath)) {
    _vkBytes = new Uint8Array(fs.readFileSync(vkPath));
  } else {
    console.warn(`[verifier] VK not found at ${vkPath} — verifyProof will compute VK on-the-fly (slower).`);
  }

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
    verifyProof: (proofData: { proof: Uint8Array; publicInputs: string[] }) => Promise<boolean>;
  };

  const proofBytes = Uint8Array.from(Buffer.from(proof_hex, "hex"));

  // bb.js v4 expects public inputs as 0x-prefixed 32-byte (64 hex char) field elements
  function toField(n: bigint | number): string {
    return "0x" + BigInt(n).toString(16).padStart(64, "0");
  }
  function hexToField(hex: string): string {
    return "0x" + hex.replace(/^0x/, "").padStart(64, "0");
  }

  // Public inputs order must match circuit definition (see spec A.1):
  // nullifier_hash, region_id, centroid_lat, centroid_lon, radius_m, slot_field
  const proofData = {
    proof: proofBytes,
    publicInputs: [
      hexToField(public_inputs.nullifier_hash),
      hexToField(public_inputs.region_id),
      toField(public_inputs.centroid_lat),
      toField(public_inputs.centroid_lon),
      toField(public_inputs.radius_m),
      toField(BigInt(public_inputs.slot_field)),
    ],
  };

  try {
    const result = await backend.verifyProof(proofData);
    console.log(`[verifier] verifyProof result: ${result}`);
    return result;
  } catch (err) {
    console.error("[verifier] verifyProof threw:", err);
    throw err;
  }
}

export function getVkHex(): string | null {
  return _vkBytes ? Buffer.from(_vkBytes).toString("hex") : null;
}

export function getCircuitHash(): string | null {
  return _circuitHash;
}
