import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { AdrTokenMint } from "../target/types/adr_token_mint";
import { assert } from "chai";

describe("ADR Token Burn Security Tests", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.AdrTokenMint as Program<AdrTokenMint>;
  const wallet = program.provider.wallet;
  const connection = anchor.getProvider().connection;

  // Keypairs e contas
  let configAccount: Keypair;
  let paymentTokenMint: Keypair;
  let attackerWallet: Keypair;
  let attackerTokenAccount: PublicKey;
  let payerPaymentTokenAccount: PublicKey;
  let collectionMint: Keypair;
  let collectionMetadata: Keypair;
  let collectionTokenAccount: PublicKey;

  before(async () => {
    // Gerar keypairs
    configAccount = Keypair.generate();
    paymentTokenMint = Keypair.generate();
    attackerWallet = Keypair.generate();
    collectionMint = Keypair.generate();
    collectionMetadata = Keypair.generate();

    // Airdrop SOL para a carteira do atacante
    const signature = await connection.requestAirdrop(
      attackerWallet.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(signature);

    // Criar o token de pagamento
    await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      wallet.publicKey,
      9, // 9 decimais
      paymentTokenMint
    );

    // Criar conta de token para o pagador
    const paymentTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      paymentTokenMint.publicKey,
      wallet.publicKey
    );

    payerPaymentTokenAccount = paymentTokenAccount.address;

    // Criar conta de token para o atacante
    const attackerAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      attackerWallet,
      paymentTokenMint.publicKey,
      attackerWallet.publicKey
    );

    attackerTokenAccount = attackerAccount.address;

    // Cunhar tokens para testes
    await mintTo(
      connection,
      wallet.payer,
      paymentTokenMint.publicKey,
      paymentTokenAccount.address,
      wallet.publicKey,
      20000 * 10 ** 9 // 20000 tokens com 9 decimais
    );

    // Transferir alguns tokens para o atacante
    await mintTo(
      connection,
      wallet.payer,
      paymentTokenMint.publicKey,
      attackerAccount.address,
      attackerWallet.publicKey,
      1000 * 10 ** 9 // 1000 tokens com 9 decimais
    );

    // Derivar a conta de token para a coleção
    collectionTokenAccount = getAssociatedTokenAddressSync(
      collectionMint.publicKey,
      wallet.publicKey
    );

    // Inicializar a coleção (que também cria a configuração)
    await program.methods
      .initializeCollection("Test Collection", "TEST", "https://test-uri.com")
      .accounts({
        payer: wallet.publicKey,
        collectionMint: collectionMint.publicKey,
        collectionMetadata: collectionMetadata.publicKey,
        collectionTokenAccount: collectionTokenAccount,
        config: configAccount.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      } as any)
      .signers([configAccount, collectionMint, collectionMetadata])
      .rpc();

    // Configurar o token de pagamento
    await program.methods
      .setPaymentToken(paymentTokenMint.publicKey)
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
  });

  it("Rejeita mint de NFT com pagamento zero", async () => {
    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();

    // Obter a conta de token para o NFT
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      wallet.publicKey
    );

    try {
      // Tentar mintar um NFT com pagamento zero
      await program.methods
        .mintNftWithPayment(
          "Test NFT",
          "TEST",
          "https://test-uri.com",
          new anchor.BN(0)
        )
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount: nftTokenAccount,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount: payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        } as any)
        .signers([nftMint, nftMetadata])
        .rpc();

      assert.fail("Deveria ter rejeitado mint com pagamento zero");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InvalidPaymentAmount") ||
          errorMessage.includes("Valor de pagamento inválido"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita mint com pagamento negativo", async () => {
    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();

    // Obter a conta de token para o NFT
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      wallet.publicKey
    );

    try {
      // Tentar mintar um NFT com pagamento negativo (valor grande que causa overflow)
      await program.methods
        .mintNftWithPayment(
          "Test NFT",
          "TEST",
          "https://test-uri.com",
          new anchor.BN(2 ** 64 - 1)
        )
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount: nftTokenAccount,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount: payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        } as any)
        .signers([nftMint, nftMetadata])
        .rpc();

      assert.fail("Deveria ter rejeitado mint com pagamento negativo");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InvalidPaymentAmount") ||
          errorMessage.includes("Valor de pagamento inválido") ||
          errorMessage.includes("InsufficientFunds"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita mint com saldo insuficiente", async () => {
    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();

    // Obter a conta de token para o NFT
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      wallet.publicKey
    );

    try {
      // Tentar mintar um NFT com pagamento maior que o saldo
      await program.methods
        .mintNftWithPayment(
          "Test NFT",
          "TEST",
          "https://test-uri.com",
          new anchor.BN(1000000 * 10 ** 9)
        )
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount: nftTokenAccount,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount: payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        } as any)
        .signers([nftMint, nftMetadata])
        .rpc();

      assert.fail("Deveria ter rejeitado mint com saldo insuficiente");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InsufficientFunds") ||
          errorMessage.includes("Fundos insuficientes"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita mint quando o sistema está pausado", async () => {
    // Pausar o sistema
    await program.methods
      .setEmergencyPause(true, "Teste de segurança")
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();

    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();

    // Obter a conta de token para o NFT
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      wallet.publicKey
    );

    try {
      // Tentar mintar um NFT com o sistema pausado
      await program.methods
        .mintNftWithPayment(
          "Test NFT",
          "TEST",
          "https://test-uri.com",
          new anchor.BN(100 * 10 ** 9)
        )
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount: nftTokenAccount,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount: payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        } as any)
        .signers([nftMint, nftMetadata])
        .rpc();

      assert.fail("Deveria ter rejeitado mint com sistema pausado");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("SystemPaused") ||
          errorMessage.includes("O sistema está pausado para emergência"),
        "Erro diferente do esperado: " + errorMessage
      );
    }

    // Despausar o sistema para os próximos testes
    await program.methods
      .setEmergencyPause(false, "Retomando operações")
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
  });

  it("Rejeita mint com carteira não autorizada", async () => {
    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();

    // Obter a conta de token para o NFT
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      attackerWallet.publicKey // Usando a carteira do atacante
    );

    try {
      // Tentar mintar um NFT com a carteira do atacante
      await program.methods
        .mintNftWithPayment(
          "Test NFT",
          "TEST",
          "https://test-uri.com",
          new anchor.BN(100 * 10 ** 9)
        )
        .accounts({
          payer: attackerWallet.publicKey, // Usando a carteira do atacante
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount: nftTokenAccount,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount: attackerTokenAccount, // Conta do atacante
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        } as any)
        .signers([attackerWallet, nftMint, nftMetadata]) // Incluir a carteira do atacante como signer
        .rpc();

      assert.fail("Deveria ter rejeitado mint com carteira não autorizada");
    } catch (e) {
      // Verificar se o erro é de autorização ou de saldo insuficiente
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("Unauthorized") ||
          errorMessage.includes("InsufficientFunds") ||
          errorMessage.includes("Você não está autorizado") ||
          errorMessage.includes("Fundos insuficientes"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita configurações de staking por não-admin", async () => {
    try {
      // Tentar configurar staking com a carteira do atacante
      await program.methods
        .configureStaking(true, new anchor.BN(2000)) // 20%
        .accounts({
          admin: attackerWallet.publicKey, // Usando a carteira do atacante
          config: configAccount.publicKey,
        })
        .signers([attackerWallet])
        .rpc();

      assert.fail("Deveria ter rejeitado configuração por não-admin");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("Unauthorized") ||
          errorMessage.includes("Você não está autorizado"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita atualização de admin por não-admin", async () => {
    try {
      // Tentar atualizar o admin com a carteira do atacante
      await program.methods
        .updateAdmin(attackerWallet.publicKey)
        .accounts({
          currentAdmin: attackerWallet.publicKey, // Usando a carteira do atacante
          config: configAccount.publicKey,
        })
        .signers([attackerWallet])
        .rpc();

      assert.fail("Deveria ter rejeitado atualização de admin por não-admin");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("Unauthorized") ||
          errorMessage.includes("Você não está autorizado"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita pausa de emergência por não-admin", async () => {
    try {
      // Tentar pausar o sistema com a carteira do atacante
      await program.methods
        .setEmergencyPause(true, "Tentativa de ataque")
        .accounts({
          admin: attackerWallet.publicKey, // Usando a carteira do atacante
          config: configAccount.publicKey,
        })
        .signers([attackerWallet])
        .rpc();

      assert.fail("Deveria ter rejeitado pausa de emergência por não-admin");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("Unauthorized") ||
          errorMessage.includes("Você não está autorizado"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita atualização de limite máximo de stake por não-admin", async () => {
    try {
      // Tentar atualizar o limite máximo com a carteira do atacante
      await program.methods
        .updateMaxStakeAmount(new anchor.BN(1000000 * 10 ** 9)) // 1 milhão de tokens
        .accounts({
          admin: attackerWallet.publicKey, // Usando a carteira do atacante
          config: configAccount.publicKey,
        })
        .signers([attackerWallet])
        .rpc();

      assert.fail("Deveria ter rejeitado atualização de limite por não-admin");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("Unauthorized") ||
          errorMessage.includes("Você não está autorizado"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });
});
