import fs from "fs";
import path from "path";

function optional_env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optional_env("PORT", "3000"), 10),
  nodeEnv: optional_env("NODE_ENV", "development"),

  solana: {
    rpcPrimary: optional_env("SOLANA_RPC_PRIMARY", "https://api.devnet.solana.com"),
    rpcFallback: optional_env("SOLANA_RPC_FALLBACK", "https://api.devnet.solana.com"),
    programId: optional_env("PROGRAM_ID", "11111111111111111111111111111111"),
    keypairPath: optional_env("BACKEND_KEYPAIR_PATH", "./keys/backend-keypair.json"),
  },

  jwt: {
    privateKeyPath: optional_env("JWT_PRIVATE_KEY_PATH", "./keys/jwt-private.pem"),
    publicKeyPath: optional_env("JWT_PUBLIC_KEY_PATH", "./keys/jwt-public.pem"),
  },

  circuit: {
    path: optional_env("CIRCUIT_PATH", "../circuit/target/circuit.json"),
    vkPath: optional_env("VK_PATH", "../circuit/target/vk/vk"),
    vkVersion: optional_env("VK_VERSION", "1"),
  },

  rateLimits: {
    verifyPerMin: 10,
    recoverPerMin: 5,
    nearbyPerMin: 60,
  },

  // Slot window: current_slot - 150 <= slot_field <= current_slot (~60 seconds)
  slotWindow: 150,

  // /recover grace window: ~90 minutes at 400ms/slot
  recoverGraceSlots: 13_000,

  // SOL balance alert threshold for BACKEND_KEYPAIR
  solBalanceAlertThreshold: 1,

  // Set SKIP_NULLIFIER_REGISTRATION=true to bypass on-chain registration (local testing only)
  skipNullifierRegistration: optional_env("SKIP_NULLIFIER_REGISTRATION", "false") === "true",
} as const;

export function resolvedPath(p: string): string {
  return path.resolve(process.cwd(), p);
}
