# ZKLocation

**Prove you were there — reveal nothing else.**

ZKLocation allows users to prove their presence at a specific location without revealing their exact coordinates. It uses Zero-Knowledge proofs (UltraHonk/Noir) to generate a cryptographic proof in the browser, which the backend verifies and issues a signed JWT token. The proof is recorded on the Solana blockchain to ensure the same proof cannot be used twice.

---

## Demo

> UI: _link after deployment_  
> Backend: _link after deployment_

---

## Project Structure

```
circuit/    — Noir ZK circuit + verification key
program/    — Anchor program (Solana devnet)
backend/    — Node.js + Express API
ui/         — Vite + TypeScript frontend
docs/       — Documentation
```

---

## How It Works

1. User opens the UI and enters or acquires GPS coordinates
2. UI fetches nearby regions from the backend
3. User selects a region and clicks "Generate Proof"
4. ZK proof is generated **locally in the browser** — coordinates never leave the device
5. Proof is sent to the backend which:
   - Verifies the ZK proof
   - Registers a nullifier on the Solana chain (replay protection)
   - Issues a signed JWT token
6. User receives a JWT as proof of presence

---

## Running Locally

Running this project locally requires additional files that are not in the repository for security reasons (private keys, circuit artifacts). See [docs/setup.md](docs/setup.md).

---

## Team

| Name | Role |
|---|---|
| Mihaela | Backend (Node.js + Express) |
| Isidora | UI (Vite + TypeScript) |
| Lazar | Solana Program (Rust + Anchor) |
| Nemanja | ZK Circuit (Noir) |
