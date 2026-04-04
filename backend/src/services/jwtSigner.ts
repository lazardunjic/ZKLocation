import fs from "fs";
import crypto from "crypto";
import { SignJWT, importPKCS8, importSPKI, exportJWK } from "jose";
import { config, resolvedPath } from "../config/index.js";

// In production, load from HSM instead of disk.
interface KeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  kid: string; // key ID — SHA-256 thumbprint, used in JWKS + JWT header
}

// Supports dual-key JWKS during rotation: current key + any previous key still
// within the expiry window of issued JWTs (max 1 hour).
const _keys: KeyPair[] = [];
let _currentKid: string | null = null;

async function thumbprint(key: CryptoKey): Promise<string> {
  const jwk = await exportJWK(key);
  const canonical = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export async function initJwtSigner(): Promise<void> {
  const privPath = resolvedPath(config.jwt.privateKeyPath);
  const pubPath = resolvedPath(config.jwt.publicKeyPath);

  if (!fs.existsSync(privPath) || !fs.existsSync(pubPath)) {
    console.warn(
      "[jwtSigner] JWT keys not found. " +
      `Generate with: node scripts/generate-jwt-keys.js\n` +
      `Expected: ${privPath} and ${pubPath}`,
    );
    return;
  }

  const privPem = fs.readFileSync(privPath, "utf-8");
  const pubPem = fs.readFileSync(pubPath, "utf-8");

  const privateKey = await importPKCS8(privPem, "ES256");
  const publicKey = await importSPKI(pubPem, "ES256");
  const kid = await thumbprint(publicKey);

  _keys.push({ privateKey, publicKey, kid });
  _currentKid = kid;

  console.log(`[jwtSigner] Ready. kid=${kid}`);
}

export function isJwtSignerReady(): boolean {
  return _currentKid !== null;
}

export interface JwtClaims {
  nullifier_hash: string;
  region_id: string;
  region_name: string;
  solana_slot: string;
  expires_in_seconds: number;
}

export async function signJwt(claims: JwtClaims): Promise<{ jwt: string; expires_at: number }> {
  if (!_currentKid) throw new Error("JWT signer not initialised.");

  const key = _keys.find((k) => k.kid === _currentKid)!;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.min(claims.expires_in_seconds, 3600);

  const jwt = await new SignJWT({
    region_id: claims.region_id,
    region_name: claims.region_name,
    zk_verified: true,
    solana_slot: claims.solana_slot,
    vk_version: config.circuit.vkVersion,
  })
    .setProtectedHeader({ alg: "ES256", kid: key.kid })
    .setSubject(claims.nullifier_hash)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key.privateKey);

  return { jwt, expires_at: exp };
}

export async function getJwks(): Promise<{ keys: object[] }> {
  const keys = await Promise.all(
    _keys.map(async ({ publicKey, kid }) => {
      const jwk = await exportJWK(publicKey);
      return { ...jwk, alg: "ES256", use: "sig", kid };
    }),
  );
  return { keys };
}
