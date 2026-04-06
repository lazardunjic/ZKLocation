import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Zklocation } from "../target/types/zklocation";
import { assert } from "chai";
import crypto from "crypto";

describe("zklocation", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Zklocation as Program<Zklocation>;

  function regionPda(regionId: Buffer) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("region"), regionId],
      program.programId
    )[0];
  }

  function nullifierPda(nullifierHash: Buffer) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("nullifier"), nullifierHash],
      program.programId
    )[0];
  }

  function whitelistPda(authority: anchor.web3.PublicKey) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("whitelist"), authority.toBuffer()],
      program.programId
    )[0];
  }

  const admin = provider.wallet;
  const regionId = Array.from(crypto.randomBytes(16));
  const regionIdBuf = Buffer.from(regionId);

  it("approves authority", async () => {
    const wlPda = whitelistPda(admin.publicKey);

    const existing = await provider.connection.getAccountInfo(wlPda);
    if (existing) {
      console.log("Whitelist entry vec postoji, preskacemo");
      return;
    }

    await program.methods
      .approveAuthority(admin.publicKey, "Test authority")
      .accountsPartial({
        whitelistEntry: wlPda,
        programAdmin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const entry = await program.account.whitelistEntry.fetch(wlPda);
    assert.ok(entry.authority.equals(admin.publicKey));
    assert.equal(entry.label, "Test authority");
  });

  it("creates a region", async () => {
    const pda = regionPda(regionIdBuf);
    const wlPda = whitelistPda(admin.publicKey);

    await program.methods
      .submitRegion(
        regionId,
        "Beograd centar",
        new anchor.BN(44_787_000),
        new anchor.BN(20_457_000),
        1000
      )
      .accountsPartial({
        regionPda: pda,
        whitelistEntry: wlPda,
        authority: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const account = await program.account.regionAccount.fetch(pda);
    assert.equal(account.name, "Beograd centar");
    assert.equal(account.radiusM, 1000);
    console.log("Region PDA:", pda.toBase58());
  });

  it("registers a nullifier", async () => {
    const nullifierHash = Array.from(crypto.randomBytes(32));
    const nullHashBuf = Buffer.from(nullifierHash);
    const nPda = nullifierPda(nullHashBuf);
    const rPda = regionPda(regionIdBuf);
    const slot = await provider.connection.getSlot();

    await program.methods
      .registerNullifier(nullifierHash, regionId, new anchor.BN(slot))
      .accountsPartial({
        nullifierPda: nPda,
        regionPda: rPda,
        backendAuthority: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const account = await program.account.nullifierAccount.fetch(nPda);
    assert.deepEqual(account.nullifierHash, nullifierHash);
  });

  it("rejects replay — same nullifier fails", async () => {
    const nullifierHash = Array.from(crypto.randomBytes(32));
    const nullHashBuf = Buffer.from(nullifierHash);
    const nPda = nullifierPda(nullHashBuf);
    const rPda = regionPda(regionIdBuf);
    const slot = await provider.connection.getSlot();

    const send = () =>
      program.methods
        .registerNullifier(nullifierHash, regionId, new anchor.BN(slot))
        .accountsPartial({
          nullifierPda: nPda,
          regionPda: rPda,
          backendAuthority: admin.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

    await send();

    const fakeRegionId = Array.from(crypto.randomBytes(16));
    try {
      await program.methods
        .registerNullifier(nullifierHash, fakeRegionId, new anchor.BN(slot))
        .accountsPartial({
          nullifierPda: nPda,
          regionPda: rPda,
          backendAuthority: admin.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Trebalo je da baci gresku");
    } catch (e: any) {
      if (e.message === "Trebalo je da baci gresku") throw e;
      assert.ok(true);
    }
  });

  it("rejects stale slot", async () => {
    const nullifierHash = Array.from(crypto.randomBytes(32));
    const nullHashBuf = Buffer.from(nullifierHash);
    const nPda = nullifierPda(nullHashBuf);
    const rPda = regionPda(regionIdBuf);

    try {
      await program.methods
        .registerNullifier(nullifierHash, regionId, new anchor.BN(1))
        .accountsPartial({
          nullifierPda: nPda,
          regionPda: rPda,
          backendAuthority: admin.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Trebalo je da baci gresku");
    } catch (e: any) {
      if (e.message === "Trebalo je da baci gresku") throw e;
      assert.ok(true);
    }
  });

  it("updates region name", async () => {
    const pda = regionPda(regionIdBuf);

    await program.methods
      .updateRegion("Beograd - novi naziv", null, null, null)
      .accountsPartial({
        regionPda: pda,
        authority: admin.publicKey,
      })
      .rpc();

    const account = await program.account.regionAccount.fetch(pda);
    assert.equal(account.name, "Beograd - novi naziv");
  });

  it("deletes a region", async () => {
    const pda = regionPda(regionIdBuf);

    await program.methods
      .deleteRegion()
      .accountsPartial({
        regionPda: pda,
        authority: admin.publicKey,
      })
      .rpc();

    try {
      await program.account.regionAccount.fetch(pda);
      assert.fail("Account bi trebao biti obrisan");
    } catch (e: any) {
      assert.ok(e.message.includes("Account does not exist"));
    }
  });
});