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
    
    // Carregar wallet
    let wallet;
    const keypairPath = process.env.ANCHOR_WALLET || path.join(require('os').homedir(), '.config/solana/id.json');
    
    try {
      const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
      wallet = new anchor.Wallet(Keypair.fromSecretKey(new Uint8Array(keypairData)));
      console.log("Wallet carregada do arquivo:", keypairPath);
      console.log("Endereço da wallet:", wallet.publicKey.toString());
    } catch (error) {
      console.error("Erro ao carregar wallet:", error);
      throw new Error("É necessário ter uma wallet configurada para o deploy");
    }
    
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });
    anchor.setProvider(provider);
    
    // Carregar o IDL da blockchain ou do arquivo
    console.log("Carregando IDL da blockchain...");
    const programId = new PublicKey(deployConfig.programId);
    let program;
    
    try {
      // Tentar obter o IDL da blockchain
      program = await anchor.Program.at(programId, provider);
      console.log("IDL carregado da blockchain com sucesso");
    } catch (e) {
      console.log("Erro ao carregar IDL da blockchain, tentando carregar do arquivo local...");
      
      // Usar o IDL local como fallback
      const idlPath = path.join(process.cwd(), 'idl-from-chain.json');
      if (!fs.existsSync(idlPath)) {
        throw new Error(`Arquivo IDL não encontrado: ${idlPath}`);
      }
      
      const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
      console.log("IDL carregado do arquivo local com sucesso");
      
      program = new anchor.Program(idl, programId, provider);
    }
    
    console.log("\nAtualização de configuração:");
    console.log("---------------------------");
    console.log("Program ID:", programId.toString());
    console.log("Config Account:", deployConfig.configAddress);
    console.log("Payment Token:", deployConfig.paymentTokenMint);
    
    // Definir o token de pagamento
    console.log("\nConfigurando o token de pagamento...");
    try {
      const tx = await program.methods
        .setPaymentToken(new PublicKey(deployConfig.paymentTokenMint))
        .accounts({
          admin: wallet.publicKey,
          config: new PublicKey(deployConfig.configAddress),
        })
        .rpc();
      console.log("Token de pagamento configurado com sucesso!");
      console.log("Transação:", tx);
    } catch (error) {
      console.error("Erro ao configurar token de pagamento:", error);
    }
    
    // Configurar o staking
    console.log("\nConfigurando o sistema de staking...");
    try {
      const tx = await program.methods
        .configureStaking(true, new anchor.BN(1000)) // 10% taxa base
        .accounts({
          admin: wallet.publicKey,
          config: new PublicKey(deployConfig.configAddress),
        })
        .rpc();
      console.log("Sistema de staking configurado com sucesso!");
      console.log("Transação:", tx);
    } catch (error) {
      console.error("Erro ao configurar staking:", error);
    }
    
    // Verificar configuração atual
    console.log("\nVerificando configuração atual...");
    try {
      const configAccount = await program.account.configAccount.fetch(
        new PublicKey(deployConfig.configAddress)
      );
      console.log("Configuração atual:");
      console.log("Admin:", configAccount.admin.toString());
      console.log("Payment Token:", configAccount.paymentTokenMint.toString());
      console.log("Staking Enabled:", configAccount.stakingEnabled);
      console.log("Staking Reward Rate:", configAccount.stakingRewardRate.toString());
      console.log("Max Stake Amount:", configAccount.maxStakeAmount.toString());
      console.log("Emergency Paused:", configAccount.emergencyPaused);
    } catch (error) {
      console.error("Erro ao verificar configuração atual:", error);
    }
    
  } catch (error) {
    console.error("Erro durante a atualização da configuração:", error);
  }
}

// Executar o script
if (require.main === module) {
  main()
    .then(() => {
      console.log("\nScript de atualização de configuração concluído!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Erro durante a execução do script:", error);
      process.exit(1);
    });
} 