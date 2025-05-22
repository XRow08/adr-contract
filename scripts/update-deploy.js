const anchor = require("@coral-xyz/anchor");
const { 
  Connection,
  clusterApiUrl,
  PublicKey,
  Keypair
} = require("@solana/web3.js");
const fs = require('fs');
const path = require('path');

async function main() {
  try {
    // Carregar configurações de deploy
    const configPath = path.join(process.cwd(), 'config', 'deploy-config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error(`Arquivo de configuração não encontrado: ${configPath}`);
    }
    
    const deployConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    console.log("Configurações de deploy carregadas");
    
    // Configurar provider
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
      console.error("Erro ao carregar wallet:", error);
      throw new Error("É necessário ter uma wallet configurada para o deploy");
    }
    
    // Verificar se a wallet corresponde ao owner nas configurações
    if (wallet.publicKey.toString() !== deployConfig.owner) {
      console.warn("ATENÇÃO: A wallet atual não corresponde ao owner nas configurações!");
      console.warn(`Wallet atual: ${wallet.publicKey.toString()}`);
      console.warn(`Owner esperado: ${deployConfig.owner}`);
      console.warn("Continuando mesmo assim, mas isso pode causar problemas de autorização...");
    }
    
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });
    anchor.setProvider(provider);
    
    // Carregar o programa com o ID específico do deploy-config
    const idl = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(), 
          'target/idl/adr_token_mint.json'
        )
      )
    );
    
    const programId = new PublicKey(deployConfig.programId);
    const program = new anchor.Program(idl, programId, provider);
    
    console.log("\nInformações do Deploy Atualizado:");
    console.log("------------------------------");
    console.log("Provider URL:", process.env.ANCHOR_PROVIDER_URL || clusterApiUrl('devnet'));
    console.log("Program ID:", programId.toString());
    console.log("Wallet:", wallet.publicKey.toString());
    console.log("Config Account:", deployConfig.configAddress);
    console.log("Payment Token:", deployConfig.paymentTokenMint);
    console.log("Collection Mint:", deployConfig.collectionMint);
    
    // Reconfigurar o token de pagamento (opcional, apenas se necessário)
    console.log("Reconfigurando o token de pagamento...");
    try {
      await program.methods
        .setPaymentToken(new PublicKey(deployConfig.paymentTokenMint))
        .accounts({
          admin: wallet.publicKey,
          config: new PublicKey(deployConfig.configAddress),
        })
        .rpc();
      console.log("Token de pagamento reconfigurado com sucesso!");
    } catch (error) {
      console.warn("Aviso: Não foi possível reconfigurar o token de pagamento:", error.message);
    }
    
    // Reativar o sistema de staking (opcional, apenas se necessário)
    console.log("Reconfigurando o sistema de staking...");
    try {
      await program.methods
        .configureStaking(true, new anchor.BN(1000)) // 10% taxa de recompensa
        .accounts({
          admin: wallet.publicKey,
          config: new PublicKey(deployConfig.configAddress),
        })
        .rpc();
      console.log("Sistema de staking reconfigurado com sucesso!");
    } catch (error) {
      console.warn("Aviso: Não foi possível reconfigurar o sistema de staking:", error.message);
    }
    
    console.log("\nDeploy atualizado com sucesso!");
    console.log("\nResumo do deploy atualizado:");
    console.log("---------------------------");
    console.log(`Program ID: ${deployConfig.programId}`);
    console.log(`Network: ${deployConfig.network}`);
    console.log(`Owner: ${deployConfig.owner}`);
    console.log(`Config Account: ${deployConfig.configAddress}`);
    console.log(`Payment Token: ${deployConfig.paymentTokenMint}`);
    console.log(`Collection Mint: ${deployConfig.collectionMint}`);
    console.log(`Stake Authority: ${deployConfig.stakeAuthority}`);
    
  } catch (error) {
    console.error("Erro durante a atualização do deploy:", error);
    throw error;
  }
}

// Executar o script
if (require.main === module) {
  main()
    .then(() => {
      console.log("Script de atualização de deploy concluído com sucesso!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Erro durante a execução do script:", error);
      process.exit(1);
    });
} 