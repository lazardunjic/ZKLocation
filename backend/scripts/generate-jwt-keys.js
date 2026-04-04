#!/usr/bin/env node
// Generates a dev ES256 P-256 keypair for JWT signing.
// In production: use an HSM or hardware wallet instead.

import { generateKeyPairSync } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keysDir = join(__dirname, "..", "keys");

mkdirSync(keysDir, { recursive: true });

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });

const privPem = privateKey.export({ type: "pkcs8", format: "pem" });
const pubPem = publicKey.export({ type: "spki", format: "pem" });

writeFileSync(join(keysDir, "jwt-private.pem"), privPem, { mode: 0o600 });
writeFileSync(join(keysDir, "jwt-public.pem"), pubPem);

console.log("Generated keys/jwt-private.pem and keys/jwt-public.pem");
console.log("Never commit jwt-private.pem to git.");
