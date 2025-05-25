const anchor = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

async function main() {
  // Configurações da coleção
  const collectionName = "ADR Collection";
  const collectionSymbol = "ADRC";
  const collectionUri = "https://arweave.net/your-metadata-uri";

  console.log("Inicializando coleção de NFTs com:");
  console.log("Nome:", collectionName);
  console.log("Símbolo:", collectionSymbol);
  console.log("URI:", collectionUri);

  try {
    // Setup da conexão com a Devnet
    const connection = new Connection(
      process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
      { commitment: 'confirmed' }
    );
    console.log("Conectado à", connection.rpcEndpoint);

    // Carregar a wallet do deploy
    const walletKeypair = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8')))
    );
    console.log("Usando wallet:", walletKeypair.publicKey.toBase58());

    // Configurar o provider
    const provider = new anchor.AnchorProvider(
      connection, 
      new anchor.Wallet(walletKeypair), 
      { commitment: 'confirmed' }
    );
    anchor.setProvider(provider);

    // Carregar o programa do workspace
    const program = anchor.workspace.AdrTokenMint;
    console.log("Programa ID:", program.programId.toBase58());

    // Gerar keypair para a mint da coleção
    const collectionMint = Keypair.generate();
    console.log("Collection Mint gerada:", collectionMint.publicKey.toBase58());

    // Criar um keypair para os metadados da coleção
    const collectionMetadata = Keypair.generate();
    console.log("Collection Metadata gerada:", collectionMetadata.publicKey.toBase58());

    // Gerar keypair para a conta de configuração
    const configAccount = Keypair.generate();
    console.log("Config Account gerada:", configAccount.publicKey.toBase58());

    // Derivar o PDA para o contador de NFTs
    const [nftCounter] = PublicKey.findProgramAddressSync(
      [Buffer.from("nft_counter")],
      program.programId
    );
    console.log("NFT Counter PDA:", nftCounter.toBase58());

    // Derivar o endereço da conta de token associada
    const [collectionTokenAccount] = PublicKey.findProgramAddressSync(
      [
        walletKeypair.publicKey.toBuffer(),
        anchor.utils.token.TOKEN_PROGRAM_ID.toBuffer(),
        collectionMint.publicKey.toBuffer()
      ],
      anchor.utils.token.ASSOCIATED_PROGRAM_ID
    );
    console.log("Collection Token Account:", collectionTokenAccount.toBase58());

    // Inicializar a coleção
    console.log("Enviando transação para inicializar a coleção...");
    const tx = await program.methods
      .initializeCollection(collectionName, collectionSymbol, collectionUri)
      .accounts({
        payer: walletKeypair.publicKey,
        collectionMint: collectionMint.publicKey,
        collectionMetadata: collectionMetadata.publicKey,
        collectionTokenAccount: collectionTokenAccount,
        nftCounter: nftCounter,
        config: configAccount.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY
      })
      .signers([collectionMint, collectionMetadata, configAccount])
      .rpc();

    console.log("Transação enviada:", tx);
    console.log(`Veja em: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    // Salvar informações no arquivo de configuração
    const configPath = path.join(__dirname, '../config/deploy-config.json');
    let config = {};
    
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    
    config = {
      ...config,
      collectionMint: collectionMint.publicKey.toBase58(),
      collectionMetadata: collectionMetadata.publicKey.toBase58(),
      collectionTokenAccount: collectionTokenAccount.toBase58(),
      nftCounter: nftCounter.toBase58(),
      configAccount: configAccount.publicKey.toBase58(),
      initTimestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("Informações da coleção salvas em config/deploy-config.json");

  } catch (error) {
    console.error("Erro ao inicializar coleção:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  }); 