import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Zklocation } from "../target/types/zklocation";
import crypto from "crypto";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Zklocation as Program<Zklocation>;

  const regions = [
    {
      name: "Beograd centar",
      lat: 44_787_000,
      lon: 20_457_000,
      radius: 5000,
    },
    {
      name: "Novi Sad",
      lat: 45_267_136,
      lon: 19_833_549,
      radius: 5000,
    },
  ];

  const authority = provider.wallet.publicKey;

  const [whitelistPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("whitelist"), authority.toBuffer()],
    program.programId
  );

  // Whitelist authority if not already approved
  const existing = await provider.connection.getAccountInfo(whitelistPda);
  if (!existing) {
    console.log("Approving authority...");
    await program.methods
      .approveAuthority(authority, "localnet-init")
      .accountsPartial({
        whitelistEntry: whitelistPda,
        programAdmin: authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("Authority approved.");
  }

  for (const region of regions) {
    // Deterministicki ID — hash od naziva, uvek isti za isti region.
    // Sprecava duplikate ako se skript pokrene vise puta.
    const regionId = Array.from(crypto.createHash("sha256").update(region.name).digest().subarray(0, 16));
    const regionIdBuf = Buffer.from(regionId);

    const [regionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("region"), regionIdBuf],
      program.programId
    );

    console.log(`Kreiram region: ${region.name}...`);

    await program.methods
      .submitRegion(
        regionId,
        region.name,
        new anchor.BN(region.lat),
        new anchor.BN(region.lon),
        region.radius
      )
      .accountsPartial({
        regionPda,
        whitelistEntry: whitelistPda,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log(`${region.name} PDA: ${regionPda.toBase58()}`);
    console.log(`Region ID: ${Buffer.from(regionId).toString("hex")}`);
    console.log("---");
  }

  console.log("Inicijalizacija gotova!");
}

main().catch(console.error);