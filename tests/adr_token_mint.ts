import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount
} from "@solana/spl-token";
import { AdrTokenMint } from "../target/types/adr_token_mint";

describe("adr_token_mint", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.AdrTokenMint as Program<AdrTokenMint>;
  const wallet = program.provider.wallet;
  const connection = anchor.getProvider().connection;

  // Constantes para testes
  const COLLECTION_NAME = "Minha Coleção NFT";
  const COLLECTION_SYMBOL = "MNFT";
  const COLLECTION_URI = "https://arweave.net/sua-coleção-metadata";
  const NFT_NAME = "Meu NFT #1";
  const NFT_SYMBOL = "NFT1";
  const NFT_URI = "https://arweave.net/seu-nft-metadata";
  const PAYMENT_AMOUNT = 2000; // 2000 tokens para pagamento

  // Keypairs para as contas
  let collectionMint: Keypair;
  let collectionMetadata: Keypair;
  let nftMint: Keypair;
  let nftMetadata: Keypair;
  let configAccount: Keypair;
  let paymentTokenMint: Keypair;
  let nftMintWithPayment: Keypair;
  let nftMetadataWithPayment: Keypair;
  
  let collectionTokenAccount: PublicKey;
  let nftTokenAccount: PublicKey;
  let nftWithPaymentTokenAccount: PublicKey;
  let payerPaymentTokenAccount: PublicKey;

  before(async () => {
    // Gerar keypairs para as contas
    collectionMint = Keypair.generate();
    collectionMetadata = Keypair.generate();
    nftMint = Keypair.generate();
    nftMetadata = Keypair.generate();
    configAccount = Keypair.generate();
    paymentTokenMint = Keypair.generate();
    nftMintWithPayment = Keypair.generate();
    nftMetadataWithPayment = Keypair.generate();
    
    // Derivar contas de token associadas
    collectionTokenAccount = getAssociatedTokenAddressSync(
      collectionMint.publicKey,
      wallet.publicKey
    );
    
    nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      wallet.publicKey
    );
    
    nftWithPaymentTokenAccount = getAssociatedTokenAddressSync(
      nftMintWithPayment.publicKey,
      wallet.publicKey
    );

    // Criar o token de pagamento
    await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      wallet.publicKey,
      9, // 9 decimais
      paymentTokenMint
    );
    
    // Criar conta de token de pagamento para o pagador
    const paymentTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      paymentTokenMint.publicKey,
      wallet.publicKey
    );
    
    payerPaymentTokenAccount = paymentTokenAccount.address;
    
    // Cunhar 10000 tokens de pagamento para o pagador
    await mintTo(
      connection,
      wallet.payer,
      paymentTokenMint.publicKey,
      paymentTokenAccount.address,
      wallet.publicKey,
      10000 * 10**9 // 10000 tokens com 9 decimais
    );
  });

  it("Inicializa a coleção de NFTs", async () => {
    try {
      // Inicializa a coleção
      const tx = await program.methods
        .initializeCollection(COLLECTION_NAME, COLLECTION_SYMBOL, COLLECTION_URI)
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
        } as any)
        .signers([collectionMint, collectionMetadata, configAccount])
        .rpc({commitment: 'confirmed'});

      console.log("Coleção inicializada com sucesso:", tx);

      // Verificar os metadados
      const metadata = await program.account.nftMetadata.fetch(collectionMetadata.publicKey);
      console.log("Metadados da coleção:", metadata);

      // Verificar a configuração
      const config = await program.account.configAccount.fetch(configAccount.publicKey);
      console.log("Configuração:", config);
    } catch (e) {
      console.error("Erro ao inicializar a coleção:", e);
      throw e;
    }
  });

  it("Minta um NFT na coleção", async () => {
    try {
      // Mintar um NFT
      const tx = await program.methods
        .mintNft(NFT_NAME, NFT_SYMBOL, NFT_URI)
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount,
          collectionMetadata: collectionMetadata.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        } as any)
        .signers([nftMint, nftMetadata])
        .rpc({commitment: 'confirmed'});

      console.log("NFT mintado com sucesso:", tx);

      // Verificar os metadados do NFT
      const metadata = await program.account.nftMetadata.fetch(nftMetadata.publicKey);
      console.log("Metadados do NFT:", metadata);
    } catch (e) {
      console.error("Erro ao mintar NFT:", e);
      throw e;
    }
  });

  it("Define um token de pagamento", async () => {
    try {
      // Definir o token de pagamento
      const tx = await program.methods
        .setPaymentToken(paymentTokenMint.publicKey)
        .accounts({
          admin: wallet.publicKey,
          config: configAccount.publicKey,
        })
        .rpc({commitment: 'confirmed'});

      console.log("Token de pagamento definido com sucesso:", tx);

      // Verificar a configuração atualizada
      const config = await program.account.configAccount.fetch(configAccount.publicKey);
      console.log("Configuração atualizada:", config);
    } catch (e) {
      console.error("Erro ao definir token de pagamento:", e);
      throw e;
    }
  });

  it("Minta um NFT com pagamento e queima de tokens", async () => {
    try {
      // Verificar saldo antes do pagamento
      const accountInfoBefore = await connection.getTokenAccountBalance(payerPaymentTokenAccount);
      console.log("Saldo antes do pagamento:", accountInfoBefore.value.uiAmount);
      
      // Mintar NFT com pagamento
      const tx = await program.methods
        .mintNftWithPayment(
          "NFT Pago #1", 
          "PNFT1",
          "https://arweave.net/seu-nft-pago-metadata",
          new anchor.BN(PAYMENT_AMOUNT * 10**9) // Converter para a quantidade com decimais
        )
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMintWithPayment.publicKey,
          nftMetadata: nftMetadataWithPayment.publicKey,
          nftTokenAccount: nftWithPaymentTokenAccount,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: paymentTokenMint.publicKey,
          payerPaymentTokenAccount: payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        } as any)
        .signers([nftMintWithPayment, nftMetadataWithPayment])
        .rpc({commitment: 'confirmed'});
      
      console.log("NFT mintado com pagamento com sucesso:", tx);
      
      // Verificar os metadados do NFT
      const metadata = await program.account.nftMetadata.fetch(nftMetadataWithPayment.publicKey);
      console.log("Metadados do NFT pago:", metadata);
      
      // Verificar saldo após o pagamento
      const accountInfoAfter = await connection.getTokenAccountBalance(payerPaymentTokenAccount);
      console.log("Saldo após o pagamento:", accountInfoAfter.value.uiAmount);
      console.log("Tokens queimados:", accountInfoBefore.value.uiAmount - accountInfoAfter.value.uiAmount);
    } catch (e) {
      console.error("Erro ao mintar NFT com pagamento:", e);
      throw e;
    }
  });
});
