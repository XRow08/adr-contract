import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AdrTokenMint } from "../target/types/adr_token_mint";
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createMint,
  mintTo,
  getAccount,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
import { assert } from "chai";

describe("Basic Staking Test", () => {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.AdrTokenMint as Program<AdrTokenMint>;

  // Test accounts
  const stakeAccount = Keypair.generate();
  const configAccount = Keypair.generate();
  const collectionMint = Keypair.generate();
  const collectionMetadata = Keypair.generate();
  let paymentTokenMint: PublicKey;
  let userTokenAccount: PublicKey;
  let stakeTokenAccount: PublicKey;
  let stakeAuthority: PublicKey;
  let stakeAuthorityBump: number;
  let collectionTokenAccount: PublicKey;
  let nftCounter: PublicKey;

  before(async () => {
    try {
      // Find PDAs
      [stakeAuthority, stakeAuthorityBump] = await PublicKey.findProgramAddress(
        [Buffer.from("stake_authority")],
        program.programId
      );

      [nftCounter] = await PublicKey.findProgramAddress(
        [Buffer.from("nft_counter")],
        program.programId
      );

      // Create payment token mint
      paymentTokenMint = await createMint(
        provider.connection,
        provider.wallet.payer,
        provider.wallet.publicKey,
        null,
        9
      );

      // Create user token account
      userTokenAccount = await getAssociatedTokenAddress(
        paymentTokenMint,
        provider.wallet.publicKey
      );

      // Create collection token account
      collectionTokenAccount = await getAssociatedTokenAddress(
        collectionMint.publicKey,
        provider.wallet.publicKey
      );

      // Create stake token account
      stakeTokenAccount = await getAssociatedTokenAddress(
        paymentTokenMint,
        stakeAuthority,
        true
      );

      // Create all token accounts
      await createAssociatedTokenAccount(
        provider.connection,
        provider.wallet.payer,
        paymentTokenMint,
        provider.wallet.publicKey
      );

      // Mint initial tokens to user
      await mintTo(
        provider.connection,
        provider.wallet.payer,
        paymentTokenMint,
        userTokenAccount,
        provider.wallet.publicKey,
        10_000_000_000 // 10 tokens
      );

    } catch (error) {
      console.error("Failed to setup test accounts:", error);
      throw error;
    }
  });

  it("Initialize collection and staking", async () => {
    try {
      // Initialize collection and config
      await program.methods
        .initializeCollection("Test Collection", "TEST", "https://test.uri")
        .accounts({
          payer: provider.wallet.publicKey,
          collectionMint: collectionMint.publicKey,
          collectionMetadata: collectionMetadata.publicKey,
          collectionTokenAccount: collectionTokenAccount,
          config: configAccount.publicKey,
          nftCounter,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([collectionMint, collectionMetadata, configAccount])
        .rpc();

      // Configure payment token
      await program.methods
        .setPaymentToken(paymentTokenMint)
        .accounts({
          admin: provider.wallet.publicKey,
          config: configAccount.publicKey,
        })
        .rpc();

      // Enable staking
      await program.methods
        .configureStaking(true, new anchor.BN(1000)) // 10% reward rate
        .accounts({
          admin: provider.wallet.publicKey,
          config: configAccount.publicKey,
        })
        .rpc();

      // Verify setup
      const configInfo = await program.account.configAccount.fetch(configAccount.publicKey);
      assert.ok(configInfo.stakingEnabled);
      assert.ok(configInfo.stakingRewardRate.eq(new anchor.BN(1000)));
      assert.ok(configInfo.paymentTokenMint.equals(paymentTokenMint));

      console.log("Collection and staking initialized successfully");
    } catch (error) {
      console.error("Failed to initialize collection and staking:", error);
      throw error;
    }
  });

  it("Stake tokens", async () => {
    try {
      const stakeAmount = new anchor.BN(1_000_000_000); // 1 token

      // Get initial balances
      const initialUserBalance = await getAccount(provider.connection, userTokenAccount);
      console.log("Initial user balance:", initialUserBalance.amount.toString());

      // Create stake account
      await program.methods
        .stakeTokens(stakeAmount, { days7: {} })
        .accounts({
          staker: provider.wallet.publicKey,
          tokenMint: paymentTokenMint,
          stakerTokenAccount: userTokenAccount,
          stakeTokenAccount,
          stakeAuthority,
          stakeAccount: stakeAccount.publicKey,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([stakeAccount])
        .rpc();

      // Verify stake
      const stakeAccountInfo = await program.account.stakeAccount.fetch(stakeAccount.publicKey);
      assert.ok(stakeAccountInfo.owner.equals(provider.wallet.publicKey));
      assert.ok(stakeAccountInfo.amount.eq(stakeAmount));
      assert.ok(!stakeAccountInfo.claimed);

      // Check balances
      const finalUserBalance = await getAccount(provider.connection, userTokenAccount);
      const stakeTokenAccountInfo = await getAccount(provider.connection, stakeTokenAccount);

      console.log("Final user balance:", finalUserBalance.amount.toString());
      console.log("Stake account balance:", stakeTokenAccountInfo.amount.toString());

      // Verify balance changes
      assert.ok(
        BigInt(initialUserBalance.amount.toString()) - BigInt(finalUserBalance.amount.toString()) === BigInt(stakeAmount.toString()),
        "User balance should decrease by stake amount"
      );
      assert.ok(
        BigInt(stakeTokenAccountInfo.amount.toString()) === BigInt(stakeAmount.toString()),
        "Stake account should receive stake amount"
      );

      console.log("Staking completed successfully");
    } catch (error) {
      console.error("Failed to stake tokens:", error);
      throw error;
    }
  });
}); 