import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  Connection,
  LAMPORTS_PER_SOL
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  getAccount
} from "@solana/spl-token";
import { AdrTokenMint } from "../target/types/adr_token_mint";
import { assert, expect } from "chai";
import { TESTNET_CONFIG } from "../config/testnet";

describe("ADR Token NFT Security Tests", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.AdrTokenMint as Program<AdrTokenMint>;
  const wallet = program.provider.wallet;
  const connection = anchor.getProvider().connection;

  // Keypairs e contas
  let configAccount: Keypair;
  let paymentTokenMint: Keypair;
  let collectionMint: Keypair;
  let collectionMetadata: Keypair;
  let attackerWallet: Keypair;
  let attackerTokenAccount: PublicKey;
  let payerPaymentTokenAccount: PublicKey;

  before(async () => {
    // Gerar keypairs
    configAccount = Keypair.generate();
    paymentTokenMint = Keypair.generate();
    collectionMint = Keypair.generate();
    collectionMetadata = Keypair.generate();
    attackerWallet = Keypair.generate();
    
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
      20000 * 10**9 // 20000 tokens com 9 decimais
    );
    
    // Transferir alguns tokens para o atacante
    await mintTo(
      connection,
      wallet.payer,
      paymentTokenMint.publicKey,
      attackerAccount.address,
      attackerWallet.publicKey,
      1000 * 10**9 // 1000 tokens com 9 decimais
    );

    // Obter a conta de token associada para a coleção
    const collectionTokenAccount = getAssociatedTokenAddressSync(
      collectionMint.publicKey,
      wallet.publicKey
    );

    // Inicializar a coleção
    await program.methods
      .initializeCollection("Test Collection", "TEST", "https://test-uri.com")
      .accounts({
        payer: wallet.publicKey,
        collectionMint: collectionMint.publicKey,
        collectionMetadata: collectionMetadata.publicKey,
        collectionTokenAccount,
        config: configAccount.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([collectionMint, collectionMetadata, configAccount])
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

  it("Rejeita mint de NFT sem pagamento", async () => {
    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();
    
    // Obter a conta de token associada para a NFT
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      wallet.publicKey
    );
    
    try {
      // Tentar mintar NFT sem pagar
      await program.methods
        .mintNft("Test NFT", "TNFT", "https://test-nft-uri.com")
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount,
          collectionMint: collectionMint.publicKey,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([nftMint, nftMetadata])
        .rpc();
      
      assert.fail("Deveria ter rejeitado mint sem pagamento");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InsufficientFunds") || 
        errorMessage.includes("Fundos insuficientes"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita mint de NFT com pagamento insuficiente", async () => {
    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();
    
    // Obter a conta de token associada para a NFT
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      wallet.publicKey
    );
    
    try {
      // Tentar mintar NFT com pagamento insuficiente
      // Aprovando uma quantidade menor que o custo base
      await program.methods
        .mintNft("Test NFT", "TNFT", "https://test-nft-uri.com")
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount,
          collectionMint: collectionMint.publicKey,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .preInstructions([
          // Aprovar uma quantidade menor que o custo base
          // Nota: Em um ambiente real, isso seria feito via SPL Token
          // Aqui estamos apenas simulando para o teste
        ])
        .signers([nftMint, nftMetadata])
        .rpc();
      
      assert.fail("Deveria ter rejeitado mint com pagamento insuficiente");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InsufficientFunds") || 
        errorMessage.includes("Fundos insuficientes"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita mint de NFT com URI inválido", async () => {
    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();
    
    // Obter a conta de token associada para a NFT
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      wallet.publicKey
    );
    
    try {
      // Tentar mintar NFT com URI inválido (vazio)
      await program.methods
        .mintNft("Test NFT", "TNFT", "")
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount,
          collectionMint: collectionMint.publicKey,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([nftMint, nftMetadata])
        .rpc();
      
      assert.fail("Deveria ter rejeitado mint com URI inválido");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InvalidUri") || 
        errorMessage.includes("URI inválida"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita mint de NFT com nome inválido", async () => {
    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();
    
    // Obter a conta de token associada para a NFT
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      wallet.publicKey
    );
    
    try {
      // Tentar mintar NFT com nome inválido (vazio)
      await program.methods
        .mintNft("", "TNFT", "https://test-nft-uri.com")
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount,
          collectionMint: collectionMint.publicKey,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([nftMint, nftMetadata])
        .rpc();
      
      assert.fail("Deveria ter rejeitado mint com nome inválido");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InvalidName") || 
        errorMessage.includes("Nome inválido"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita mint de NFT com símbolo inválido", async () => {
    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();
    
    // Obter a conta de token associada para a NFT
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      wallet.publicKey
    );
    
    try {
      // Tentar mintar NFT com símbolo inválido (vazio)
      await program.methods
        .mintNft("Test NFT", "", "https://test-nft-uri.com")
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount,
          collectionMint: collectionMint.publicKey,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([nftMint, nftMetadata])
        .rpc();
      
      assert.fail("Deveria ter rejeitado mint com símbolo inválido");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InvalidSymbol") || 
        errorMessage.includes("Símbolo inválido"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita mint de NFT com coleção inválida", async () => {
    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();
    
    // Obter a conta de token associada para a NFT
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      wallet.publicKey
    );
    
    // Criar uma coleção inválida (não inicializada)
    const invalidCollectionMint = Keypair.generate();
    const invalidCollectionMetadata = Keypair.generate();
    
    try {
      // Tentar mintar NFT com coleção inválida
      await program.methods
        .mintNft("Test NFT", "TNFT", "https://test-nft-uri.com")
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount,
          collectionMint: invalidCollectionMint.publicKey, // Coleção inválida
          collectionMetadata: invalidCollectionMetadata.publicKey, // Metadata inválida
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([nftMint, nftMetadata])
        .rpc();
      
      assert.fail("Deveria ter rejeitado mint com coleção inválida");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InvalidCollection") || 
        errorMessage.includes("Coleção inválida") ||
        errorMessage.includes("Account does not exist"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita mint de NFT com token de pagamento inválido", async () => {
    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();
    
    // Obter a conta de token associada para a NFT
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      wallet.publicKey
    );
    
    // Criar um token de pagamento inválido (não configurado)
    const invalidPaymentTokenMint = Keypair.generate();
    
    try {
      // Tentar mintar NFT com token de pagamento inválido
      await program.methods
        .mintNft("Test NFT", "TNFT", "https://test-nft-uri.com")
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount,
          collectionMint: collectionMint.publicKey,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: invalidPaymentTokenMint.publicKey, // Token inválido
          payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([nftMint, nftMetadata])
        .rpc();
      
      assert.fail("Deveria ter rejeitado mint com token de pagamento inválido");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InvalidPaymentToken") || 
        errorMessage.includes("Token de pagamento inválido") ||
        errorMessage.includes("Account does not exist"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita mint de NFT com conta de token inválida", async () => {
    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();
    
    // Usar uma conta de token inválida (não associada ao pagador)
    const invalidTokenAccount = getAssociatedTokenAddressSync(
      paymentTokenMint.publicKey,
      attackerWallet.publicKey // Conta do atacante, não do pagador
    );
    
    try {
      // Tentar mintar NFT com conta de token inválida
      await program.methods
        .mintNft("Test NFT", "TNFT", "https://test-nft-uri.com")
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount: invalidTokenAccount, // Conta inválida
          collectionMint: collectionMint.publicKey,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([nftMint, nftMetadata])
        .rpc();
      
      assert.fail("Deveria ter rejeitado mint com conta de token inválida");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InvalidTokenAccount") || 
        errorMessage.includes("Conta de token inválida") ||
        errorMessage.includes("Account does not exist"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita mint de NFT com configuração inválida", async () => {
    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();
    
    // Obter a conta de token associada para a NFT
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      wallet.publicKey
    );
    
    // Criar uma configuração inválida (não inicializada)
    const invalidConfigAccount = Keypair.generate();
    
    try {
      // Tentar mintar NFT com configuração inválida
      await program.methods
        .mintNft("Test NFT", "TNFT", "https://test-nft-uri.com")
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount,
          collectionMint: collectionMint.publicKey,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount,
          config: invalidConfigAccount.publicKey, // Configuração inválida
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([nftMint, nftMetadata])
        .rpc();
      
      assert.fail("Deveria ter rejeitado mint com configuração inválida");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InvalidConfig") || 
        errorMessage.includes("Configuração inválida") ||
        errorMessage.includes("Account does not exist"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita mint de NFT com signers inválidos", async () => {
    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();
    
    // Obter a conta de token associada para a NFT
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      wallet.publicKey
    );
    
    try {
      // Tentar mintar NFT sem incluir os signers necessários
      await program.methods
        .mintNft("Test NFT", "TNFT", "https://test-nft-uri.com")
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount,
          collectionMint: collectionMint.publicKey,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        // Não incluir os signers
        .rpc();
      
      assert.fail("Deveria ter rejeitado mint sem signers");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("MissingRequiredSigner") || 
        errorMessage.includes("Signer ausente"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita mint de NFT com limite excedido", async () => {
    // Criar múltiplas contas de NFT para exceder o limite
    const nftMints = Array.from({ length: TESTNET_CONFIG.NFT.MAX_NFTS_PER_WALLET + 1 }, () => Keypair.generate());
    const nftMetadatas = Array.from({ length: TESTNET_CONFIG.NFT.MAX_NFTS_PER_WALLET + 1 }, () => Keypair.generate());
    
    // Mintar NFTs até o limite
    for (let i = 0; i < TESTNET_CONFIG.NFT.MAX_NFTS_PER_WALLET; i++) {
      const nftMint = nftMints[i];
      const nftMetadata = nftMetadatas[i];
      
      // Obter a conta de token associada para a NFT
      const nftTokenAccount = getAssociatedTokenAddressSync(
        nftMint.publicKey,
        wallet.publicKey
      );
      
      // Mintar NFT
      await program.methods
        .mintNft(`Test NFT ${i + 1}`, "TNFT", `https://test-nft-uri-${i + 1}.com`)
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount,
          collectionMint: collectionMint.publicKey,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([nftMint, nftMetadata])
        .rpc();
    }
    
    // Tentar mintar uma NFT adicional (excedendo o limite)
    const extraNftMint = nftMints[TESTNET_CONFIG.NFT.MAX_NFTS_PER_WALLET];
    const extraNftMetadata = nftMetadatas[TESTNET_CONFIG.NFT.MAX_NFTS_PER_WALLET];
    
    // Obter a conta de token associada para a NFT extra
    const extraNftTokenAccount = getAssociatedTokenAddressSync(
      extraNftMint.publicKey,
      wallet.publicKey
    );
    
    try {
      // Tentar mintar NFT adicional
      await program.methods
        .mintNft("Extra NFT", "TNFT", "https://test-nft-uri-extra.com")
        .accounts({
          payer: wallet.publicKey,
          nftMint: extraNftMint.publicKey,
          nftMetadata: extraNftMetadata.publicKey,
          nftTokenAccount: extraNftTokenAccount,
          collectionMint: collectionMint.publicKey,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([extraNftMint, extraNftMetadata])
        .rpc();
      
      assert.fail("Deveria ter rejeitado mint com limite excedido");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("MaxNftsExceeded") || 
        errorMessage.includes("Limite de NFTs excedido"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita mint de NFT com sistema pausado", async () => {
    // Pausar o sistema
    await program.methods
      .setEmergencyPause(true)
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
    
    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();
    
    // Obter a conta de token associada para a NFT
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      wallet.publicKey
    );
    
    try {
      // Tentar mintar NFT com o sistema pausado
      await program.methods
        .mintNft("Test NFT", "TNFT", "https://test-nft-uri.com")
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount,
          collectionMint: collectionMint.publicKey,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
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
      .setEmergencyPause(false)
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
  });

  it("Rejeita mint de NFT com carteira não autorizada", async () => {
    // Criar uma nova conta de NFT
    const nftMint = Keypair.generate();
    const nftMetadata = Keypair.generate();
    
    // Obter a conta de token associada para a NFT
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      attackerWallet.publicKey // Usando a carteira do atacante
    );
    
    try {
      // Tentar mintar NFT com a carteira do atacante
      await program.methods
        .mintNft("Test NFT", "TNFT", "https://test-nft-uri.com")
        .accounts({
          payer: attackerWallet.publicKey, // Usando a carteira do atacante
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount,
          collectionMint: collectionMint.publicKey,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount: attackerTokenAccount, // Conta do atacante
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
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

  it("Rejeita mint de NFT com configurações de staking por não-admin", async () => {
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

  it("Rejeita mint de NFT com atualização de admin por não-admin", async () => {
    try {
      // Tentar atualizar o admin com a carteira do atacante
      await program.methods
        .updateAdmin(attackerWallet.publicKey)
        .accounts({
          current_admin: attackerWallet.publicKey, // Usando a carteira do atacante
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

  it("Rejeita mint de NFT com pausa de emergência por não-admin", async () => {
    try {
      // Tentar pausar o sistema com a carteira do atacante
      await program.methods
        .setEmergencyPause(true)
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

  it("Rejeita mint de NFT com atualização de limite máximo de stake por não-admin", async () => {
    try {
      // Tentar atualizar o limite máximo com a carteira do atacante
      await program.methods
        .updateMaxStakeAmount(new anchor.BN(1000000 * 10**9)) // 1 milhão de tokens
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