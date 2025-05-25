const { Connection, PublicKey } = require('@solana/web3.js');
const { getMint } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

async function main() {
  try {
    // Setup da conexão com a Devnet
    const connection = new Connection(
      process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
      { commitment: 'confirmed' }
    );
    console.log("Conectado à", connection.rpcEndpoint);

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
    
    // Obter informações necessárias
    const tokenMint = new PublicKey(deployInfo.paymentTokenMint || config.paymentTokenMint || "2ADpKWBqVKCjaWY2xFkXTPo6v2Z863SefjT2GUfNHhay");
    console.log("Token Mint:", tokenMint.toBase58());
    
    // Obter informações do mint
    const mintInfo = await getMint(connection, tokenMint);
    
    console.log("\n==== Informações do Token Mint ====");
    console.log(`Supply: ${Number(mintInfo.supply) / 10**mintInfo.decimals} tokens`);
    console.log(`Decimais: ${mintInfo.decimals}`);
    console.log(`Autoridade de Mint: ${mintInfo.mintAuthority ? mintInfo.mintAuthority.toBase58() : 'Nenhuma'}`);
    console.log(`Autoridade de Congelar: ${mintInfo.freezeAuthority ? mintInfo.freezeAuthority.toBase58() : 'Nenhuma'}`);
    
    // Verificar se a nossa carteira é a autoridade de mint
    if (fs.existsSync('./wallet-dev.json')) {
      const walletData = JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8'));
      const wallet = require('@solana/web3.js').Keypair.fromSecretKey(Buffer.from(walletData));
      console.log("Nossa Wallet:", wallet.publicKey.toBase58());
      
      if (mintInfo.mintAuthority && mintInfo.mintAuthority.equals(wallet.publicKey)) {
        console.log("\n✅ Nossa wallet É a autoridade de mint! Podemos mintar tokens.");
      } else {
        console.log("\n❌ Nossa wallet NÃO é a autoridade de mint. Não podemos mintar tokens diretamente.");
        
        if (mintInfo.mintAuthority) {
          console.log(`A autoridade de mint é: ${mintInfo.mintAuthority.toBase58()}`);
        } else {
          console.log("Este token não tem autoridade de mint (foi provavelmente renunciada).");
        }
      }
    }
    
  } catch (error) {
    console.error("Erro ao verificar autoridade de mint:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  }); 