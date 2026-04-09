import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import fs from "fs";
import { createRequire } from "module";
import { config, resolvedPath } from "../config/index.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BN = require("bn.js") as new (n: string) => any;

let _connection: Connection | null = null;
let _usingFallback = false;
let _program: Program | null = null;

function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(config.solana.rpcPrimary, "confirmed");
  }
  return _connection;
}

export async function withFallback<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
  try {
    const result = await fn(getConnection());
    if (_usingFallback) {
      console.log("[solana] Primary RPC recovered — switching back.");
      _connection = new Connection(config.solana.rpcPrimary, "confirmed");
      _usingFallback = false;
      _program = null; // rebuild with new connection
    }
    return result;
  } catch (primaryErr) {
    if (!_usingFallback) {
      console.warn("[solana] Primary RPC failed — switching to fallback.", primaryErr);
      _connection = new Connection(config.solana.rpcFallback, "confirmed");
      _usingFallback = true;
      _program = null; // rebuild with new connection
    }
    try {
      return await fn(_connection!);
    } catch (_fallbackErr) {
      throw new SolanaUnavailableError("Both Solana RPC endpoints are unreachable.");
    }
  }
}

export class SolanaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SolanaUnavailableError";
  }
}

let _backendKeypair: Keypair | null = null;

export function getBackendKeypair(): Keypair {
  if (!_backendKeypair) {
    const keypairPath = resolvedPath(config.solana.keypairPath);
    if (!fs.existsSync(keypairPath)) {
      throw new Error(
        `Backend keypair not found at ${keypairPath}. ` +
        `Run: solana-keygen new --outfile ${keypairPath}`,
      );
    }
    const raw = JSON.parse(fs.readFileSync(keypairPath, "utf-8")) as number[];
    _backendKeypair = Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  return _backendKeypair;
}

export function getProgram(): Program {
  if (_program) return _program;

  const keypair = getBackendKeypair();
  const connection = getConnection();
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  _program = new Program(require("../idl/zklocation.json") as Idl, provider);
  return _program;
}

export async function getCurrentSlot(): Promise<bigint> {
  return withFallback(async (conn) => {
    const slot = await conn.getSlot("confirmed");
    return BigInt(slot);
  });
}

export function regionPda(region_id: Uint8Array): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("region"), Buffer.from(region_id)],
    new PublicKey(config.solana.programId),
  );
  return pda;
}

export function nullifierPda(nullifier_hash: Uint8Array): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("nullifier"), Buffer.from(nullifier_hash)],
    new PublicKey(config.solana.programId),
  );
  return pda;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function accounts(program: Program): any {
  return program.account;
}

export async function getRegionAccount(region_id: Uint8Array) {
  const pda = regionPda(region_id);
  console.log(`[solana] getRegionAccount pda=${pda.toBase58()} programId=${config.solana.programId}`);
  try {
    return await accounts(getProgram()).regionAccount.fetch(pda);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Account does not exist")) return null;
    throw err;
  }
}

export async function getNullifierAccount(nullifier_hash: Uint8Array) {
  const pda = nullifierPda(nullifier_hash);
  try {
    return await accounts(getProgram()).nullifierAccount.fetch(pda);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Account does not exist")) return null;
    throw err;
  }
}

export async function getAllRegionAccounts() {
  return accounts(getProgram()).regionAccount.all();
}

export async function checkBackendKeypairBalance(): Promise<void> {
  try {
    const keypair = getBackendKeypair();
    const balance = await withFallback<number>((conn) =>
      conn.getBalance(keypair.publicKey),
    );
    const sol = balance / 1e9;
    if (sol < config.solBalanceAlertThreshold) {
      console.warn(
        `[ALERT] BACKEND_KEYPAIR balance is ${sol.toFixed(4)} SOL — below ${config.solBalanceAlertThreshold} SOL threshold. ` +
        `~${Math.floor(sol / 0.00089)} proofs remaining. Top up from hardware wallet.`,
      );
    }
  } catch (err) {
    console.error("[balance monitor] Failed to check keypair balance:", err);
  }
}

export async function registerNullifier(
  nullifier_hash: Uint8Array,
  region_id: Uint8Array,
  slot: bigint,
): Promise<string> {
  const program = getProgram();
  const keypair = getBackendKeypair();

  const nullifier_pda = nullifierPda(nullifier_hash);
  const region_pda = regionPda(region_id);

  // init_if_needed: if account already exists, asserts fields match — safe to retry on network timeout
  const tx = await program.methods
    .registerNullifier(
      Array.from(nullifier_hash),
      Array.from(region_id),
      new BN(slot.toString()),
    )
    .accounts({
      nullifierPda: nullifier_pda,
      backendAuthority: keypair.publicKey,
      regionPda: region_pda,
      systemProgram: PublicKey.default,
    })
    .rpc();

  return tx;
}
