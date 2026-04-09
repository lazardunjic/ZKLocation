# Architecture

## System Overview

ZKLocation consists of four independent components that work together to enable privacy-preserving location proofs.

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Browser                          │
│                                                                 │
│   GPS coordinates (±1km grid)                                   │
│   ──────────────────────────────────────────────────────────    │
│   1. Fetch nearby regions          GET /regions/nearby          │
│   2. Generate ZK proof (bb.js)     [stays in browser]           │
│   3. Submit proof                  POST /verify                 │
│   4. Receive JWT                                                │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend (Node.js)                        │
│                                                                 │
│   POST /verify                                                  │
│   ├── Validate inputs (zod)                                     │
│   ├── Check slot window (±150 slots ≈ 60s)                      │
│   ├── Fetch RegionAccount from Solana                           │
│   ├── Verify UltraHonk proof (bb.js WASM)                       │
│   ├── Check NullifierAccount (replay protection)                │
│   ├── Register nullifier on-chain                               │
│   └── Issue signed JWT (ES256)                                  │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Solana Devnet                               │
│                                                                 │
│   RegionAccount PDA    — stores region data                     │
│   NullifierAccount PDA — records used proofs (replay guard)     │
│   WhitelistEntry PDA   — authorized backend keypairs            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### UI (Vite + TypeScript)

The frontend is a single-page application. It:

- Acquires the user's GPS coordinates (browser Geolocation API), snapped to a ±1km grid to prevent precise coordinate leakage even to the backend
- Fetches nearby regions from the backend
- Generates a ZK proof **locally in the browser** using `@aztec/bb.js` and `@noir-lang/noir_js`
- Sends the proof and public inputs to the backend
- Displays the resulting JWT token

The exact coordinates never leave the user's device.

### Backend (Node.js + Express)

The backend is a stateless API server. It does not store user data. Its responsibilities are:

- **Proof verification** — verifies UltraHonk proofs using `@aztec/bb.js` WASM backend
- **On-chain reads** — fetches RegionAccount PDAs from Solana to validate public inputs
- **Nullifier registration** — writes NullifierAccount PDAs to Solana to prevent replay attacks
- **JWT issuance** — signs location proof tokens with ES256 (P-256)
- **Region cache** — maintains an in-memory cache of regions refreshed every 60 seconds

See [api.md](api.md) for full endpoint documentation.

### Solana Program (Rust + Anchor)

The on-chain program manages three account types:

| Account | Seeds | Purpose |
|---|---|---|
| `RegionAccount` | `["region", region_id]` | Stores region metadata (name, centroid, radius) |
| `NullifierAccount` | `["nullifier", nullifier_hash]` | Records that a proof has been used |
| `WhitelistEntry` | `["whitelist", authority]` | Authorizes a backend keypair to register nullifiers |

Instructions:
- `submit_region` — creates a new region (whitelisted authority only)
- `register_nullifier` — records a used nullifier (whitelisted authority only)
- `approve_authority` — adds a keypair to the whitelist (program admin only)
- `update_region` / `delete_region` — region management

### ZK Circuit (Noir)

The circuit is written in Noir and compiled to UltraHonk. It proves:

- The user's coordinates are within the claimed region (centroid + radius)
- The `nullifier_hash` is derived deterministically from a secret known only to the user
- The `slot_field` is bound to the proof (prevents proof reuse across time windows)

Public inputs (visible to verifier):
- `nullifier_hash` — 32 bytes
- `region_id` — 16 bytes
- `centroid_lat`, `centroid_lon` — micro-degrees
- `radius_m` — metres
- `slot_field` — Solana slot as u64

---

## Privacy Model

| What | Who sees it |
|---|---|
| Exact GPS coordinates | Nobody — stays in browser |
| Region membership | Backend (which region, not where inside it) |
| Nullifier hash | Backend + Solana chain (unlinkable across proofs) |
| JWT token | User + any third-party app they share it with |

**Unlinkability:** Each proof uses a fresh `nullifier_hash` derived from a user secret. Two proofs from the same user cannot be linked without the secret. The `/recover` endpoint uses a per-session Ed25519 keypair for the same reason — recovery requests are also unlinkable.

---

## Key Design Decisions

**Slot window (±150 slots ≈ 60s)**
Binds each proof to a specific point in time. Prevents an attacker from reusing a captured proof hours later. The UI fetches the current slot from `/slot` immediately before generating the proof.

**Nullifier on Solana chain (not a database)**
Using Solana PDAs instead of a database means nullifier state is globally verifiable, tamper-proof, and does not require a trusted backend database. Any third party can verify that a nullifier has been used.

**In-memory region cache**
Regions are fetched from Solana and cached in memory. This avoids an on-chain read for every `/regions/nearby` request (which would be slow and expensive). Cache refreshes every 60 seconds.

**Idempotent JWT re-issue**
If the backend crashes after registering a nullifier on-chain but before returning the JWT, the user would be stuck — their nullifier is used but they have no JWT. The `/verify` endpoint detects this case (nullifier exists with matching slot) and re-issues the JWT instead of returning 409.

**Dual-key JWKS**
The JWT signing infrastructure supports multiple keys simultaneously. During key rotation, both the old and new key are served via `/jwks`, allowing existing JWTs to remain valid until they expire (max 1 hour).
