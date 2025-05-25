const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, createMint, mintTo } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

async function main() {
  // Quantidade a mintar
  const amount = 100000 * 10**9; // 1000 tokens
  
  console.log(`Mintando ${amount / 10**9} tokens para sua carteira...`);

  try {
    // Setup da conexão com a Devnet
    const connection = new Connection(
      process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
      { commitment: 'confirmed' }
    );
    console.log("Conectado à", connection.rpcEndpoint);

    // Carregar a wallet do usuário
    const walletKeypair = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8')))
    );
    console.log("Usando wallet:", walletKeypair.publicKey.toBase58());

    // Carregar configurações e informações do deploy
    const configPath = path.join(__dirname, '../config/deploy-config.json');
    const deployInfoPath = path.join(__dirname, '../config/deploy-info.json');
    
    let config = {};
    let deployInfo = {};
    
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    
    if (fs.existsSync(deployInfoPath)) {
      deployInfo = JSON.parse(fs.readFileSync(deployInfoPath, 'utf-8'));
    }
    
    if (Object.keys(config).length === 0 && Object.keys(deployInfo).length === 0) {
      throw new Error("Nenhum arquivo de configuração encontrado.");
    }
    
    // Obter informações necessárias
    const tokenMint = new PublicKey(deployInfo.paymentTokenMint || config.paymentTokenMint || "2ADpKWBqVKCjaWY2xFkXTPo6v2Z863SefjT2GUfNHhay");
    console.log("Token Mint:", tokenMint.toBase58());
    
    // Criar ou obter a conta de token associada para o destino
    console.log("Criando conta de token associada para destino...");
    const destinationTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      walletKeypair,
      tokenMint,
      walletKeypair.publicKey
    );
    console.log("Conta de token associada:", destinationTokenAccount.address.toBase58());
    
    // Verificar saldo atual
    try {
      const initialBalance = await connection.getTokenAccountBalance(destinationTokenAccount.address);
      console.log(`Saldo atual: ${initialBalance.value.uiAmount} tokens`);
    } catch (error) {
      console.log("Não foi possível verificar o saldo atual:", error.message);
    }
    
    // Mintar novos tokens
    console.log("\nMintando tokens...");
    
    // Encontrar a conta PDA para autoridade de mint
    // Atenção: Aqui estamos usando a wallet do usuário como autoridade de mint
    // Isso só funciona se a wallet tiver permissão para mintar
    const mintAuthority = walletKeypair.publicKey;
    
    // Mintar tokens para a conta de destino
    console.log("Mintando tokens para a conta de destino...");
    const mintToTx = await mintTo(
      connection,
      walletKeypair,
      tokenMint,
      destinationTokenAccount.address,
      walletKeypair,  // mint authority
      amount
    );
    console.log("Transação de mint enviada:", mintToTx);
    console.log(`Veja em: https://explorer.solana.com/tx/${mintToTx}?cluster=devnet`);
    
    // Verificar novo saldo
    try {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar confirmação
      const newBalance = await connection.getTokenAccountBalance(destinationTokenAccount.address);
      console.log(`\nNovo saldo: ${newBalance.value.uiAmount} tokens`);
    } catch (error) {
      console.warn("⚠️ Erro ao verificar novo saldo:", error.message);
    }
    
    console.log("\n✅ Tokens mintados com sucesso!");
    
  } catch (error) {
    if (error.logs) {
      console.error("Logs de erro do programa:");
      console.error(error.logs.join('\n'));
    }
    console.error("Erro ao mintar tokens:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  }); 