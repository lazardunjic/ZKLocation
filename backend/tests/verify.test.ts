import request from "supertest";
import crypto from "crypto";
import { createApp } from "../src/app.js";
import { signJwt, initJwtSigner } from "../src/services/jwtSigner.js";

const app = createApp();

// Valid-shaped inputs — will hit 503 (verifier not loaded) rather than earlier errors.
// Used as base for mutation tests below.
const VALID_BODY = {
  proof: "ab".repeat(64),
  public_inputs: {
    nullifier_hash: "ab".repeat(32),
    region_id: "cd".repeat(16),
    centroid_lat: 44_787_000,
    centroid_lon: 20_457_000,
    radius_m: 1000,
    slot_field: "280000000",
  },
  expires_in_seconds: 3600,
};

describe("POST /verify — input validation (Step 1)", () => {
  test("missing proof → 400 INVALID_INPUTS", async () => {
    const body = { ...VALID_BODY, proof: undefined };
    const res = await request(app).post("/verify").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_INPUTS");
  });

  test("proof not hex → 400 INVALID_INPUTS", async () => {
    const body = { ...VALID_BODY, proof: "not-hex!!" };
    const res = await request(app).post("/verify").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_INPUTS");
  });

  test("nullifier_hash wrong length → 400 INVALID_INPUTS", async () => {
    const body = {
      ...VALID_BODY,
      public_inputs: { ...VALID_BODY.public_inputs, nullifier_hash: "abcd" },
    };
    const res = await request(app).post("/verify").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_INPUTS");
  });

  test("region_id wrong length → 400 INVALID_INPUTS", async () => {
    const body = {
      ...VALID_BODY,
      public_inputs: { ...VALID_BODY.public_inputs, region_id: "abcd" },
    };
    const res = await request(app).post("/verify").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_INPUTS");
  });

  test("radius_m too large → 400 INVALID_INPUTS", async () => {
    const body = {
      ...VALID_BODY,
      public_inputs: { ...VALID_BODY.public_inputs, radius_m: 200_000 },
    };
    const res = await request(app).post("/verify").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_INPUTS");
  });

  test("slot_field not decimal string → 400 INVALID_INPUTS", async () => {
    const body = {
      ...VALID_BODY,
      public_inputs: { ...VALID_BODY.public_inputs, slot_field: "0x1234" },
    };
    const res = await request(app).post("/verify").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_INPUTS");
  });

  test("expires_in_seconds out of range → 400 INVALID_INPUTS", async () => {
    const body = { ...VALID_BODY, expires_in_seconds: 9999 };
    const res = await request(app).post("/verify").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_INPUTS");
  });

  test("empty body → 400 INVALID_INPUTS", async () => {
    const res = await request(app).post("/verify").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_INPUTS");
  });
});

