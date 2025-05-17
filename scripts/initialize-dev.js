const anchor = require("@coral-xyz/anchor");
const { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Connection } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createMint } = require("@solana/spl-token");
const fs = require('fs');

// Configurações
const COLLECTION_NAME = "ADR Collection";
const COLLECTION_SYMBOL = "ADRC";
const COLLECTION_URI = "https://arweave.net/sua-colecao-metadata";
const REWARD_RATE = 1000; // 10%

async function main() {
  try {
    // Carregar o keypair da wallet-dev
    const walletKeypair = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8')))
    );

    // Configurar provider
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const wallet = new anchor.Wallet(walletKeypair);
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });

    anchor.setProvider(provider);

    // ID do programa já deployado
    const programId = new PublicKey("GKf6NkHokaNXcov4kgPqftFrd9QfJMcgRwaCVSWc5yTz");

    // Inicializar programa
    const idl = JSON.parse(fs.readFileSync('./target/idl/adr_token_mint.json', 'utf-8'));
    const program = new anchor.Program(idl, provider);

    console.log("Endereço do programa:", programId.toString());
    console.log("Wallet usada:", walletKeypair.publicKey.toString());

    // Gerar keypairs
    const configAccount = Keypair.generate();
    const paymentTokenMint = Keypair.generate();
    const collectionMint = Keypair.generate();
    const collectionMetadata = Keypair.generate();

    console.log("Config Account:", configAccount.publicKey.toString());
    console.log("Payment Token:", paymentTokenMint.publicKey.toString());
    console.log("Collection Mint:", collectionMint.publicKey.toString());

    // Criar o token de pagamento
    console.log("Criando o token de pagamento...");
    await createMint(
      connection,
      walletKeypair,
      walletKeypair.publicKey,
      walletKeypair.publicKey,
      9, // 9 decimais
      paymentTokenMint
    );

    // Derivar a conta de token para a coleção
    const collectionTokenAccount = getAssociatedTokenAddressSync(
      collectionMint.publicKey,
      walletKeypair.publicKey
    );

    // Inicializar a coleção
    console.log("Inicializando a coleção...");
    await program.methods
      .initializeCollection(COLLECTION_NAME, COLLECTION_SYMBOL, COLLECTION_URI)
      .accounts({
        payer: walletKeypair.publicKey,
        collectionMint: collectionMint.publicKey,
        collectionMetadata: collectionMetadata.publicKey,
        collectionTokenAccount: collectionTokenAccount,
        config: configAccount.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([configAccount, collectionMint, collectionMetadata, walletKeypair])
      .rpc();

    // Configurar o token de pagamento
    console.log("Configurando o token de pagamento...");
    await program.methods
      .setPaymentToken(paymentTokenMint.publicKey)
      .accounts({
        admin: walletKeypair.publicKey,
        config: configAccount.publicKey,
      })
      .signers([walletKeypair])
      .rpc();

    // Configurar o sistema de staking
    console.log("Configurando o sistema de staking...");
    await program.methods
      .configureStaking(true, new anchor.BN(REWARD_RATE))
      .accounts({
        admin: walletKeypair.publicKey,
        config: configAccount.publicKey,
      })
      .signers([walletKeypair])
      .rpc();

    // Salvar as informações em um arquivo para uso posterior
    const deployInfo = {
      programId: programId.toString(),
      owner: walletKeypair.publicKey.toString(),
      configAddress: configAccount.publicKey.toString(),
      paymentTokenMint: paymentTokenMint.publicKey.toString(),
      collectionMint: collectionMint.publicKey.toString(),
      collectionMetadata: collectionMetadata.publicKey.toString(),
      network: "devnet",
      privateKeys: {
        paymentTokenMint: Array.from(paymentTokenMint.secretKey),
        collectionMint: Array.from(collectionMint.secretKey),
        configAccount: Array.from(configAccount.secretKey),
        collectionMetadata: Array.from(collectionMetadata.secretKey),
      }
    };

    fs.writeFileSync('deploy-info.json', JSON.stringify(deployInfo, null, 2));
    console.log("Informações salvas em deploy-info.json");

    console.log("Inicialização concluída com sucesso!");
  } catch (err) {
    console.error("Erro durante a inicialização:", err);
    throw err;
  }
}

main().catch(console.error); 