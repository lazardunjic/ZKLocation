import { Noir } from '@noir-lang/noir_js';
import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';
import type { RegionSummary } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CompiledCircuit = any;

export type ProgressCallback = (msg: string, pct: number) => void;

// ── Helpers ────────────────────────────────────────────────────────────────────

function bigintToField32(n: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let v = n;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return bytes;
}

function hexToBytes32(hex: string): Uint8Array {
  const padded = hex.replace(/^0x/, '').padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Circuit loader ─────────────────────────────────────────────────────────────

let _circuit: CompiledCircuit | null = null;

export async function loadCircuit(): Promise<CompiledCircuit> {
  if (_circuit) return _circuit;
  const res = await fetch('/circuit/circuit.json');
  if (!res.ok) throw new Error('Failed to load circuit.json');
  _circuit = (await res.json()) as CompiledCircuit;
  return _circuit;
}

// ── Main prove function ────────────────────────────────────────────────────────

export interface ProveInputs {
  latMicro: number;
  lonMicro: number;
  region: RegionSummary;
  slot: string;
}

export interface ProveResult {
  proofHex: string;
  nullifierHashHex: string;
  slotField: string;
}

export async function prove(inputs: ProveInputs, onProgress: ProgressCallback): Promise<ProveResult> {
  onProgress('Loading circuit…', 5);
  const circuit = await loadCircuit();

  // 1. Generate user_secret: 31 random bytes (always < BN254 field modulus)
  onProgress('Generating secret…', 12);
  const secretBytes = new Uint8Array(31);
  crypto.getRandomValues(secretBytes);
  const secretHex = bytesToHex(secretBytes);

  // As 32-byte field (big-endian, leading zero byte)
  const secretField32 = new Uint8Array(32);
  secretField32.set(secretBytes, 1);

  const slotBigint = BigInt(inputs.slot);

  // 2. Init Barretenberg (shared instance for hash + proving)
  onProgress('Initialising prover…', 18);
  const bb = await Barretenberg.new({ threads: 1 });

  // 3. Compute nullifier_hash via Poseidon2 permutation
  //    Mirrors circuit: state = [user_secret, region_id, slot_field, 0]; out[0]
  onProgress('Computing nullifier hash…', 22);
  const poseidonInputs = [
    secretField32,
    hexToBytes32(inputs.region.region_id),
    bigintToField32(slotBigint),
    new Uint8Array(32),
  ];
  const { outputs } = await bb.poseidon2Permutation({ inputs: poseidonInputs });
  const nullifierHashHex = bytesToHex(outputs[0]);

  console.log('[prover] lat:', inputs.latMicro, 'lon:', inputs.lonMicro);
  console.log('[prover] centroid_lat:', inputs.region.centroid_lat, 'centroid_lon:', inputs.region.centroid_lon, 'radius_m:', inputs.region.radius_m);
  console.log('[prover] nullifier_hash:', nullifierHashHex);
  console.log('[prover] slot_field:', inputs.slot);

  // 4. Build Noir circuit inputs
  const noirInputs = {
    lat: inputs.latMicro.toString(),
    lon: inputs.lonMicro.toString(),
    user_secret: '0x' + secretHex,
    nullifier_hash: '0x' + nullifierHashHex,
    region_id: '0x' + inputs.region.region_id.padStart(64, '0'),
    centroid_lat: inputs.region.centroid_lat.toString(),
    centroid_lon: inputs.region.centroid_lon.toString(),
    radius_m: inputs.region.radius_m,
    slot_field: '0x' + slotBigint.toString(16).padStart(64, '0'),
  };

  // 5. Execute circuit → witness
  onProgress('Generating witness…', 35);
  const noir = new Noir(circuit);
  const { witness } = await noir.execute(noirInputs);

  // 6. Generate UltraHonk proof (v4 API: pass bytecode string + Barretenberg instance)
  onProgress('Proving (this may take a moment)…', 50);
  const backend = new UltraHonkBackend(circuit.bytecode, bb);
  const proofData = await backend.generateProof(witness);

  await bb.destroy();

  onProgress('Done.', 100);

  return {
    proofHex: bytesToHex(proofData.proof),
    nullifierHashHex,
    slotField: inputs.slot,
  };
}
