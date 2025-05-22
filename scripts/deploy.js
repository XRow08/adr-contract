const anchor = require("@coral-xyz/anchor");
const { 
  Keypair, 
  SystemProgram, 
  SYSVAR_RENT_PUBKEY,
  Connection,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} = require("@solana/spl-token");
const fs = require('fs');
const path = require('path');

// Configurações
const COLLECTION_NAME = "ADR Collection";
const COLLECTION_SYMBOL = "ADRC";
const COLLECTION_URI = "https://arweave.net/sua-colecao-metadata";
const REWARD_RATE = 1000; // 10%
const INITIAL_TOKEN_SUPPLY = 1_000_000; // 1 milhão de tokens
const MIN_SOL_BALANCE = 1; // Mínimo de 1 SOL para deploy

async function requestAirdrop(connection, publicKey) {
  try {
    const signature = await connection.requestAirdrop(publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(signature);
    console.log("Airdrop de 2 SOL solicitado com sucesso!");
  } catch (error) {
    console.error("Erro ao solicitar airdrop:", error);
    throw error;
  }
}

async function main() {
  try {
    // Configurar provider com a URL correta
    const connection = new Connection(
      process.env.ANCHOR_PROVIDER_URL || clusterApiUrl('devnet'),
      'confirmed'
    );

    // Carregar ou criar wallet
    let wallet;
    const keypairPath = process.env.ANCHOR_WALLET || path.join(require('os').homedir(), '.config/solana/id.json');
    
    try {
      const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
      wallet = new anchor.Wallet(Keypair.fromSecretKey(new Uint8Array(keypairData)));
      console.log("Wallet carregada do arquivo:", keypairPath);
    } catch (error) {
      console.log("Não foi possível carregar wallet, gerando uma nova...");
      const newKeypair = Keypair.generate();
      wallet = new anchor.Wallet(newKeypair);
      
      // Salvar a nova wallet
      const keypairData = Array.from(newKeypair.secretKey);
      fs.writeFileSync(keypairPath, JSON.stringify(keypairData));
      console.log("Nova wallet gerada e salva em:", keypairPath);
    }

    // Verificar saldo
    const balance = await connection.getBalance(wallet.publicKey);
    console.log("Saldo atual:", balance / LAMPORTS_PER_SOL, "SOL");
    
    if (balance < MIN_SOL_BALANCE * LAMPORTS_PER_SOL) {
      console.log("Saldo insuficiente. Solicitando airdrop...");
      await requestAirdrop(connection, wallet.publicKey);
      const newBalance = await connection.getBalance(wallet.publicKey);
      console.log("Novo saldo:", newBalance / LAMPORTS_PER_SOL, "SOL");
    }

    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });
    anchor.setProvider(provider);

    // Carregar o programa
    const program = anchor.workspace.AdrTokenMint;
    if (!program) {
      throw new Error("Programa não encontrado no workspace do Anchor. Execute 'anchor build' primeiro.");
    }

    // Gerar keypairs para as contas
    const configAccount = Keypair.generate();
    const paymentTokenMint = Keypair.generate();
    const collectionMint = Keypair.generate();
    const collectionMetadata = Keypair.generate();

    console.log("\nInformações do Deploy:");
    console.log("----------------------");
    console.log("Provider URL:", process.env.ANCHOR_PROVIDER_URL || clusterApiUrl('devnet'));
    console.log("Program ID:", program.programId.toString());
    console.log("Wallet:", wallet.publicKey.toString());
    console.log("Config Account:", configAccount.publicKey.toString());
    console.log("Payment Token:", paymentTokenMint.publicKey.toString());
    console.log("Collection Mint:", collectionMint.publicKey.toString());

    // Criar o token de pagamento
    console.log("Criando o token de pagamento...");
    await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      provider.wallet.publicKey,
      9, // 9 decimais
      paymentTokenMint
    );

    // Criar conta de token para o pagador
    const paymentTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      paymentTokenMint.publicKey,
      provider.wallet.publicKey
    );

    // Mintar tokens iniciais
    console.log("Mintando tokens iniciais...");
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      paymentTokenMint.publicKey,
      paymentTokenAccount.address,
      provider.wallet.publicKey,
      INITIAL_TOKEN_SUPPLY * 10 ** 9 // Convertendo para a quantidade com decimais
    );

    // Derivar a conta de token para a coleção
    const collectionTokenAccount = getAssociatedTokenAddressSync(
      collectionMint.publicKey,
      provider.wallet.publicKey
    );

    // Derivar o PDA para autoridade de staking
    const [stakeAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("stake_authority")],
      program.programId
    );

    // Inicializar a coleção
    console.log("Inicializando a coleção...");
    await program.methods
      .initializeCollection(COLLECTION_NAME, COLLECTION_SYMBOL, COLLECTION_URI)
      .accounts({
        payer: provider.wallet.publicKey,
        collectionMint: collectionMint.publicKey,
        collectionMetadata: collectionMetadata.publicKey,
        collectionTokenAccount: collectionTokenAccount,
        config: configAccount.publicKey,
        nftCounter: anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("nft_counter")],
          program.programId
        )[0],
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([collectionMint, collectionMetadata, configAccount])
      .rpc();

    // Configurar o token de pagamento
    console.log("Configurando o token de pagamento...");
    await program.methods
      .setPaymentToken(paymentTokenMint.publicKey)
      .accounts({
        admin: provider.wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();

    // Configurar o sistema de staking
    console.log("Configurando o sistema de staking...");
    await program.methods
      .configureStaking(true, new anchor.BN(REWARD_RATE))
      .accounts({
        admin: provider.wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();

    // Salvar as informações em um arquivo de configuração
    const deployInfo = {
      programId: program.programId.toString(),
      network: "devnet",
      owner: provider.wallet.publicKey.toString(),
      configAddress: configAccount.publicKey.toString(),
      paymentTokenMint: paymentTokenMint.publicKey.toString(),
      collectionMint: collectionMint.publicKey.toString(),
      collectionMetadata: collectionMetadata.publicKey.toString(),
      stakeAuthority: stakeAuthority.toString(),
      paymentTokenAccount: paymentTokenAccount.address.toString(),
      collectionTokenAccount: collectionTokenAccount.toString(),
      privateKeys: {
        paymentTokenMint: Array.from(paymentTokenMint.secretKey),
        collectionMint: Array.from(collectionMint.secretKey),
        configAccount: Array.from(configAccount.secretKey),
        collectionMetadata: Array.from(collectionMetadata.secretKey),
      },
      stakingPeriods: {
        minutes1: {
          duration: "60 seconds",
          rewardMultiplier: 1.05
        },
        minutes2: {
          duration: "120 seconds",
          rewardMultiplier: 1.10
        },
        minutes5: {
          duration: "300 seconds",
          rewardMultiplier: 1.20
        },
        minutes10: {
          duration: "600 seconds",
          rewardMultiplier: 1.40
        },
        minutes30: {
          duration: "1800 seconds",
          rewardMultiplier: 1.50
        }
      }
    };

    // Criar diretório de configuração se não existir
    const configDir = path.join(process.cwd(), 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir);
    }

    // Salvar arquivo de configuração
    const configPath = path.join(configDir, 'deploy-config.json');
    fs.writeFileSync(configPath, JSON.stringify(deployInfo, null, 2));
    console.log(`Configurações salvas em ${configPath}`);

    console.log("Deploy concluído com sucesso!");
    console.log("\nResumo do deploy:");
    console.log("----------------");
    console.log(`Program ID: ${deployInfo.programId}`);
    console.log(`Network: ${deployInfo.network}`);
    console.log(`Owner: ${deployInfo.owner}`);
    console.log(`Config Account: ${deployInfo.configAddress}`);
    console.log(`Payment Token: ${deployInfo.paymentTokenMint}`);
    console.log(`Collection Mint: ${deployInfo.collectionMint}`);
    console.log(`Stake Authority: ${deployInfo.stakeAuthority}`);
    console.log(`Payment Token Account: ${deployInfo.paymentTokenAccount}`);
    console.log(`Collection Token Account: ${deployInfo.collectionTokenAccount}`);

  } catch (error) {
    console.error("Erro durante o deploy:", error);
    throw error;
  }
}

// Executar o script
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} 