describe("POST /verify — verifier not loaded (Step 1 guard)", () => {
  test("valid inputs but no circuit loaded → 503 SERVICE_UNAVAILABLE", async () => {
    const res = await request(app).post("/verify").send(VALID_BODY);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("GET /health", () => {
  test("returns 503 degraded when circuit not loaded", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.verifier).toBe(false);
  });
});

describe("GET /regions/nearby", () => {
  test("missing lat/lon → 400 INVALID_COORDS", async () => {
    const res = await request(app).get("/regions/nearby");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_COORDS");
  });

  test("non-integer lat → 400 INVALID_COORDS", async () => {
    const res = await request(app).get("/regions/nearby?lat=44.78&lon=20457000");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_COORDS");
  });

  test("lat out of range → 400 INVALID_COORDS", async () => {
    const res = await request(app).get("/regions/nearby?lat=999000000&lon=20457000");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_COORDS");
  });

  test("valid coords → 200 with empty array (no regions in cache)", async () => {
    const res = await request(app).get("/regions/nearby?lat=44787000&lon=20457000");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /regions/:region_id", () => {
  test("unknown region → 404 REGION_NOT_FOUND", async () => {
    const res = await request(app).get(`/regions/${"cd".repeat(16)}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("REGION_NOT_FOUND");
  });
});

describe("GET /jwks", () => {
  test("returns keys array", async () => {
    const res = await request(app).get("/jwks");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("keys");
    expect(Array.isArray(res.body.keys)).toBe(true);
  });
});

describe("GET /recover", () => {
  const nullifier_hash = "ab".repeat(32);
  const public_key = "cd".repeat(32);
  const valid_sig = "ef".repeat(64);

  test("missing nullifier_hash → 400 INVALID_INPUTS", async () => {
    const res = await request(app)
      .get(`/recover?public_key=${public_key}`)
      .set("Authorization", `Bearer ${valid_sig}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_INPUTS");
  });

  test("missing public_key → 400 INVALID_INPUTS", async () => {
    const res = await request(app)
      .get(`/recover?nullifier_hash=${nullifier_hash}`)
      .set("Authorization", `Bearer ${valid_sig}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_INPUTS");
  });

  test("missing Authorization header → 400 INVALID_INPUTS", async () => {
    const res = await request(app).get(`/recover?nullifier_hash=${nullifier_hash}&public_key=${public_key}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_INPUTS");
  });

  test("invalid signature → 401 UNAUTHORIZED", async () => {
    const res = await request(app)
      .get(`/recover?nullifier_hash=${nullifier_hash}&public_key=${public_key}`)
      .set("Authorization", `Bearer ${valid_sig}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("UNAUTHORIZED");
  });
});

describe("JWT claims", () => {
  beforeAll(async () => {
    await initJwtSigner();
  });

  test("signed JWT contains correct claims", async () => {
    const nullifier_hash = "ab".repeat(32);
    const region_id = "cd".repeat(16);

    const { jwt, expires_at } = await signJwt({
      nullifier_hash,
      region_id,
      region_name: "Test Region",
      solana_slot: "12345",
      expires_in_seconds: 3600,
    });

    // Decode payload without verifying signature (we trust our own signer)
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());

    expect(payload.sub).toBe(nullifier_hash);
    expect(payload.region_id).toBe(region_id);
    expect(payload.region_name).toBe("Test Region");
    expect(payload.zk_verified).toBe(true);
    expect(payload.solana_slot).toBe("12345");
    expect(payload.exp).toBe(expires_at);
    expect(typeof payload.iat).toBe("number");
    expect(payload.exp - payload.iat).toBe(3600);
  });

  test("expires_in_seconds capped at 3600", async () => {
    const { jwt } = await signJwt({
      nullifier_hash: "ab".repeat(32),
      region_id: "cd".repeat(16),
      region_name: "Test",
      solana_slot: "1",
      expires_in_seconds: 9999,
    });

    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
    expect(payload.exp - payload.iat).toBe(3600);
  });

  test("GET /jwks contains kid matching JWT header", async () => {
    const { jwt } = await signJwt({
      nullifier_hash: "ab".repeat(32),
      region_id: "cd".repeat(16),
      region_name: "Test",
      solana_slot: "1",
      expires_in_seconds: 3600,
    });

    const header = JSON.parse(Buffer.from(jwt.split(".")[0], "base64url").toString());
    const res = await request(app).get("/jwks");
    const kids = res.body.keys.map((k: { kid: string }) => k.kid);
    expect(kids).toContain(header.kid);
  });
});

describe("GET /recover — valid Ed25519 signature", () => {
  test("valid signature but nullifier not on-chain → 503 SERVICE_UNAVAILABLE", async () => {
    // Generate a real Ed25519 keypair
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");

    const nullifier_hash_bytes = crypto.randomBytes(32);
    const nullifier_hash = nullifier_hash_bytes.toString("hex");
    const public_key = Buffer.from(publicKey.export({ type: "spki", format: "der" })).subarray(12).toString("hex");
    const signature = crypto.sign(null, nullifier_hash_bytes, privateKey).toString("hex");

    const res = await request(app)
      .get(`/recover?nullifier_hash=${nullifier_hash}&public_key=${public_key}`)
      .set("Authorization", `Bearer ${signature}`);

    // Signature is valid, but nullifier doesn't exist on-chain → Solana unavailable or 404
    expect([503, 404]).toContain(res.status);
  });
});

describe("Rate limiting", () => {
  test("POST /verify → 429 after exceeding limit", async () => {
    // Fresh app instance so previous tests don't consume this limiter's quota
    const freshApp = createApp();
    const responses = await Promise.all(
      Array.from({ length: 11 }, () =>
        request(freshApp).post("/verify").send(VALID_BODY),
      ),
    );
    const limited = responses.filter((r) => r.status === 429);
    expect(limited.length).toBeGreaterThan(0);
    expect(limited[0].body.error).toBe("RATE_LIMITED");
  });
});
